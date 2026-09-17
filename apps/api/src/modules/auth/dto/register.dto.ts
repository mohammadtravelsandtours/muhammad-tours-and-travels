import { IsEmail, IsIn, IsOptional, IsString, Matches, MinLength } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(10, { message: 'Password must be at least 10 characters' })
  password!: string;

  @IsString()
  @MinLength(2)
  fullName!: string;

  /**
   * PHASE 14: mandatory going forward, per the admin/login-security pass
   * — every new account now carries a contact phone number. Existing
   * accounts created before this phase simply have it unset (see the
   * schema comment on User.phoneNumber); this DTO only governs new
   * registrations.
   */
  @IsString()
  @Matches(/^\+?[0-9]{7,15}$/, { message: 'Enter a valid phone number (e.g. +8801XXXXXXXXX)' })
  phoneNumber!: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsIn(['B2C_CUSTOMER', 'B2B_AGENT'])
  accountType!: 'B2C_CUSTOMER' | 'B2B_AGENT';
}
