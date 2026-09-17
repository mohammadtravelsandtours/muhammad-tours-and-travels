import { IsBoolean, IsInt, IsNumber, IsOptional, Min } from 'class-validator';

/**
 * Deliberately narrow — only the fields an admin should be able to
 * tweak after a rule exists without creating a fresh one (value,
 * bounds, priority, active). Changing WHICH offers a rule matches
 * (scope/supplierId/route/etc.) is a "make a new rule and deactivate
 * the old one" operation instead, so PricingService's evaluation never
 * has to reason about a rule's matching criteria changing under a
 * booking that's mid-flight.
 */
export class UpdateMarkupRuleDto {
  @IsOptional()
  @IsNumber()
  value?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minAmount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  maxAmount?: number;

  @IsOptional()
  @IsInt()
  priority?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
