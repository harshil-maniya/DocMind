import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { ChatSession } from './chat/chat-session.entity';
import { ChatDto, ChatResponseDto } from './dto/chat.dto';
import { RagService } from '@docmind/rag';
import { CacheService } from '@docmind/cache';
import { LlmService } from '@docmind/llm';
import { IRequestUser } from '@docmind/common';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    @InjectRepository(ChatSession)
    private readonly chatSessionRepository: Repository<ChatSession>,
    private readonly ragService: RagService,
    private readonly cacheService: CacheService,
    private readonly llmService: LlmService,
  ) {}

  async chat(dto: ChatDto, user: IRequestUser): Promise<ChatResponseDto> {
    const startTime = Date.now();
    const sessionId = dto.sessionId || uuidv4();

    // Get session history
    const history = await this.getSessionHistory(sessionId, user.tenantId);
    const historyMessages = history.slice(-6).map((h) => ({
      role: h.role as 'user' | 'assistant',
      content: h.content,
    }));

    // Check semantic cache
    const embeddingResult = await this.llmService.embed(dto.message);
    const cached = await this.cacheService.get(
      dto.message,
      embeddingResult.embedding,
    );

    let answer: string;
    let sources: ChatResponseDto['sources'] = [];
    let confidence = 0;
    let promptTokens = 0;
    let completionTokens = 0;
    let totalTokens = 0;
    let model = process.env.OPENAI_CHAT_MODEL || 'gpt-4o';
    let cacheHit = false;

    if (cached) {
      this.logger.debug(`Cache hit for session ${sessionId}`);
      answer = cached;
      cacheHit = true;
      totalTokens = this.llmService.estimateTokenCount(answer);
    } else {
      const ragResponse = await this.ragService.query({
        question: dto.message,
        tenantId: user.tenantId,
        sessionHistory: historyMessages,
        topK: dto.options?.topK,
      });

      answer = ragResponse.answer;
      sources = ragResponse.sources;
      confidence = ragResponse.confidence;
      promptTokens = ragResponse.promptTokens;
      completionTokens = ragResponse.completionTokens;
      totalTokens = ragResponse.totalTokens;
      model = ragResponse.model;

      // Store in cache
      await this.cacheService.set(
        dto.message,
        answer,
        embeddingResult.embedding,
        { tenantId: user.tenantId },
      );
    }

    const latencyMs = Date.now() - startTime;

    // Store user message and AI response in session
    await this.chatSessionRepository.save([
      this.chatSessionRepository.create({
        sessionId,
        tenantId: user.tenantId,
        userId: user.sub,
        role: 'user',
        content: dto.message,
        tokensUsed: 0,
      }),
      this.chatSessionRepository.create({
        sessionId,
        tenantId: user.tenantId,
        userId: user.sub,
        role: 'assistant',
        content: answer,
        tokensUsed: totalTokens,
        modelUsed: model,
        sources,
        confidence,
        cacheHit,
        latencyMs,
      }),
    ]);

    return {
      sessionId,
      answer,
      sources,
      confidence,
      tokens: {
        prompt: promptTokens,
        completion: completionTokens,
        total: totalTokens,
      },
      model,
      cacheHit,
      latencyMs,
    };
  }

  async *chatStream(
    dto: ChatDto,
    user: IRequestUser,
  ): AsyncGenerator<{ type: string; data: string | object }> {
    const sessionId = dto.sessionId || uuidv4();

    const history = await this.getSessionHistory(sessionId, user.tenantId);
    const historyMessages = history.slice(-6).map((h) => ({
      role: h.role as 'user' | 'assistant',
      content: h.content,
    }));

    // Store user message immediately
    await this.chatSessionRepository.save(
      this.chatSessionRepository.create({
        sessionId,
        tenantId: user.tenantId,
        userId: user.sub,
        role: 'user',
        content: dto.message,
        tokensUsed: 0,
      }),
    );

    yield { type: 'sessionId', data: sessionId };

    let fullAnswer = '';
    const startTime = Date.now();

    for await (const event of this.ragService.queryStream({
      question: dto.message,
      tenantId: user.tenantId,
      sessionHistory: historyMessages,
    })) {
      yield event;
      if (event.type === 'token') {
        fullAnswer += event.data as string;
      }
    }

    const latencyMs = Date.now() - startTime;
    const totalTokens = this.llmService.estimateTokenCount(fullAnswer);

    await this.chatSessionRepository.save(
      this.chatSessionRepository.create({
        sessionId,
        tenantId: user.tenantId,
        userId: user.sub,
        role: 'assistant',
        content: fullAnswer,
        tokensUsed: totalTokens,
        latencyMs,
      }),
    );
  }

  async getHistory(
    sessionId: string,
    tenantId: string,
  ): Promise<ChatSession[]> {
    return this.getSessionHistory(sessionId, tenantId);
  }

  private async getSessionHistory(
    sessionId: string,
    tenantId: string,
  ): Promise<ChatSession[]> {
    return this.chatSessionRepository.find({
      where: { sessionId, tenantId },
      order: { createdAt: 'ASC' },
      take: 50,
    });
  }
}
