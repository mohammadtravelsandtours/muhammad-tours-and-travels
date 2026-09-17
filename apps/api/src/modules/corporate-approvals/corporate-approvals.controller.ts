import { BadRequestException, Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AuthenticatedUser, Permission } from '@mohammad-travels/types';
import { CorporateApprovalsService } from './corporate-approvals.service';
import { DecideApprovalDto } from './dto/decide-approval.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('corporate-approvals')
export class CorporateApprovalsController {
  constructor(private readonly approvals: CorporateApprovalsService) {}

  @RequirePermissions(Permission.BOOKING_APPROVE_CORPORATE)
  @Get('pending')
  async listPending(@CurrentUser() user: AuthenticatedUser) {
    const rows = await this.approvals.listPending(user);
    return { approvals: rows.map(serializeApproval) };
  }

  @RequirePermissions(Permission.BOOKING_APPROVE_CORPORATE)
  @Post(':id/decision')
  async decide(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: DecideApprovalDto) {
    if (!UUID_RE.test(id)) throw new BadRequestException('id is not a valid approval id');
    return serializeApproval(await this.approvals.decide(user, id, dto));
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializeApproval(a: any) {
  return {
    id: a.id,
    bookingId: a.bookingId,
    status: a.status,
    reason: a.reason,
    decidedAt: a.decidedAt,
    createdAt: a.createdAt,
    requestedBy: a.requestedByEmployee && {
      name: a.requestedByEmployee.user?.fullName,
      email: a.requestedByEmployee.user?.email,
      title: a.requestedByEmployee.title,
    },
    booking: a.booking && {
      id: a.booking.id,
      bookingReference: a.booking.bookingReference,
      status: a.booking.status,
      currency: a.booking.currency,
      totalAmount: Number(a.booking.totalAmount),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      segments: (a.booking.offer?.segments ?? []).map((s: any) => ({
        origin: s.origin,
        destination: s.destination,
        departureAt: s.departureAt,
        arrivalAt: s.arrivalAt,
        marketingCarrier: s.marketingCarrier,
        flightNumber: s.flightNumber,
      })),
    },
  };
}
