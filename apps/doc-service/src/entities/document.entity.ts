import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { DocumentStatus } from '@docmind/common';

@Entity('documents')
export class Document {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ type: 'varchar', length: 500 })
  filename: string;

  @Column({ name: 'original_name', type: 'varchar', length: 500 })
  originalName: string;

  @Column({ name: 's3_key', type: 'varchar', length: 1000 })
  s3Key: string;

  @Column({ name: 's3_bucket', type: 'varchar', length: 255 })
  s3Bucket: string;

  @Column({
    type: 'enum',
    enum: DocumentStatus,
    default: DocumentStatus.PENDING,
  })
  status: DocumentStatus;

  @Column({ name: 'mime_type', type: 'varchar', length: 255 })
  mimeType: string;

  @Column({ name: 'file_size', type: 'bigint' })
  fileSize: number;

  @Column({ name: 'uploaded_by', type: 'uuid' })
  uploadedBy: string;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string | null;

  @Column({ name: 'chunk_count', type: 'int', default: 0 })
  chunkCount: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
