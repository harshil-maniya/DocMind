import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { QueryService } from './query.service';
import { QueryDto } from './dto/query.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser, IRequestUser, PaginationDto } from '@docmind/common';

@Controller('query')
@UseGuards(JwtAuthGuard)
export class QueryController {
  constructor(private readonly queryService: QueryService) {}

  @Post('natural-language')
  @HttpCode(HttpStatus.OK)
  async naturalLanguage(
    @Body() dto: QueryDto,
    @CurrentUser() user: IRequestUser,
  ) {
    return this.queryService.executeNaturalLanguageQuery(dto, user);
  }

  @Get('history')
  async getHistory(
    @CurrentUser() user: IRequestUser,
    @Query() pagination: PaginationDto,
  ) {
    return this.queryService.getQueryHistory(
      user.tenantId,
      pagination.page,
      pagination.limit,
    );
  }
}
