import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthenticatedUser } from '@mohammad-travels/types';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { UpdateAgencyStatusDto } from './dto/update-agency-status.dto';

/**
 * Closes the gap schema.prisma's AgencyStatus always anticipated
 * (PENDING_APPROVAL -> ACTIVE -> SUSPENDED) but nothing ever
 * implemented: a self-registered agency (AuthService.register) sat at
 * PENDING_APPROVAL forever with no admin action to move it anywhere,
 * and — until BookingsService.createBooking's new check — nothing
 * actually enforced that status meant anything either.
 */
@Injectable()
export class AgenciesAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(status?: string) {
    return this.prisma.b2BAgency.findMany({
      where: status ? { status: status as never } : undefined,
      orderBy: { createdAt: 'asc' },
      include: {
        wallet: { select: { balance: true, currency: true } },
        members: { select: { id: true, title: true, user: { select: { fullName: true, email: true } } } },
      },
    });
  }

  async get(id: string) {
    const agency = await this.prisma.b2BAgency.findUnique({
      where: { id },
      include: {
        wallet: { select: { balance: true, currency: true } },
        members: { select: { id: true, title: true, user: { select: { fullName: true, email: true } } } },
      },
    });
    if (!agency) throw new NotFoundException('Agency not found');
    return agency;
  }

  async updateStatus(user: AuthenticatedUser, id: string, dto: UpdateAgencyStatusDto) {
    const agency = await this.prisma.b2BAgency.findUnique({ where: { id } });
    if (!agency) throw new NotFoundException('Agency not found');
    if (agency.status === dto.status) {
      throw new ConflictException(`Agency is already ${dto.status}`);
    }

    const updated = await this.prisma.b2BAgency.update({
      where: { id },
      data: {
        status: dto.status,
        approvedAt: dto.status === 'ACTIVE' && !agency.approvedAt ? new Date() : agency.approvedAt,
      },
    });

    await this.audit.record({
      userId: user.id,
      action: dto.status === 'ACTIVE' ? 'AGENCY_APPROVED' : dto.status === 'SUSPENDED' ? 'AGENCY_SUSPENDED' : 'AGENCY_STATUS_RESET',
      resource: 'agency',
      resourceId: id,
      oldValue: { status: agency.status },
      newValue: { status: dto.status, reason: dto.reason },
    });

    return updated;
  }
}
