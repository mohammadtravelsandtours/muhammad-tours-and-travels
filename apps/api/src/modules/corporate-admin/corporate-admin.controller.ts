import { BadRequestException, Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AuthenticatedUser, Permission } from '@mohammad-travels/types';
import { CorporateAdminService } from './corporate-admin.service';
import { CreateCorporateDto, CreateDepartmentDto, CreateEmployeeDto } from './dto/corporate-admin.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions(Permission.CORPORATE_MANAGE)
@Controller('admin/corporates')
export class CorporateAdminController {
  constructor(private readonly corporateAdmin: CorporateAdminService) {}

  @Get()
  async list() {
    const corporates = await this.corporateAdmin.listCorporates();
    return {
      corporates: corporates.map((c) => ({
        id: c.id,
        name: c.name,
        createdAt: c.createdAt,
        employeeCount: c._count.employees,
        departmentCount: c._count.departments,
        costCenterCount: c._count.costCenters,
        hasTravelPolicy: !!c.travelPolicy,
      })),
    };
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    assertUuid(id);
    return this.corporateAdmin.getCorporate(id);
  }

  @Post()
  async create(@Body() dto: CreateCorporateDto, @CurrentUser() user: AuthenticatedUser) {
    return this.corporateAdmin.createCorporate(user, dto);
  }

  @Post(':id/departments')
  async createDepartment(@Param('id') id: string, @Body() dto: CreateDepartmentDto, @CurrentUser() user: AuthenticatedUser) {
    assertUuid(id);
    return this.corporateAdmin.createDepartment(user, id, dto);
  }

  @Post(':id/employees')
  async createEmployee(@Param('id') id: string, @Body() dto: CreateEmployeeDto, @CurrentUser() user: AuthenticatedUser) {
    assertUuid(id);
    const employee = await this.corporateAdmin.createEmployee(user, id, dto);
    return {
      id: employee.id,
      fullName: employee.user.fullName,
      email: employee.user.email,
      title: employee.title,
    };
  }
}

function assertUuid(value: string): void {
  if (!UUID_RE.test(value)) throw new BadRequestException('id is not a valid corporate account id');
}
