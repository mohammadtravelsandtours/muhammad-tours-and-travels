import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { AuthenticatedUser } from '@mohammad-travels/types';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateCorporateDto, CreateDepartmentDto, CreateEmployeeDto } from './dto/corporate-admin.dto';

/**
 * B2C and B2B both have a self-registration path (AuthService.register)
 * — a corporate account never did, anywhere in this codebase. Real B2B
 * travel platforms provision corporate accounts sales-assisted rather
 * than via public self-signup (there's a contract/billing relationship
 * behind it), so this is admin-provisioned rather than a public
 * /auth/register variant — a deliberate product decision, not an
 * oversight, but until this module existed there was no way for a
 * CORPORATE_EMPLOYEE/CORPORATE_APPROVER account to exist at all.
 */
@Injectable()
export class CorporateAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listCorporates() {
    return this.prisma.corporate.findMany({
      orderBy: { createdAt: 'asc' },
      include: {
        _count: { select: { employees: true, departments: true, costCenters: true } },
        travelPolicy: true,
      },
    });
  }

  async getCorporate(id: string) {
    const corporate = await this.prisma.corporate.findUnique({
      where: { id },
      include: {
        departments: { orderBy: { createdAt: 'asc' } },
        costCenters: { orderBy: { code: 'asc' } },
        travelPolicy: true,
        employees: {
          orderBy: { createdAt: 'asc' },
          include: { user: { select: { fullName: true, email: true, isActive: true } }, department: true, costCenter: true },
        },
      },
    });
    if (!corporate) throw new NotFoundException('Corporate account not found');
    return corporate;
  }

  async createCorporate(user: AuthenticatedUser, dto: CreateCorporateDto) {
    const corporate = await this.prisma.corporate.create({ data: { name: dto.name } });
    await this.audit.record({ userId: user.id, action: 'CORPORATE_CREATED', resource: 'corporate', resourceId: corporate.id, newValue: { name: dto.name } });
    return corporate;
  }

  async createDepartment(user: AuthenticatedUser, corporateId: string, dto: CreateDepartmentDto) {
    await this.assertCorporateExists(corporateId);
    const department = await this.prisma.department.create({ data: { corporateId, name: dto.name } });
    await this.audit.record({ userId: user.id, action: 'DEPARTMENT_CREATED', resource: 'department', resourceId: department.id, newValue: { corporateId, name: dto.name } });
    return department;
  }

  async createEmployee(user: AuthenticatedUser, corporateId: string, dto: CreateEmployeeDto) {
    await this.assertCorporateExists(corporateId);

    const existing = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
    if (existing) throw new ConflictException('A user with this email already exists');

    if (dto.departmentId) {
      const department = await this.prisma.department.findUnique({ where: { id: dto.departmentId } });
      if (!department || department.corporateId !== corporateId) throw new NotFoundException('Department not found in this corporate account');
    }
    if (dto.costCenterId) {
      const costCenter = await this.prisma.costCenter.findUnique({ where: { id: dto.costCenterId } });
      if (!costCenter || costCenter.corporateId !== corporateId) throw new NotFoundException('Cost center not found in this corporate account');
    }

    const passwordHash = await argon2.hash(dto.password, { type: argon2.argon2id });

    const employee = await this.prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: { email: dto.email.toLowerCase(), passwordHash, fullName: dto.fullName },
      });
      const role = await tx.role.findUnique({ where: { name: dto.role } });
      if (role) {
        await tx.userRole.create({ data: { userId: createdUser.id, roleId: role.id } });
      }
      return tx.employee.create({
        data: {
          userId: createdUser.id,
          corporateId,
          departmentId: dto.departmentId ?? null,
          costCenterId: dto.costCenterId ?? null,
          title: dto.title ?? null,
        },
        include: { user: { select: { fullName: true, email: true } } },
      });
    });

    await this.audit.record({
      userId: user.id,
      action: 'CORPORATE_EMPLOYEE_CREATED',
      resource: 'employee',
      resourceId: employee.id,
      newValue: { corporateId, email: dto.email, role: dto.role },
    });

    return employee;
  }

  private async assertCorporateExists(corporateId: string): Promise<void> {
    const exists = await this.prisma.corporate.findUnique({ where: { id: corporateId }, select: { id: true } });
    if (!exists) throw new NotFoundException('Corporate account not found');
  }
}
