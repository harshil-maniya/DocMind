import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import Redis from 'ioredis';

interface CacheEntry {
  response: string;
  embedding: number[];
  promptHash: string;
  createdAt: number;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);
  private readonly redis: Redis;
  private readonly similarityThreshold: number;
  private readonly ttlSeconds: number;
  private readonly CACHE_PREFIX = 'semantic_cache:';
  private readonly EMBEDDING_INDEX_KEY = 'semantic_cache_index';

  constructor() {
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: Number(process.env.REDIS_PORT ?? 6379),
      password: process.env.REDIS_PASSWORD || undefined,
      db: Number(process.env.REDIS_DB ?? 0),
      lazyConnect: true,
    });

    this.redis.on('error', (err) => {
      this.logger.error('Redis connection error', err);
    });

    this.similarityThreshold = Number(
      process.env.CACHE_SIMILARITY_THRESHOLD ?? 0.95,
    );
    this.ttlSeconds = Number(process.env.CACHE_TTL_SECONDS ?? 3600);
  }

  hashPrompt(prompt: string): string {
    return createHash('sha256').update(prompt.trim().toLowerCase()).digest('hex');
  }

  async get(
    prompt: string,
    queryEmbedding: number[],
  ): Promise<string | null> {
    try {
      const exactHash = this.hashPrompt(prompt);
      const exactKey = `${this.CACHE_PREFIX}${exactHash}`;

      const exactResult = await this.redis.get(exactKey);
      if (exactResult) {
        const entry: CacheEntry = JSON.parse(exactResult);
        this.logger.debug(`Cache hit (exact): ${exactHash}`);
        return entry.response;
      }

      // Semantic similarity check
      const indexData = await this.redis.get(this.EMBEDDING_INDEX_KEY);
      if (!indexData) {
        return null;
      }

      const index: Array<{ hash: string; embedding: number[] }> =
        JSON.parse(indexData);

      let bestSimilarity = 0;
      let bestHash: string | null = null;

      for (const item of index) {
        const similarity = this.cosineSimilarity(queryEmbedding, item.embedding);
        if (similarity > bestSimilarity) {
          bestSimilarity = similarity;
          bestHash = item.hash;
        }
      }

      if (bestSimilarity >= this.similarityThreshold && bestHash) {
        const semanticKey = `${this.CACHE_PREFIX}${bestHash}`;
        const cachedData = await this.redis.get(semanticKey);
        if (cachedData) {
          const entry: CacheEntry = JSON.parse(cachedData);
          this.logger.debug(
            `Cache hit (semantic, similarity=${bestSimilarity.toFixed(3)}): ${bestHash}`,
          );
          return entry.response;
        }
      }

      return null;
    } catch (error) {
      this.logger.warn('Cache get error (non-fatal)', error);
      return null;
    }
  }

  async set(
    prompt: string,
    response: string,
    embedding: number[],
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    try {
      const hash = this.hashPrompt(prompt);
      const key = `${this.CACHE_PREFIX}${hash}`;

      const entry: CacheEntry = {
        response,
        embedding,
        promptHash: hash,
        createdAt: Date.now(),
        metadata,
      };

      await this.redis.setex(key, this.ttlSeconds, JSON.stringify(entry));

      // Update embedding index for semantic search
      const indexData = await this.redis.get(this.EMBEDDING_INDEX_KEY);
      const index: Array<{ hash: string; embedding: number[] }> = indexData
        ? JSON.parse(indexData)
        : [];

      const existingIdx = index.findIndex((item) => item.hash === hash);
      if (existingIdx >= 0) {
        index[existingIdx] = { hash, embedding };
      } else {
        index.push({ hash, embedding });
      }

      // Keep index bounded to prevent memory issues (max 1000 entries)
      if (index.length > 1000) {
        index.splice(0, index.length - 1000);
      }

      await this.redis.setex(
        this.EMBEDDING_INDEX_KEY,
        this.ttlSeconds * 2,
        JSON.stringify(index),
      );

      this.logger.debug(`Cache set: ${hash}`);
    } catch (error) {
      this.logger.warn('Cache set error (non-fatal)', error);
    }
  }

  async invalidate(prompt: string): Promise<void> {
    try {
      const hash = this.hashPrompt(prompt);
      const key = `${this.CACHE_PREFIX}${hash}`;
      await this.redis.del(key);
    } catch (error) {
      this.logger.warn('Cache invalidate error (non-fatal)', error);
    }
  }

  async getStats(): Promise<{
    totalKeys: number;
    indexSize: number;
    memoryUsage: string;
  }> {
    try {
      const keys = await this.redis.keys(`${this.CACHE_PREFIX}*`);
      const indexData = await this.redis.get(this.EMBEDDING_INDEX_KEY);
      const index = indexData ? JSON.parse(indexData) : [];
      const info = await this.redis.info('memory');
      const memMatch = info.match(/used_memory_human:(.+)/);
      return {
        totalKeys: keys.length,
        indexSize: index.length,
        memoryUsage: memMatch ? memMatch[1].trim() : 'unknown',
      };
    } catch {
      return { totalKeys: 0, indexSize: 0, memoryUsage: 'unknown' };
    }
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
    return magnitude === 0 ? 0 : dotProduct / magnitude;
  }
}
