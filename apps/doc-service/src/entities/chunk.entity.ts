import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('chunks')
export class Chunk {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'document_id', type: 'uuid' })
  documentId: string;

  @Index()
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ type: 'text' })
  content: string;

  @Column({ name: 'chunk_index', type: 'int' })
  chunkIndex: number;

  @Column({ name: 'token_count', type: 'int' })
  tokenCount: number;

  @Column({ type: 'jsonb', default: '{}' })
  metadata: Record<string, unknown>;

  // Vector column is managed via raw SQL (pgvector)
  // No ORM column decorator for embedding

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
