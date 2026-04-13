import { Processor, Process } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import {
  S3Client,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';
import { Document } from '../entities/document.entity';
import { Chunk } from '../entities/chunk.entity';
import { LlmService } from '@docmind/llm';
import { DocumentStatus } from '@docmind/common';

interface IngestionJobData {
  documentId: string;
  s3Key: string;
  tenantId: string;
  mimeType: string;
}

@Processor('document-ingestion')
export class IngestionProcessor {
  private readonly logger = new Logger(IngestionProcessor.name);
  private readonly s3Client: S3Client;
  private readonly chunkSize: number;
  private readonly chunkOverlap: number;

  constructor(
    @InjectRepository(Document)
    private readonly documentRepository: Repository<Document>,
    @InjectRepository(Chunk)
    private readonly chunkRepository: Repository<Chunk>,
    private readonly llmService: LlmService,
    private readonly dataSource: DataSource,
  ) {
    this.s3Client = new S3Client({
      region: process.env.AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
      },
    });
    this.chunkSize = Number(process.env.CHUNK_SIZE_TOKENS ?? 512);
    this.chunkOverlap = Number(process.env.CHUNK_OVERLAP_TOKENS ?? 50);
  }

  @Process('ingest')
  async handleIngest(job: Job<IngestionJobData>): Promise<void> {
    const { documentId, s3Key, tenantId } = job.data;
    this.logger.log(`Processing document ${documentId}`);

    await this.documentRepository.update(documentId, {
      status: DocumentStatus.PROCESSING,
    });

    try {
      // Ensure pgvector extension and chunks table setup
      await this.ensureVectorSetup();

      // Download from S3
      const content = await this.downloadFromS3(s3Key);

      // Split into chunks
      const chunks = this.splitIntoChunks(content, s3Key);
      this.logger.log(`Split document into ${chunks.length} chunks`);

      // Generate embeddings in batches of 20
      const batchSize = 20;
      let processedChunks = 0;

      for (let i = 0; i < chunks.length; i += batchSize) {
        const batch = chunks.slice(i, i + batchSize);
        const texts = batch.map((c) => c.content);

        const embeddings = await this.llmService.embedBatch(texts);

        for (let j = 0; j < batch.length; j++) {
          const chunk = batch[j];
          const embedding = embeddings[j].embedding;
          const chunkId = uuidv4();

          await this.dataSource.query(
            `INSERT INTO chunks (id, document_id, tenant_id, content, embedding, chunk_index, token_count, metadata, created_at)
             VALUES ($1, $2, $3, $4, $5::vector, $6, $7, $8, NOW())`,
            [
              chunkId,
              documentId,
              tenantId,
              chunk.content,
              JSON.stringify(embedding),
              chunk.index,
              chunk.tokenCount,
              JSON.stringify(chunk.metadata),
            ],
          );
          processedChunks++;
        }

        await job.progress(Math.round((processedChunks / chunks.length) * 100));
      }

      await this.documentRepository.update(documentId, {
        status: DocumentStatus.READY,
        chunkCount: chunks.length,
      });

      this.logger.log(
        `Document ${documentId} ingested successfully with ${chunks.length} chunks`,
      );
    } catch (error) {
      this.logger.error(`Failed to ingest document ${documentId}`, error);
      await this.documentRepository.update(documentId, {
        status: DocumentStatus.FAILED,
        errorMessage: (error as Error).message,
      });
      throw error;
    }
  }

  private async ensureVectorSetup(): Promise<void> {
    await this.dataSource.query(
      `CREATE EXTENSION IF NOT EXISTS vector`,
    );

    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS chunks (
        id UUID PRIMARY KEY,
        document_id UUID NOT NULL,
        tenant_id UUID NOT NULL,
        content TEXT NOT NULL,
        embedding vector(1536),
        chunk_index INT NOT NULL,
        token_count INT NOT NULL,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    await this.dataSource.query(`
      CREATE INDEX IF NOT EXISTS idx_chunks_tenant_id ON chunks (tenant_id)
    `);

    await this.dataSource.query(`
      CREATE INDEX IF NOT EXISTS idx_chunks_document_id ON chunks (document_id)
    `);

    await this.dataSource.query(`
      CREATE INDEX IF NOT EXISTS idx_chunks_embedding ON chunks 
      USING ivfflat (embedding vector_cosine_ops) 
      WITH (lists = 100)
    `).catch(() => {
      // Index may already exist or table may not have enough data yet
    });
  }

  private async downloadFromS3(s3Key: string): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME || '',
      Key: s3Key,
    });

    const response = await this.s3Client.send(command);
    const stream = response.Body as NodeJS.ReadableStream;

    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
      stream.on('error', reject);
    });
  }

  private splitIntoChunks(
    text: string,
    source: string,
  ): Array<{
    content: string;
    index: number;
    tokenCount: number;
    metadata: Record<string, unknown>;
  }> {
    const words = text.split(/\s+/).filter((w) => w.length > 0);
    const avgTokensPerWord = 1.3;
    const wordsPerChunk = Math.floor(this.chunkSize / avgTokensPerWord);
    const overlapWords = Math.floor(this.chunkOverlap / avgTokensPerWord);

    const chunks: Array<{
      content: string;
      index: number;
      tokenCount: number;
      metadata: Record<string, unknown>;
    }> = [];

    let start = 0;
    let index = 0;

    while (start < words.length) {
      const end = Math.min(start + wordsPerChunk, words.length);
      const chunkWords = words.slice(start, end);
      const content = chunkWords.join(' ');
      const tokenCount = this.llmService.estimateTokenCount(content);

      chunks.push({
        content,
        index,
        tokenCount,
        metadata: {
          source,
          wordStart: start,
          wordEnd: end,
          chunkIndex: index,
        },
      });

      start += wordsPerChunk - overlapWords;
      index++;

      if (end === words.length) break;
    }

    return chunks;
  }
}
