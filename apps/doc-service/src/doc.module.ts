import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { MulterModule } from '@nestjs/platform-express';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { DocController } from './doc.controller';
import { DocService } from './doc.service';
import { Document } from './entities/document.entity';
import { Chunk } from './entities/chunk.entity';
import { IngestionService } from './ingestion/ingestion.service';
import { IngestionProcessor } from './ingestion/ingestion.processor';
import { LlmModule } from '@docmind/llm';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([Document, Chunk]),
    BullModule.registerQueue({
      name: 'document-ingestion',
    }),
    MulterModule.register({
      limits: { fileSize: 50 * 1024 * 1024 },
    }),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'fallback-secret',
      signOptions: { expiresIn: process.env.JWT_EXPIRES_IN || '15m' },
    }),
    LlmModule,
  ],
  controllers: [DocController],
  providers: [DocService, IngestionService, IngestionProcessor, JwtStrategy, JwtAuthGuard],
  exports: [DocService],
})
export class DocModule {}
