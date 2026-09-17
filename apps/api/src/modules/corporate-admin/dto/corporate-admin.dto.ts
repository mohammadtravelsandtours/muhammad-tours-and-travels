import { IsEmail, IsIn, IsOptional, IsString, Length, MinLength } from 'class-validator';

export class CreateCorporateDto {
  @IsString()
  @Length(1, 150)
  name!: string;
}

export class CreateDepartmentDto {
  @IsString()
  @Length(1, 150)
  name!: string;
}

const CORPORATE_ROLES = ['CORPORATE_EMPLOYEE', 'CORPORATE_APPROVER'] as const;

export class CreateEmployeeDto {
  @IsEmail()
  email!: string;

  @IsString()
  @Length(1, 150)
  fullName!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsIn(CORPORATE_ROLES)
  role!: (typeof CORPORATE_ROLES)[number];

  @IsOptional()
  @IsString()
  departmentId?: string;

  @IsOptional()
  @IsString()
  costCenterId?: string;

  @IsOptional()
  @IsString()
  @Length(0, 100)
  title?: string;
}
