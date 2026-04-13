import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  IsNumber,
  Min,
  Max,
  IsBoolean,
} from 'class-validator';

export class ChatDto {
  @IsString()
  @IsNotEmpty()
  message: string;

  @IsOptional()
  @IsString()
  sessionId?: string;

  @IsOptional()
  options?: {
    temperature?: number;
    maxTokens?: number;
    topK?: number;
    model?: string;
  };
}

export class ChatResponseDto {
  sessionId: string;
  answer: string;
  sources: Array<{
    chunkId: string;
    documentId: string;
    content: string;
    score: number;
  }>;
  confidence: number;
  tokens: {
    prompt: number;
    completion: number;
    total: number;
  };
  model: string;
  cacheHit: boolean;
  latencyMs: number;
}
