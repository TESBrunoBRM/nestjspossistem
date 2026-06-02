import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { SiiEnvironment } from 'sii-engine';

export class FiscalIssuerQueryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  tenantId: string;

  @IsString()
  @MinLength(3)
  rutEmisor: string;

  @IsOptional()
  @IsEnum(SiiEnvironment)
  environment?: SiiEnvironment;
}
