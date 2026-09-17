import { IsUUID } from 'class-validator';

export class GrantPermissionDto {
  @IsUUID()
  permissionId!: string;
}
