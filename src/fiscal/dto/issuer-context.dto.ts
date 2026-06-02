import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { SiiEnvironment } from 'sii-engine';

export class IssuerContextDto {
  @IsOptional()
  @IsString()
  tenantId?: string;

  @IsOptional()
  @IsString()
  merchantId?: string;

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsString()
  rutEmisor?: string;

  @IsOptional()
  @IsEnum(SiiEnvironment)
  environment?: SiiEnvironment;

  @IsOptional()
  @IsString()
  fechaResolucion?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  nroResolucion?: number;
}
