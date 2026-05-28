import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

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
  fechaResolucion?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  nroResolucion?: number;
}
