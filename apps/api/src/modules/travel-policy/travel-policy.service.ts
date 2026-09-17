import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthenticatedUser, CabinClass } from '@mohammad-travels/types';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { FxRatesService } from '../fx/fx-rates.service';
import { CreateCostCenterDto, UpdateCostCenterDto, UpsertTravelPolicyDto } from './dto/travel-policy.dto';

const CABIN_RANK: Record<CabinClass, number> = {
  ECONOMY: 0,
  PREMIUM_ECONOMY: 1,
  BUSINESS: 2,
  FIRST: 3,
};

export interface PolicyEvaluation {
  /** A hard violation — the booking must be rejected before it ever reaches the supplier. */
  blocked: boolean;
  /** A soft violation, OR no TravelPolicy is configured for this corporate at all — needs a human CORPORATE_APPROVER either way. */
  requiresApproval: boolean;
  /** Human-readable reason, stored on Booking.policyViolationNote / CorporateApproval.reason. Null when fully in policy. */
  note: string | null;
}

/**
 * Evaluated by BookingsService.createBooking for every CORPORATE-channel
 * booking, before the booking row is created. A corporate with no
 * TravelPolicy row configured falls back to "always requires approval,
 * never blocked" — the exact behavior every CORPORATE booking had before
 * this service existed, so an admin who hasn't set up a policy yet sees
 * no change.
 */
@Injectable()
export class TravelPolicyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly fx: FxRatesService,
  ) {}

  async evaluate(
    corporateId: string,
    input: { cabin: CabinClass; totalFare: number; currency: string; departmentId?: string | null },
  ): Promise<PolicyEvaluation> {
    const policy = await this.resolvePolicy(corporateId, input.departmentId ?? null);
    if (!policy) {
      return { blocked: false, requiresApproval: true, note: null };
    }

    if (CABIN_RANK[input.cabin] > CABIN_RANK[policy.maxCabin]) {
      const note = `Cabin ${input.cabin} exceeds this company's policy maximum of ${policy.maxCabin}`;
      return policy.blockOverMaxCabin ? { blocked: true, requiresApproval: false, note } : { blocked: false, requiresApproval: true, note };
    }

    // Fare caps apply directly when currencies already match. When they
    // don't, FxRatesService.convert is tried — and its own contract is
    // "null means don't guess": whenever FX isn't configured at all, or
    // either currency isn't in whatever rate table is in use, this
    // falls back to the exact pre-FX behavior (skip the fare-cap checks
    // entirely rather than compare incorrectly), so a deployment that
    // never sets FX_RATES_JSON sees no change at all.
    let fareInPolicyCurrency: number | null = null;
    if (input.currency === policy.currency) {
      fareInPolicyCurrency = input.totalFare;
    } else {
      fareInPolicyCurrency = await this.fx.convert(input.totalFare, input.currency, policy.currency);
    }

    if (fareInPolicyCurrency !== null) {
      const converted = input.currency !== policy.currency;
      const fareLabel = converted
        ? `${input.totalFare} ${input.currency} (≈ ${fareInPolicyCurrency} ${policy.currency})`
        : `${input.totalFare} ${input.currency}`;

      if (policy.hardFareCapAmount !== null && fareInPolicyCurrency > Number(policy.hardFareCapAmount)) {
        return {
          blocked: true,
          requiresApproval: false,
          note: `Fare ${fareLabel} exceeds this company's hard cap of ${policy.hardFareCapAmount} ${policy.currency}`,
        };
      }
      if (policy.softFareCapAmount !== null && fareInPolicyCurrency > Number(policy.softFareCapAmount)) {
        return {
          blocked: false,
          requiresApproval: true,
          note: `Fare ${fareLabel} exceeds this company's normal cap of ${policy.softFareCapAmount} ${policy.currency} and needs sign-off`,
        };
      }
    }

    return { blocked: false, requiresApproval: false, note: null };
  }

  /**
   * Department override first (when the employee has a department AND
   * that department has one configured), falling back to the
   * corporate-wide TravelPolicy — never both, never merged field by
   * field. A department with no override behaves exactly as if
   * department overrides didn't exist at all, which is what keeps every
   * pre-existing corporate (none of which have ever set one) unaffected.
   */
  private async resolvePolicy(corporateId: string, departmentId: string | null) {
    if (departmentId) {
      const override = await this.prisma.departmentTravelPolicy.findUnique({ where: { departmentId } });
      if (override) return override;
    }
    return this.prisma.travelPolicy.findUnique({ where: { corporateId } });
  }

  /** Validates a requested cost center belongs to the employee's own corporate, falling back to the employee's default. Never trusts a costCenterId from another corporate. */
  async resolveCostCenter(employeeId: string, requestedCostCenterId?: string): Promise<string | null> {
    const employee = await this.prisma.employee.findUniqueOrThrow({ where: { id: employeeId }, select: { corporateId: true, costCenterId: true } });
    if (!requestedCostCenterId) return employee.costCenterId;

    const costCenter = await this.prisma.costCenter.findUnique({ where: { id: requestedCostCenterId } });
    if (!costCenter || costCenter.corporateId !== employee.corporateId || !costCenter.active) {
      throw new BadRequestException('That cost center does not belong to your company or is no longer active');
    }
    return costCenter.id;
  }

  // ── Admin: policy ────────────────────────────────────────────────────

  async getPolicy(corporateId: string) {
    return this.prisma.travelPolicy.findUnique({ where: { corporateId } });
  }

  async upsertPolicy(user: AuthenticatedUser, corporateId: string, dto: UpsertTravelPolicyDto) {
    if (dto.hardFareCapAmount !== undefined && dto.softFareCapAmount !== undefined && dto.hardFareCapAmount < dto.softFareCapAmount) {
      throw new BadRequestException('hardFareCapAmount must be greater than or equal to softFareCapAmount');
    }
    await this.assertCorporateExists(corporateId);

    const existing = await this.prisma.travelPolicy.findUnique({ where: { corporateId } });
    const data = {
      name: dto.name ?? 'Standard policy',
      maxCabin: dto.maxCabin,
      blockOverMaxCabin: dto.blockOverMaxCabin,
      softFareCapAmount: dto.softFareCapAmount ?? null,
      hardFareCapAmount: dto.hardFareCapAmount ?? null,
      currency: dto.currency,
    };

    const policy = existing
      ? await this.prisma.travelPolicy.update({ where: { corporateId }, data })
      : await this.prisma.travelPolicy.create({ data: { corporateId, ...data } });

    await this.audit.record({
      userId: user.id,
      action: existing ? 'TRAVEL_POLICY_UPDATED' : 'TRAVEL_POLICY_CREATED',
      resource: 'travel_policy',
      resourceId: policy.id,
      oldValue: existing ?? undefined,
      newValue: data,
    });

    return policy;
  }

  // ── Admin: department policy overrides ──────────────────────────────

  async getDepartmentPolicy(corporateId: string, departmentId: string) {
    await this.assertDepartmentBelongsToCorporate(corporateId, departmentId);
    return this.prisma.departmentTravelPolicy.findUnique({ where: { departmentId } });
  }

  async upsertDepartmentPolicy(user: AuthenticatedUser, corporateId: string, departmentId: string, dto: UpsertTravelPolicyDto) {
    if (dto.hardFareCapAmount !== undefined && dto.softFareCapAmount !== undefined && dto.hardFareCapAmount < dto.softFareCapAmount) {
      throw new BadRequestException('hardFareCapAmount must be greater than or equal to softFareCapAmount');
    }
    await this.assertDepartmentBelongsToCorporate(corporateId, departmentId);

    const existing = await this.prisma.departmentTravelPolicy.findUnique({ where: { departmentId } });
    const data = {
      name: dto.name ?? 'Department policy',
      maxCabin: dto.maxCabin,
      blockOverMaxCabin: dto.blockOverMaxCabin,
      softFareCapAmount: dto.softFareCapAmount ?? null,
      hardFareCapAmount: dto.hardFareCapAmount ?? null,
      currency: dto.currency,
    };

    const policy = existing
      ? await this.prisma.departmentTravelPolicy.update({ where: { departmentId }, data })
      : await this.prisma.departmentTravelPolicy.create({ data: { departmentId, ...data } });

    await this.audit.record({
      userId: user.id,
      action: existing ? 'DEPARTMENT_TRAVEL_POLICY_UPDATED' : 'DEPARTMENT_TRAVEL_POLICY_CREATED',
      resource: 'department_travel_policy',
      resourceId: policy.id,
      oldValue: existing ?? undefined,
      newValue: data,
    });

    return policy;
  }

  /** Removes the department's override so it reverts to its corporate's default policy. A no-op (not an error) if there was never one — deleting "nothing configured" again is not a failure. */
  async deleteDepartmentPolicy(user: AuthenticatedUser, corporateId: string, departmentId: string) {
    await this.assertDepartmentBelongsToCorporate(corporateId, departmentId);
    const existing = await this.prisma.departmentTravelPolicy.findUnique({ where: { departmentId } });
    if (!existing) return { deleted: false };

    await this.prisma.departmentTravelPolicy.delete({ where: { departmentId } });
    await this.audit.record({
      userId: user.id,
      action: 'DEPARTMENT_TRAVEL_POLICY_DELETED',
      resource: 'department_travel_policy',
      resourceId: existing.id,
      oldValue: existing,
    });
    return { deleted: true };
  }

  // ── Admin: cost centers ──────────────────────────────────────────────

  async listCostCenters(corporateId: string) {
    return this.prisma.costCenter.findMany({ where: { corporateId }, orderBy: { code: 'asc' } });
  }

  async createCostCenter(user: AuthenticatedUser, corporateId: string, dto: CreateCostCenterDto) {
    await this.assertCorporateExists(corporateId);
    const clash = await this.prisma.costCenter.findUnique({ where: { corporateId_code: { corporateId, code: dto.code } } });
    if (clash) throw new ConflictException(`A cost center with code ${dto.code} already exists for this company`);

    const costCenter = await this.prisma.costCenter.create({ data: { corporateId, code: dto.code, name: dto.name } });
    await this.audit.record({ userId: user.id, action: 'COST_CENTER_CREATED', resource: 'cost_center', resourceId: costCenter.id, newValue: { corporateId, code: dto.code, name: dto.name } });
    return costCenter;
  }

  async updateCostCenter(user: AuthenticatedUser, id: string, dto: UpdateCostCenterDto) {
    const existing = await this.prisma.costCenter.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Cost center not found');

    const updated = await this.prisma.costCenter.update({
      where: { id },
      data: { name: dto.name ?? existing.name, active: dto.active ?? existing.active },
    });
    await this.audit.record({ userId: user.id, action: 'COST_CENTER_UPDATED', resource: 'cost_center', resourceId: id, oldValue: existing, newValue: updated });
    return updated;
  }

  // ── Self-service (corporate employees/approvers, at booking time) ────

  async listMyCostCenters(user: AuthenticatedUser) {
    const employee = await this.prisma.user.findUnique({ where: { id: user.id }, select: { employee: { select: { corporateId: true } } } });
    if (!employee?.employee) return [];
    return this.prisma.costCenter.findMany({ where: { corporateId: employee.employee.corporateId, active: true }, orderBy: { code: 'asc' } });
  }

  private async assertCorporateExists(corporateId: string): Promise<void> {
    const exists = await this.prisma.corporate.findUnique({ where: { id: corporateId }, select: { id: true } });
    if (!exists) throw new NotFoundException('Corporate account not found');
  }

  /** Never trusts a departmentId from the URL alone — an admin editing corporate A must never be able to plant/read a policy override on corporate B's department by guessing its id. */
  private async assertDepartmentBelongsToCorporate(corporateId: string, departmentId: string): Promise<void> {
    const department = await this.prisma.department.findUnique({ where: { id: departmentId }, select: { corporateId: true } });
    if (!department || department.corporateId !== corporateId) {
      throw new NotFoundException('Department not found for this company');
    }
  }
}
