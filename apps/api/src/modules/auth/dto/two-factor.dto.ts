import { IsString, Length } from 'class-validator';

export class ConfirmTwoFactorDto {
  @IsString()
  @Length(6, 8)
  code!: string;
}

export class DisableTwoFactorDto {
  @IsString()
  password!: string;
}

export class VerifyTwoFactorDto {
  @IsString()
  twoFactorToken!: string;

  /** Either a 6-digit TOTP code or a "xxxx-xxxx-xx" backup code. */
  @IsString()
  @Length(6, 12)
  code!: string;
}
