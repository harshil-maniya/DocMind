import { Injectable, Logger } from '@nestjs/common';
import { LlmService, ChatMessage } from '@docmind/llm';
import { RetrievalService, RetrievedChunk } from '@docmind/retrieval';

export interface RagQuery {
  question: string;
  tenantId: string;
  sessionHistory?: ChatMessage[];
  topK?: number;
}

export interface SourceAttribution {
  chunkId: string;
  documentId: string;
  content: string;
  score: number;
  metadata: Record<string, unknown>;
}

export interface RagResponse {
  answer: string;
  sources: SourceAttribution[];
  confidence: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  model: string;
  retrievedChunks: number;
}

@Injectable()
export class RagService {
  private readonly logger = new Logger(RagService.name);
  private readonly maxContextTokens = 6000;
  private readonly systemPrompt = `You are DocMind, an intelligent document assistant. 
Answer questions based ONLY on the provided context documents. 
If the answer is not in the context, say "I don't have enough information in the provided documents to answer this question."
Always cite which document sections you're drawing from.
Be concise, accurate, and helpful.`;

  constructor(
    private readonly llmService: LlmService,
    private readonly retrievalService: RetrievalService,
  ) {}

  async query(input: RagQuery): Promise<RagResponse> {
    // Generate embedding for the question
    const embeddingResult = await this.llmService.embed(input.question);

    // Retrieve relevant chunks using hybrid search
    const chunks = await this.retrievalService.hybridSearch(
      embeddingResult.embedding,
      input.question,
      input.tenantId,
      { topK: input.topK ?? 10 },
    );

    this.logger.debug(
      `Retrieved ${chunks.length} chunks for query in tenant ${input.tenantId}`,
    );

    // Build context window (respecting token limits)
    const contextChunks = this.buildContextWindow(chunks);

    // Build the messages array
    const messages = this.buildMessages(
      input.question,
      contextChunks,
      input.sessionHistory,
    );

    // Call LLM
    const llmResponse = await this.llmService.chat(messages);

    // Build source attributions
    const sources: SourceAttribution[] = contextChunks.map((chunk) => ({
      chunkId: chunk.id,
      documentId: chunk.documentId,
      content: chunk.content.slice(0, 300) + (chunk.content.length > 300 ? '...' : ''),
      score: chunk.combinedScore,
      metadata: chunk.metadata as Record<string, unknown>,
    }));

    // Calculate confidence based on top chunk scores
    const confidence = this.calculateConfidence(contextChunks);

    return {
      answer: llmResponse.content,
      sources,
      confidence,
      promptTokens: llmResponse.promptTokens,
      completionTokens: llmResponse.completionTokens,
      totalTokens: llmResponse.totalTokens,
      model: llmResponse.model,
      retrievedChunks: chunks.length,
    };
  }

  async *queryStream(
    input: RagQuery,
  ): AsyncGenerator<{ type: string; data: string | object }> {
    const embeddingResult = await this.llmService.embed(input.question);

    const chunks = await this.retrievalService.hybridSearch(
      embeddingResult.embedding,
      input.question,
      input.tenantId,
      { topK: input.topK ?? 10 },
    );

    const contextChunks = this.buildContextWindow(chunks);
    const messages = this.buildMessages(
      input.question,
      contextChunks,
      input.sessionHistory,
    );

    const sources: SourceAttribution[] = contextChunks.map((chunk) => ({
      chunkId: chunk.id,
      documentId: chunk.documentId,
      content: chunk.content.slice(0, 300) + (chunk.content.length > 300 ? '...' : ''),
      score: chunk.combinedScore,
      metadata: chunk.metadata as Record<string, unknown>,
    }));

    // Emit sources first
    yield { type: 'sources', data: sources };

    // Stream the LLM response
    for await (const token of this.llmService.chatStream(messages)) {
      yield { type: 'token', data: token };
    }

    // Emit completion
    yield {
      type: 'done',
      data: { confidence: this.calculateConfidence(contextChunks) },
    };
  }

  private buildContextWindow(chunks: RetrievedChunk[]): RetrievedChunk[] {
    const selected: RetrievedChunk[] = [];
    let tokenCount = 0;

    for (const chunk of chunks) {
      const chunkTokens = this.llmService.estimateTokenCount(chunk.content);
      if (tokenCount + chunkTokens > this.maxContextTokens) {
        break;
      }
      selected.push(chunk);
      tokenCount += chunkTokens;
    }

    return selected;
  }

  private buildMessages(
    question: string,
    chunks: RetrievedChunk[],
    history?: ChatMessage[],
  ): ChatMessage[] {
    const contextText = chunks
      .map(
        (chunk, idx) =>
          `[Document ${idx + 1}] (Score: ${chunk.combinedScore.toFixed(3)})\n${chunk.content}`,
      )
      .join('\n\n---\n\n');

    const messages: ChatMessage[] = [
      { role: 'system', content: this.systemPrompt },
    ];

    if (history && history.length > 0) {
      messages.push(...history.slice(-6));
    }

    messages.push({
      role: 'user',
      content: `Context Documents:\n\n${contextText}\n\n---\n\nQuestion: ${question}`,
    });

    return messages;
  }

  private calculateConfidence(chunks: RetrievedChunk[]): number {
    if (chunks.length === 0) return 0;

    const topScores = chunks.slice(0, 3).map((c) => c.combinedScore);
    const avgTopScore =
      topScores.reduce((sum, s) => sum + s, 0) / topScores.length;

    return Math.round(avgTopScore * 100) / 100;
  }
}
