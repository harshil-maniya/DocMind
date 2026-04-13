import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { AnalyticsFilterDto } from './dto/analytics.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser, IRequestUser, Roles } from '@docmind/common';
import { UserRole } from '@docmind/common';
import { RolesGuard } from '@docmind/common';

@Controller('analytics')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('usage')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  async getUsage(
    @CurrentUser() user: IRequestUser,
    @Query() filters: AnalyticsFilterDto,
  ) {
    return this.analyticsService.getUsageStats(user.tenantId, filters);
  }

  @Get('cost')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  async getCost(
    @CurrentUser() user: IRequestUser,
    @Query() filters: AnalyticsFilterDto,
  ) {
    return this.analyticsService.getCostStats(user.tenantId, filters);
  }

  @Get('latency')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  async getLatency(
    @CurrentUser() user: IRequestUser,
    @Query() filters: AnalyticsFilterDto,
  ) {
    return this.analyticsService.getLatencyStats(user.tenantId, filters);
  }

  @Get('cache-stats')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  async getCacheStats(
    @CurrentUser() user: IRequestUser,
    @Query() filters: AnalyticsFilterDto,
  ) {
    return this.analyticsService.getCacheStats(user.tenantId, filters);
  }
}
