export enum DocumentStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  READY = 'ready',
  FAILED = 'failed',
}

export interface IDocument {
  id: string;
  tenantId: string;
  filename: string;
  originalName: string;
  s3Key: string;
  s3Bucket: string;
  status: DocumentStatus;
  mimeType: string;
  fileSize: number;
  createdAt: Date;
}

export interface IChunk {
  id: string;
  documentId: string;
  tenantId: string;
  content: string;
  chunkIndex: number;
  tokenCount: number;
  metadata: Record<string, unknown>;
  score?: number;
  createdAt: Date;
}
