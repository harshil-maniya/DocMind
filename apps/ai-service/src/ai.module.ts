import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { ChatSession } from './chat/chat-session.entity';
import { LlmModule } from '@docmind/llm';
import { SemanticCacheModule } from '@docmind/cache';
import { RagModule } from '@docmind/rag';
import { RetrievalModule } from '@docmind/retrieval';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([ChatSession]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'fallback-secret',
      signOptions: { expiresIn: process.env.JWT_EXPIRES_IN || '15m' },
    }),
    LlmModule,
    SemanticCacheModule,
    RetrievalModule,
    RagModule,
  ],
  controllers: [AiController],
  providers: [AiService, JwtStrategy, JwtAuthGuard],
  exports: [AiService],
})
export class AiModule {}
