import { Module } from '@nestjs/common';
import { LlmModule } from '@docmind/llm';
import { RetrievalModule } from '@docmind/retrieval';
import { RagService } from './rag.service';

@Module({
  imports: [LlmModule, RetrievalModule],
  providers: [RagService],
  exports: [RagService],
})
export class RagModule {}
