import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';

@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);

  constructor(
    @InjectQueue('document-ingestion')
    private readonly ingestionQueue: Queue,
  ) {}

  async addIngestionJob(data: {
    documentId: string;
    s3Key: string;
    tenantId: string;
    mimeType: string;
  }): Promise<void> {
    await this.ingestionQueue.add('ingest', data, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      removeOnComplete: 100,
      removeOnFail: 50,
    });
    this.logger.log(`Queued ingestion job for document ${data.documentId}`);
  }

  async getQueueStatus(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
  }> {
    const [waiting, active, completed, failed] = await Promise.all([
      this.ingestionQueue.getWaitingCount(),
      this.ingestionQueue.getActiveCount(),
      this.ingestionQueue.getCompletedCount(),
      this.ingestionQueue.getFailedCount(),
    ]);
    return { waiting, active, completed, failed };
  }
}
