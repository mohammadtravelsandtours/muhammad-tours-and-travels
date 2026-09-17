import { Injectable, NotFoundException } from '@nestjs/common';
import { AuthenticatedUser } from '@mohammad-travels/types';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SupplierRegistry } from '../suppliers/supplier-registry.service';
import { UpdateSupplierDto } from './dto/update-supplier.dto';

@Injectable()
export class SuppliersAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly registry: SupplierRegistry,
  ) {}

  async list() {
    const suppliers = await this.prisma.supplier.findMany({ orderBy: { priority: 'asc' }, include: { health: true } });
    const registeredCodes = new Set(this.registry.getAllRegisteredCodes());
    return suppliers.map((s) => ({ ...s, registeredInCode: registeredCodes.has(s.code) }));
  }

  async get(id: string) {
    const supplier = await this.prisma.supplier.findUnique({ where: { id }, include: { health: true } });
    if (!supplier) throw new NotFoundException('Supplier not found');

    const recentRuns = await this.prisma.searchSupplierRun.findMany({
      where: { supplierId: id },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return { ...supplier, registeredInCode: this.registry.getAllRegisteredCodes().includes(supplier.code), recentRuns };
  }

  async update(user: AuthenticatedUser, id: string, dto: UpdateSupplierDto) {
    const existing = await this.prisma.supplier.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Supplier not found');

    const updated = await this.prisma.supplier.update({
      where: { id },
      data: {
        active: dto.active ?? undefined,
        priority: dto.priority ?? undefined,
        timeoutMs: dto.timeoutMs ?? undefined,
      },
    });

    await this.audit.record({
      userId: user.id,
      action: 'SUPPLIER_UPDATED',
      resource: 'supplier',
      resourceId: id,
      oldValue: { active: existing.active, priority: existing.priority, timeoutMs: existing.timeoutMs },
      newValue: dto,
    });

    return updated;
  }
}
