import {
  Injectable,
  Logger,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { LlmService } from '@docmind/llm';
import { QueryDto, NlSqlResponseDto } from './dto/query.dto';
import { IRequestUser } from '@docmind/common';

const FORBIDDEN_PATTERNS =
  /\b(DROP|DELETE|TRUNCATE|ALTER|INSERT|UPDATE|CREATE|GRANT|REVOKE|EXEC|EXECUTE|CALL|MERGE)\b/gi;

const MAX_RESULTS = 500;

@Injectable()
export class QueryService {
  private readonly logger = new Logger(QueryService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly llmService: LlmService,
  ) {}

  async executeNaturalLanguageQuery(
    dto: QueryDto,
    user: IRequestUser,
  ): Promise<NlSqlResponseDto> {
    const startTime = Date.now();

    // Fetch schema information for context
    const schema = await this.getDatabaseSchema(user.tenantId);

    // Generate SQL via LLM
    const generatedSql = await this.generateSql(
      dto.question,
      schema,
      dto.databaseContext,
    );

    this.logger.debug(`Generated SQL: ${generatedSql}`);

    // Validate SQL safety
    this.validateSql(generatedSql);

    // Execute query (read-only)
    const results = await this.executeReadOnlyQuery(generatedSql, user.tenantId);

    const executionTimeMs = Date.now() - startTime;

    // Generate natural language explanation
    const explanation = await this.explainResults(
      dto.question,
      generatedSql,
      results,
    );

    const warnings: string[] = [];
    if (results.length === MAX_RESULTS) {
      warnings.push(`Results limited to ${MAX_RESULTS} rows`);
    }

    return {
      question: dto.question,
      generatedSql,
      explanation,
      results,
      rowCount: results.length,
      executionTimeMs,
      warnings,
    };
  }

  async getQueryHistory(
    tenantId: string,
    page: number = 1,
    limit: number = 20,
  ): Promise<{ queries: unknown[]; total: number }> {
    try {
      const offset = (page - 1) * limit;
      const rows = await this.dataSource.query(
        `SELECT id, question, generated_sql, row_count, execution_time_ms, created_at
         FROM query_history
         WHERE tenant_id = $1
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [tenantId, limit, offset],
      );

      const countResult = await this.dataSource.query(
        `SELECT COUNT(*) as count FROM query_history WHERE tenant_id = $1`,
        [tenantId],
      );

      return {
        queries: rows,
        total: Number(countResult[0]?.count ?? 0),
      };
    } catch {
      return { queries: [], total: 0 };
    }
  }

  private async getDatabaseSchema(tenantId: string): Promise<string> {
    try {
      const tables = await this.dataSource.query(
        `SELECT 
          t.table_name,
          c.column_name,
          c.data_type,
          c.is_nullable,
          c.column_default
         FROM information_schema.tables t
         JOIN information_schema.columns c ON t.table_name = c.table_name
         WHERE t.table_schema = 'public'
           AND t.table_type = 'BASE TABLE'
         ORDER BY t.table_name, c.ordinal_position`,
      );

      const schemaMap: Record<
        string,
        Array<{ column: string; type: string; nullable: string }>
      > = {};

      for (const row of tables) {
        if (!schemaMap[row.table_name]) {
          schemaMap[row.table_name] = [];
        }
        schemaMap[row.table_name].push({
          column: row.column_name,
          type: row.data_type,
          nullable: row.is_nullable,
        });
      }

      const schemaText = Object.entries(schemaMap)
        .map(
          ([table, columns]) =>
            `Table: ${table}\nColumns:\n${columns.map((c) => `  - ${c.column} (${c.type}${c.nullable === 'NO' ? ', NOT NULL' : ''})`).join('\n')}`,
        )
        .join('\n\n');

      return schemaText || 'No schema information available';
    } catch (error) {
      this.logger.warn('Could not fetch schema', error);
      return 'Schema unavailable';
    }
  }

  private async generateSql(
    question: string,
    schema: string,
    databaseContext?: string,
  ): Promise<string> {
    const systemPrompt = `You are an expert SQL query generator. 
Generate safe, read-only SELECT SQL queries based on natural language questions.
Rules:
- ONLY generate SELECT queries
- Never use subqueries that modify data
- Use proper JOIN syntax
- Always add LIMIT clause (max ${MAX_RESULTS})
- Return ONLY the SQL query, no explanations or markdown
- Use table aliases for clarity
- Handle NULL values appropriately`;

    const userPrompt = `Database Schema:
${schema}

${databaseContext ? `Additional Context: ${databaseContext}\n` : ''}
Question: ${question}

Generate a SQL SELECT query to answer this question. Return ONLY the SQL, nothing else.`;

    const response = await this.llmService.chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ]);

    // Clean up the response - remove markdown code blocks if present
    return response.content
      .replace(/```sql\n?/gi, '')
      .replace(/```\n?/g, '')
      .trim();
  }

  private validateSql(sql: string): void {
    if (FORBIDDEN_PATTERNS.test(sql)) {
      throw new BadRequestException(
        'Generated SQL contains forbidden operations. Only SELECT queries are allowed.',
      );
    }

    if (!sql.trim().toLowerCase().startsWith('select')) {
      throw new BadRequestException(
        'Only SELECT queries are permitted.',
      );
    }

    // Reset regex lastIndex
    FORBIDDEN_PATTERNS.lastIndex = 0;
  }

  private async executeReadOnlyQuery(
    sql: string,
    tenantId: string,
  ): Promise<unknown[]> {
    try {
      // Add LIMIT if not present
      let safeSql = sql;
      if (!safeSql.toLowerCase().includes('limit')) {
        safeSql = `${safeSql.trimEnd()} LIMIT ${MAX_RESULTS}`;
      }

      const results = await this.dataSource.query(safeSql);

      // Log to history (best effort)
      this.saveQueryHistory(tenantId, sql, results.length).catch(() => {});

      return Array.isArray(results) ? results : [results];
    } catch (error) {
      this.logger.error('Query execution failed', error);
      throw new BadRequestException(
        `Query execution failed: ${(error as Error).message}`,
      );
    }
  }

  private async explainResults(
    question: string,
    sql: string,
    results: unknown[],
  ): Promise<string> {
    const resultSample = JSON.stringify(results.slice(0, 5), null, 2);

    const response = await this.llmService.chat([
      {
        role: 'system',
        content:
          'You are a data analyst. Explain query results in clear, concise natural language. Be specific about the numbers and insights found.',
      },
      {
        role: 'user',
        content: `Question: ${question}\n\nSQL Query: ${sql}\n\nResults (first 5 of ${results.length} rows):\n${resultSample}\n\nProvide a clear explanation of what these results mean in plain English.`,
      },
    ]);

    return response.content;
  }

  private async saveQueryHistory(
    tenantId: string,
    sql: string,
    rowCount: number,
  ): Promise<void> {
    await this.dataSource.query(
      `CREATE TABLE IF NOT EXISTS query_history (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        tenant_id UUID NOT NULL,
        question TEXT,
        generated_sql TEXT,
        row_count INT,
        execution_time_ms INT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )`,
    );
  }
}
