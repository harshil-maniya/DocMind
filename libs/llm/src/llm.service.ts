import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import OpenAI from 'openai';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmResponse {
  content: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  model: string;
}

export interface EmbeddingResponse {
  embedding: number[];
  tokens: number;
}

@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);
  private readonly client: OpenAI;
  private readonly chatModel: string;
  private readonly embeddingModel: string;
  private readonly maxRetries = 3;
  private readonly retryDelayMs = 1000;

  constructor() {
    this.client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    this.chatModel = process.env.OPENAI_CHAT_MODEL || 'gpt-4o';
    this.embeddingModel =
      process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';
  }

  async chat(
    messages: ChatMessage[],
    options?: {
      temperature?: number;
      maxTokens?: number;
      model?: string;
    },
  ): Promise<LlmResponse> {
    const model = options?.model || this.chatModel;
    const temperature =
      options?.temperature ?? Number(process.env.OPENAI_TEMPERATURE ?? 0.7);
    const maxTokens =
      options?.maxTokens ?? Number(process.env.OPENAI_MAX_TOKENS ?? 4096);

    return this.withRetry(async () => {
      const response = await this.client.chat.completions.create({
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
      });

      const choice = response.choices[0];
      if (!choice?.message?.content) {
        throw new Error('Empty response from LLM');
      }

      return {
        content: choice.message.content,
        promptTokens: response.usage?.prompt_tokens ?? 0,
        completionTokens: response.usage?.completion_tokens ?? 0,
        totalTokens: response.usage?.total_tokens ?? 0,
        model: response.model,
      };
    });
  }

  async *chatStream(
    messages: ChatMessage[],
    options?: {
      temperature?: number;
      maxTokens?: number;
      model?: string;
    },
  ): AsyncGenerator<string> {
    const model = options?.model || this.chatModel;
    const temperature =
      options?.temperature ?? Number(process.env.OPENAI_TEMPERATURE ?? 0.7);
    const maxTokens =
      options?.maxTokens ?? Number(process.env.OPENAI_MAX_TOKENS ?? 4096);

    try {
      const stream = await this.client.chat.completions.create({
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
        stream: true,
      });

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content;
        if (delta) {
          yield delta;
        }
      }
    } catch (error) {
      this.logger.error('LLM stream error', error);
      throw new ServiceUnavailableException('LLM streaming failed');
    }
  }

  async embed(text: string): Promise<EmbeddingResponse> {
    return this.withRetry(async () => {
      const response = await this.client.embeddings.create({
        model: this.embeddingModel,
        input: text,
      });

      return {
        embedding: response.data[0].embedding,
        tokens: response.usage.total_tokens,
      };
    });
  }

  async embedBatch(texts: string[]): Promise<EmbeddingResponse[]> {
    return this.withRetry(async () => {
      const response = await this.client.embeddings.create({
        model: this.embeddingModel,
        input: texts,
      });

      return response.data.map((item, idx) => ({
        embedding: item.embedding,
        tokens: Math.ceil(response.usage.total_tokens / texts.length),
      }));
    });
  }

  estimateTokenCount(text: string): number {
    // Rough approximation: ~4 characters per token for English text
    return Math.ceil(text.length / 4);
  }

  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: Error = new Error('Unknown error');

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;
        this.logger.warn(
          `LLM attempt ${attempt}/${this.maxRetries} failed: ${lastError.message}`,
        );

        if (attempt < this.maxRetries) {
          await this.sleep(this.retryDelayMs * attempt);
        }
      }
    }

    this.logger.error(`LLM failed after ${this.maxRetries} retries`, lastError);
    throw new ServiceUnavailableException(
      `LLM service unavailable: ${lastError.message}`,
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
