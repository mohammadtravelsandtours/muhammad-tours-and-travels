import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * Deliberately excludes credentialLoginIdMasked/credentialEnvPrefix/
 * baseUrl — those describe WHERE a real credential lives (an env var
 * name), never the credential itself, but changing them is still a
 * "redeploy with new env vars" operation, not a live admin toggle. Only
 * the operational knobs an admin should flip without a deploy are here.
 */
export class UpdateSupplierDto {
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  priority?: number;

  @IsOptional()
  @IsInt()
  @Min(1000)
  @Max(60000)
  timeoutMs?: number;
}
