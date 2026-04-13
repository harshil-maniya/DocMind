import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { IChunk } from '@docmind/common';

export interface RetrievalOptions {
  topK?: number;
  vectorWeight?: number;
  keywordWeight?: number;
  minScore?: number;
}

export interface RetrievedChunk extends IChunk {
  vectorScore: number;
  keywordScore: number;
  combinedScore: number;
}

@Injectable()
export class RetrievalService {
  private readonly logger = new Logger(RetrievalService.name);
  private readonly defaultTopK: number;
  private readonly defaultVectorWeight: number;
  private readonly defaultKeywordWeight: number;

  constructor(private readonly dataSource: DataSource) {
    this.defaultTopK = Number(process.env.RETRIEVAL_TOP_K ?? 10);
    this.defaultVectorWeight = Number(
      process.env.RETRIEVAL_VECTOR_WEIGHT ?? 0.7,
    );
    this.defaultKeywordWeight = Number(
      process.env.RETRIEVAL_KEYWORD_WEIGHT ?? 0.3,
    );
  }

  async hybridSearch(
    queryEmbedding: number[],
    queryText: string,
    tenantId: string,
    options?: RetrievalOptions,
  ): Promise<RetrievedChunk[]> {
    const topK = options?.topK ?? this.defaultTopK;
    const vectorWeight = options?.vectorWeight ?? this.defaultVectorWeight;
    const keywordWeight = options?.keywordWeight ?? this.defaultKeywordWeight;
    const fetchMultiplier = 3;

    const [vectorResults, keywordResults] = await Promise.all([
      this.vectorSearch(queryEmbedding, tenantId, topK * fetchMultiplier),
      this.keywordSearch(queryText, tenantId, topK * fetchMultiplier),
    ]);

    const combined = this.mergeAndScore(
      vectorResults,
      keywordResults,
      vectorWeight,
      keywordWeight,
    );

    const reranked = this.rerank(combined, queryText);

    return reranked.slice(0, topK);
  }

  async vectorSearch(
    queryEmbedding: number[],
    tenantId: string,
    limit: number,
  ): Promise<Array<RetrievedChunk>> {
    const results = await this.dataSource.query(
      `SELECT 
        c.id, c.document_id as "documentId", c.tenant_id as "tenantId",
        c.content, c.chunk_index as "chunkIndex", c.token_count as "tokenCount",
        c.metadata, c.created_at as "createdAt",
        1 - (c.embedding <=> $1::vector) as "vectorScore"
       FROM chunks c
       WHERE c.tenant_id = $2
       ORDER BY c.embedding <=> $1::vector
       LIMIT $3`,
      [JSON.stringify(queryEmbedding), tenantId, limit],
    );

    return results.map((r: any) => ({
      ...r,
      vectorScore: Number(r.vectorScore),
      keywordScore: 0,
      combinedScore: Number(r.vectorScore),
      score: Number(r.vectorScore),
    }));
  }

  async keywordSearch(
    queryText: string,
    tenantId: string,
    limit: number,
  ): Promise<Array<RetrievedChunk>> {
    const sanitized = queryText.replace(/[^\w\s]/g, ' ').trim();
    const tsQuery = sanitized.split(/\s+/).filter(Boolean).join(' & ');

    if (!tsQuery) {
      return [];
    }

    const results = await this.dataSource.query(
      `SELECT 
        c.id, c.document_id as "documentId", c.tenant_id as "tenantId",
        c.content, c.chunk_index as "chunkIndex", c.token_count as "tokenCount",
        c.metadata, c.created_at as "createdAt",
        ts_rank(to_tsvector('english', c.content), to_tsquery('english', $1)) as "keywordScore"
       FROM chunks c
       WHERE c.tenant_id = $2
         AND to_tsvector('english', c.content) @@ to_tsquery('english', $1)
       ORDER BY "keywordScore" DESC
       LIMIT $3`,
      [tsQuery, tenantId, limit],
    );

    return results.map((r: any) => ({
      ...r,
      vectorScore: 0,
      keywordScore: Number(r.keywordScore),
      combinedScore: Number(r.keywordScore),
      score: Number(r.keywordScore),
    }));
  }

  private mergeAndScore(
    vectorResults: RetrievedChunk[],
    keywordResults: RetrievedChunk[],
    vectorWeight: number,
    keywordWeight: number,
  ): RetrievedChunk[] {
    const chunkMap = new Map<string, RetrievedChunk>();

    const maxVectorScore = Math.max(
      ...vectorResults.map((r) => r.vectorScore),
      1,
    );
    const maxKeywordScore = Math.max(
      ...keywordResults.map((r) => r.keywordScore),
      1,
    );

    for (const chunk of vectorResults) {
      const normalizedVector = chunk.vectorScore / maxVectorScore;
      chunkMap.set(chunk.id, {
        ...chunk,
        vectorScore: normalizedVector,
        keywordScore: 0,
        combinedScore: normalizedVector * vectorWeight,
      });
    }

    for (const chunk of keywordResults) {
      const normalizedKeyword = chunk.keywordScore / maxKeywordScore;
      if (chunkMap.has(chunk.id)) {
        const existing = chunkMap.get(chunk.id)!;
        existing.keywordScore = normalizedKeyword;
        existing.combinedScore =
          existing.vectorScore * vectorWeight +
          normalizedKeyword * keywordWeight;
      } else {
        chunkMap.set(chunk.id, {
          ...chunk,
          keywordScore: normalizedKeyword,
          vectorScore: 0,
          combinedScore: normalizedKeyword * keywordWeight,
        });
      }
    }

    return Array.from(chunkMap.values()).sort(
      (a, b) => b.combinedScore - a.combinedScore,
    );
  }

  private rerank(
    chunks: RetrievedChunk[],
    queryText: string,
  ): RetrievedChunk[] {
    const queryTokens = new Set(
      queryText.toLowerCase().split(/\s+/).filter((t) => t.length > 3),
    );

    return chunks
      .map((chunk) => {
        const contentLower = chunk.content.toLowerCase();
        let rerankBoost = 0;

        for (const token of queryTokens) {
          if (contentLower.includes(token)) {
            rerankBoost += 0.02;
          }
        }

        if (
          contentLower.includes(queryText.toLowerCase().slice(0, 50))
        ) {
          rerankBoost += 0.05;
        }

        return {
          ...chunk,
          combinedScore: Math.min(1, chunk.combinedScore + rerankBoost),
          score: Math.min(1, chunk.combinedScore + rerankBoost),
        };
      })
      .sort((a, b) => b.combinedScore - a.combinedScore);
  }
}
