import { Transform, Type, type TransformFnParams } from 'class-transformer';
import {
  IsBase64,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { SiiEnvironment } from 'sii-engine';

export class UpsertFiscalIssuerDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  tenantId: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  merchantId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  branchId?: string;

  @IsString()
  @MinLength(3)
  rutEmisor: string;

  @IsEnum(SiiEnvironment)
  environment: SiiEnvironment;

  @IsString()
  @MinLength(10)
  fechaResolucion: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  nroResolucion: number;

  @IsBase64()
  @Transform(trimStringValue)
  pfxBase64: string;

  @IsString()
  @MinLength(1)
  pfxPassword: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  rutFirmante?: string;
}

function trimStringValue(params: TransformFnParams): unknown {
  const value: unknown = params.value;
  return typeof value === 'string' ? value.trim() : value;
}
