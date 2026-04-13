import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { TenantPlan } from '@docmind/common';

@Entity('tenants')
export class Tenant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 255, unique: true })
  name: string;

  @Column({
    type: 'enum',
    enum: TenantPlan,
    default: TenantPlan.FREE,
  })
  plan: TenantPlan;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'max_documents', type: 'int', default: 100 })
  maxDocuments: number;

  @Column({ name: 'max_users', type: 'int', default: 5 })
  maxUsers: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
