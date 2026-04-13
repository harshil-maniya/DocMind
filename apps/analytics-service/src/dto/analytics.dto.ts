import { IsOptional, IsDateString, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';

export class AnalyticsFilterDto {
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsEnum(['chat', 'nl-sql'])
  queryType?: 'chat' | 'nl-sql';
}
