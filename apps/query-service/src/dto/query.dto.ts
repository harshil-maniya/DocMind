import { IsString, IsNotEmpty, IsOptional, MaxLength } from 'class-validator';

export class QueryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  question: string;

  @IsOptional()
  @IsString()
  databaseContext?: string;
}

export class NlSqlResponseDto {
  question: string;
  generatedSql: string;
  explanation: string;
  results: unknown[];
  rowCount: number;
  executionTimeMs: number;
  warnings: string[];
}
