import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, Between, MoreThanOrEqual, LessThanOrEqual } from 'typeorm';
import { QueryMetric } from './entities/query-metric.entity';
import { AnalyticsFilterDto } from './dto/analytics.dto';

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);
  private readonly costPer1kInput: number;
  private readonly costPer1kOutput: number;

  constructor(
    @InjectRepository(QueryMetric)
    private readonly metricsRepository: Repository<QueryMetric>,
    private readonly dataSource: DataSource,
  ) {
    this.costPer1kInput = Number(
      process.env.OPENAI_COST_PER_1K_INPUT_TOKENS ?? 0.01,
    );
    this.costPer1kOutput = Number(
      process.env.OPENAI_COST_PER_1K_OUTPUT_TOKENS ?? 0.03,
    );
  }

  async recordMetric(data: {
    tenantId: string;
    userId?: string;
    queryType: 'chat' | 'nl-sql';
    tokensInput: number;
    tokensOutput: number;
    latencyMs: number;
    cacheHit: boolean;
    model: string;
    sessionId?: string;
    success?: boolean;
  }): Promise<QueryMetric> {
    const totalTokens = data.tokensInput + data.tokensOutput;
    const costUsd =
      (data.tokensInput / 1000) * this.costPer1kInput +
      (data.tokensOutput / 1000) * this.costPer1kOutput;

    const metric = this.metricsRepository.create({
      ...data,
      tokensTotal: totalTokens,
      costUsd,
      success: data.success ?? true,
    });

    return this.metricsRepository.save(metric);
  }

  async getUsageStats(
    tenantId: string,
    filters: AnalyticsFilterDto,
  ): Promise<{
    totalRequests: number;
    totalTokens: number;
    tokensByType: Record<string, number>;
    requestsByDay: Array<{ date: string; count: number; tokens: number }>;
    topModels: Array<{ model: string; count: number }>;
  }> {
    const where = this.buildWhereClause(tenantId, filters);

    const [totalRequests, tokensByType, dailyStats, topModels] =
      await Promise.all([
        this.metricsRepository.count({ where }),
        this.dataSource.query(
          `SELECT query_type, SUM(tokens_total) as tokens
           FROM query_metrics
           WHERE tenant_id = $1
           ${this.buildDateFilter(filters, 2)}
           GROUP BY query_type`,
          [tenantId, ...this.buildDateParams(filters)],
        ),
        this.dataSource.query(
          `SELECT DATE(created_at) as date, COUNT(*) as count, SUM(tokens_total) as tokens
           FROM query_metrics
           WHERE tenant_id = $1
           ${this.buildDateFilter(filters, 2)}
           GROUP BY DATE(created_at)
           ORDER BY date DESC
           LIMIT 30`,
          [tenantId, ...this.buildDateParams(filters)],
        ),
        this.dataSource.query(
          `SELECT model, COUNT(*) as count
           FROM query_metrics
           WHERE tenant_id = $1
           ${this.buildDateFilter(filters, 2)}
           GROUP BY model
           ORDER BY count DESC
           LIMIT 10`,
          [tenantId, ...this.buildDateParams(filters)],
        ),
      ]);

    const totalTokens = tokensByType.reduce(
      (sum: number, r: any) => sum + Number(r.tokens),
      0,
    );

    const tokensByTypeMap: Record<string, number> = {};
    for (const row of tokensByType) {
      tokensByTypeMap[row.query_type] = Number(row.tokens);
    }

    return {
      totalRequests,
      totalTokens,
      tokensByType: tokensByTypeMap,
      requestsByDay: dailyStats.map((r: any) => ({
        date: r.date,
        count: Number(r.count),
        tokens: Number(r.tokens),
      })),
      topModels: topModels.map((r: any) => ({
        model: r.model,
        count: Number(r.count),
      })),
    };
  }

  async getCostStats(
    tenantId: string,
    filters: AnalyticsFilterDto,
  ): Promise<{
    totalCostUsd: number;
    costByType: Record<string, number>;
    costByDay: Array<{ date: string; cost: number }>;
    estimatedMonthlyUsd: number;
  }> {
    const [totalCost, costByType, costByDay] = await Promise.all([
      this.dataSource.query(
        `SELECT SUM(cost_usd) as total FROM query_metrics
         WHERE tenant_id = $1
         ${this.buildDateFilter(filters, 2)}`,
        [tenantId, ...this.buildDateParams(filters)],
      ),
      this.dataSource.query(
        `SELECT query_type, SUM(cost_usd) as cost
         FROM query_metrics
         WHERE tenant_id = $1
         ${this.buildDateFilter(filters, 2)}
         GROUP BY query_type`,
        [tenantId, ...this.buildDateParams(filters)],
      ),
      this.dataSource.query(
        `SELECT DATE(created_at) as date, SUM(cost_usd) as cost
         FROM query_metrics
         WHERE tenant_id = $1
         ${this.buildDateFilter(filters, 2)}
         GROUP BY DATE(created_at)
         ORDER BY date DESC
         LIMIT 30`,
        [tenantId, ...this.buildDateParams(filters)],
      ),
    ]);

    const totalCostUsd = Number(totalCost[0]?.total ?? 0);

    const costByTypeMap: Record<string, number> = {};
    for (const row of costByType) {
      costByTypeMap[row.query_type] = Number(row.cost);
    }

    // Estimate monthly cost based on last 7 days average
    const last7Days = costByDay.slice(0, 7);
    const avgDailyCost =
      last7Days.length > 0
        ? last7Days.reduce((sum: number, d: any) => sum + Number(d.cost), 0) /
          last7Days.length
        : 0;
    const estimatedMonthlyUsd = avgDailyCost * 30;

    return {
      totalCostUsd,
      costByType: costByTypeMap,
      costByDay: costByDay.map((r: any) => ({
        date: r.date,
        cost: Number(r.cost),
      })),
      estimatedMonthlyUsd,
    };
  }

  async getLatencyStats(
    tenantId: string,
    filters: AnalyticsFilterDto,
  ): Promise<{
    p50Ms: number;
    p95Ms: number;
    p99Ms: number;
    avgMs: number;
    minMs: number;
    maxMs: number;
    latencyByType: Record<string, { p50: number; p95: number; avg: number }>;
  }> {
    const params = [tenantId, ...this.buildDateParams(filters)];

    const [percentiles, byType] = await Promise.all([
      this.dataSource.query(
        `SELECT 
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY latency_ms) as p50,
          PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms) as p95,
          PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY latency_ms) as p99,
          AVG(latency_ms) as avg,
          MIN(latency_ms) as min,
          MAX(latency_ms) as max
         FROM query_metrics
         WHERE tenant_id = $1
         ${this.buildDateFilter(filters, 2)}`,
        params,
      ),
      this.dataSource.query(
        `SELECT 
          query_type,
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY latency_ms) as p50,
          PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms) as p95,
          AVG(latency_ms) as avg
         FROM query_metrics
         WHERE tenant_id = $1
         ${this.buildDateFilter(filters, 2)}
         GROUP BY query_type`,
        params,
      ),
    ]);

    const p = percentiles[0] || {};
    const latencyByType: Record<
      string,
      { p50: number; p95: number; avg: number }
    > = {};
    for (const row of byType) {
      latencyByType[row.query_type] = {
        p50: Math.round(Number(row.p50)),
        p95: Math.round(Number(row.p95)),
        avg: Math.round(Number(row.avg)),
      };
    }

    return {
      p50Ms: Math.round(Number(p.p50 ?? 0)),
      p95Ms: Math.round(Number(p.p95 ?? 0)),
      p99Ms: Math.round(Number(p.p99 ?? 0)),
      avgMs: Math.round(Number(p.avg ?? 0)),
      minMs: Math.round(Number(p.min ?? 0)),
      maxMs: Math.round(Number(p.max ?? 0)),
      latencyByType,
    };
  }

  async getCacheStats(
    tenantId: string,
    filters: AnalyticsFilterDto,
  ): Promise<{
    totalRequests: number;
    cacheHits: number;
    cacheMisses: number;
    hitRate: number;
    cacheHitsByDay: Array<{ date: string; hits: number; misses: number; hitRate: number }>;
  }> {
    const params = [tenantId, ...this.buildDateParams(filters)];

    const [overall, byDay] = await Promise.all([
      this.dataSource.query(
        `SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN cache_hit = true THEN 1 ELSE 0 END) as hits
         FROM query_metrics
         WHERE tenant_id = $1
         ${this.buildDateFilter(filters, 2)}`,
        params,
      ),
      this.dataSource.query(
        `SELECT 
          DATE(created_at) as date,
          COUNT(*) as total,
          SUM(CASE WHEN cache_hit = true THEN 1 ELSE 0 END) as hits
         FROM query_metrics
         WHERE tenant_id = $1
         ${this.buildDateFilter(filters, 2)}
         GROUP BY DATE(created_at)
         ORDER BY date DESC
         LIMIT 30`,
        params,
      ),
    ]);

    const total = Number(overall[0]?.total ?? 0);
    const hits = Number(overall[0]?.hits ?? 0);
    const misses = total - hits;
    const hitRate = total > 0 ? hits / total : 0;

    return {
      totalRequests: total,
      cacheHits: hits,
      cacheMisses: misses,
      hitRate: Math.round(hitRate * 10000) / 100,
      cacheHitsByDay: byDay.map((r: any) => {
        const dayTotal = Number(r.total);
        const dayHits = Number(r.hits);
        return {
          date: r.date,
          hits: dayHits,
          misses: dayTotal - dayHits,
          hitRate: dayTotal > 0 ? Math.round((dayHits / dayTotal) * 10000) / 100 : 0,
        };
      }),
    };
  }

  private buildWhereClause(tenantId: string, filters: AnalyticsFilterDto) {
    const where: Record<string, unknown> = { tenantId };
    if (filters.startDate && filters.endDate) {
      where.createdAt = Between(
        new Date(filters.startDate),
        new Date(filters.endDate),
      );
    } else if (filters.startDate) {
      where.createdAt = MoreThanOrEqual(new Date(filters.startDate));
    } else if (filters.endDate) {
      where.createdAt = LessThanOrEqual(new Date(filters.endDate));
    }
    if (filters.queryType) {
      where.queryType = filters.queryType;
    }
    return where;
  }

  private buildDateFilter(filters: AnalyticsFilterDto, startIdx: number): string {
    const conditions: string[] = [];
    if (filters.startDate) {
      conditions.push(`AND created_at >= $${startIdx++}`);
    }
    if (filters.endDate) {
      conditions.push(`AND created_at <= $${startIdx++}`);
    }
    if (filters.queryType) {
      conditions.push(`AND query_type = $${startIdx++}`);
    }
    return conditions.join(' ');
  }

  private buildDateParams(filters: AnalyticsFilterDto): unknown[] {
    const params: unknown[] = [];
    if (filters.startDate) params.push(new Date(filters.startDate));
    if (filters.endDate) params.push(new Date(filters.endDate));
    if (filters.queryType) params.push(filters.queryType);
    return params;
  }
}
