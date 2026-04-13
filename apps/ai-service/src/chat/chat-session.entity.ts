import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export type ChatRole = 'user' | 'assistant' | 'system';

@Entity('chat_sessions')
export class ChatSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'session_id', type: 'varchar', length: 255 })
  sessionId: string;

  @Index()
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({
    type: 'enum',
    enum: ['user', 'assistant', 'system'],
    default: 'user',
  })
  role: ChatRole;

  @Column({ type: 'text' })
  content: string;

  @Column({ name: 'tokens_used', type: 'int', default: 0 })
  tokensUsed: number;

  @Column({ name: 'model_used', type: 'varchar', length: 100, nullable: true })
  modelUsed: string | null;

  @Column({ name: 'sources', type: 'jsonb', nullable: true })
  sources: unknown[] | null;

  @Column({ name: 'confidence', type: 'float', nullable: true })
  confidence: number | null;

  @Column({ name: 'cache_hit', type: 'boolean', default: false })
  cacheHit: boolean;

  @Column({ name: 'latency_ms', type: 'int', nullable: true })
  latencyMs: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
