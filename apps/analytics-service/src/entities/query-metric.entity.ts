import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export type QueryType = 'chat' | 'nl-sql';

@Entity('query_metrics')
export class QueryMetric {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId: string | null;

  @Column({
    name: 'query_type',
    type: 'enum',
    enum: ['chat', 'nl-sql'],
    default: 'chat',
  })
  queryType: QueryType;

  @Column({ name: 'tokens_input', type: 'int', default: 0 })
  tokensInput: number;

  @Column({ name: 'tokens_output', type: 'int', default: 0 })
  tokensOutput: number;

  @Column({ name: 'tokens_total', type: 'int', default: 0 })
  tokensTotal: number;

  @Column({
    name: 'cost_usd',
    type: 'decimal',
    precision: 10,
    scale: 6,
    default: 0,
  })
  costUsd: number;

  @Column({ name: 'latency_ms', type: 'int', default: 0 })
  latencyMs: number;

  @Column({ name: 'cache_hit', type: 'boolean', default: false })
  cacheHit: boolean;

  @Column({ name: 'model', type: 'varchar', length: 100 })
  model: string;

  @Column({ name: 'session_id', type: 'varchar', length: 255, nullable: true })
  sessionId: string | null;

  @Column({ name: 'success', type: 'boolean', default: true })
  success: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
