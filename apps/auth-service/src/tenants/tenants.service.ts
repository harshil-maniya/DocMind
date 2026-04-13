import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tenant } from './tenant.entity';
import { TenantPlan } from '@docmind/common';

@Injectable()
export class TenantsService {
  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
  ) {}

  async create(data: { name: string; plan?: TenantPlan }): Promise<Tenant> {
    const existing = await this.findByName(data.name);
    if (existing) {
      throw new ConflictException(`Tenant with name "${data.name}" already exists`);
    }

    const plan = data.plan ?? TenantPlan.FREE;
    const limits = this.getPlanLimits(plan);

    const tenant = this.tenantRepository.create({
      name: data.name,
      plan,
      ...limits,
    });
    return this.tenantRepository.save(tenant);
  }

  async findById(id: string): Promise<Tenant> {
    const tenant = await this.tenantRepository.findOne({ where: { id } });
    if (!tenant) {
      throw new NotFoundException(`Tenant with id ${id} not found`);
    }
    return tenant;
  }

  async findByName(name: string): Promise<Tenant | null> {
    return this.tenantRepository.findOne({ where: { name } });
  }

  async update(id: string, data: Partial<Tenant>): Promise<Tenant> {
    const tenant = await this.findById(id);
    Object.assign(tenant, data);
    return this.tenantRepository.save(tenant);
  }

  private getPlanLimits(
    plan: TenantPlan,
  ): { maxDocuments: number; maxUsers: number } {
    switch (plan) {
      case TenantPlan.FREE:
        return { maxDocuments: 100, maxUsers: 5 };
      case TenantPlan.PRO:
        return { maxDocuments: 1000, maxUsers: 25 };
      case TenantPlan.ENTERPRISE:
        return { maxDocuments: 100000, maxUsers: 1000 };
    }
  }
}
