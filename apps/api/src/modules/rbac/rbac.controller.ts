import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { IsString } from 'class-validator';
import { AuthenticatedUser, Permission } from '@mohammad-travels/types';
import { RbacService } from './rbac.service';
import { GrantPermissionDto } from './dto/grant-permission.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

class AssignRoleDto {
  @IsString()
  roleName!: string;
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('admin/rbac')
export class RbacController {
  constructor(private readonly rbacService: RbacService) {}

  @RequirePermissions(Permission.ROLES_MANAGE)
  @Get('roles')
  async listRoles() {
    return this.rbacService.listRoles();
  }

  @RequirePermissions(Permission.ROLES_MANAGE)
  @Get('permissions')
  async listPermissions() {
    return this.rbacService.listPermissions();
  }

  @RequirePermissions(Permission.ROLES_MANAGE)
  @Get('users')
  async listUsers(@Query('search') search?: string) {
    return { users: await this.rbacService.listUsers(search) };
  }

  @RequirePermissions(Permission.ROLES_MANAGE)
  @Post('users/:userId/roles')
  async assignRole(
    @CurrentUser() actingUser: AuthenticatedUser,
    @Param('userId') userId: string,
    @Body() dto: AssignRoleDto,
  ) {
    return this.rbacService.assignRole(actingUser.id, userId, dto.roleName);
  }

  @RequirePermissions(Permission.ROLES_MANAGE)
  @Delete('users/:userId/roles/:roleName')
  async revokeRole(
    @CurrentUser() actingUser: AuthenticatedUser,
    @Param('userId') userId: string,
    @Param('roleName') roleName: string,
  ) {
    return this.rbacService.revokeRole(actingUser.id, userId, roleName);
  }

  @RequirePermissions(Permission.ROLES_MANAGE)
  @Post('roles/:roleId/permissions')
  async grantPermission(
    @CurrentUser() actingUser: AuthenticatedUser,
    @Param('roleId') roleId: string,
    @Body() dto: GrantPermissionDto,
  ) {
    return this.rbacService.grantPermission(actingUser.id, roleId, dto.permissionId);
  }

  @RequirePermissions(Permission.ROLES_MANAGE)
  @Delete('roles/:roleId/permissions/:permissionId')
  async revokePermission(
    @CurrentUser() actingUser: AuthenticatedUser,
    @Param('roleId') roleId: string,
    @Param('permissionId') permissionId: string,
  ) {
    return this.rbacService.revokePermission(actingUser.id, roleId, permissionId);
  }
}
