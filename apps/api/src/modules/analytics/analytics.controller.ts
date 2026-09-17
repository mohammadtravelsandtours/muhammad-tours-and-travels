import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Permission } from '@mohammad-travels/types';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';

/** Ops/finance BI dashboard — ANALYTICS_READ only (see roles.ts's DEFAULT_ROLE_PERMISSIONS: SUPER_ADMIN, OPS_SUPPORT, FINANCE). */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions(Permission.ANALYTICS_READ)
@Controller('admin/analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('overview')
  getOverview() {
    return this.analytics.getOverview();
  }

  @Get('bookings-timeseries')
  getBookingsTimeSeries(@Query('days') days?: string) {
    const parsed = days ? Math.min(Math.max(parseInt(days, 10) || 30, 1), 180) : 30;
    return this.analytics.getBookingsTimeSeries(parsed);
  }

  @Get('revenue-by-channel')
  getRevenueByChannel() {
    return this.analytics.getRevenueByChannel();
  }

  @Get('top-routes')
  getTopRoutes(@Query('limit') limit?: string) {
    const parsed = limit ? Math.min(Math.max(parseInt(limit, 10) || 10, 1), 50) : 10;
    return this.analytics.getTopRoutes(parsed);
  }

  @Get('supplier-health')
  getSupplierHealth() {
    return this.analytics.getSupplierHealth();
  }

  @Get('corporate-policy')
  getCorporatePolicyStats() {
    return this.analytics.getCorporatePolicyStats();
  }
}
