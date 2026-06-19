import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { IssuerContextDto } from '../../fiscal/dto/issuer-context.dto';

export const SUPPORTED_LEGACY_DTE_TYPES = [33, 34, 46, 52, 56, 61] as const;

class LegacyDteIdDocDto {
  @Type(() => Number)
  @IsInt()
  @IsIn(SUPPORTED_LEGACY_DTE_TYPES)
  tipoDTE: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  folio?: number;

  @IsString()
  fechaEmision: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  indMntNeto?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  formaPago?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  tipoDespacho?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  indTraslado?: number;

  @IsOptional()
  @IsString()
  fechaVencimiento?: string;
}

class LegacyDteEmisorDto {
  @IsOptional()
  @IsString()
  rutEmisor?: string;

  @IsString()
  rznSoc: string;

  @IsString()
  giroEmis: string;

  @Type(() => Number)
  @IsInt()
  acteco: number;

  @IsString()
  dirOrigen: string;

  @IsString()
  cmnaOrigen: string;

  @IsOptional()
  @IsString()
  ciudadOrigen?: string;

  @IsOptional()
  @IsString()
  telefono?: string;

  @IsOptional()
  @IsString()
  correoEmisor?: string;

  @IsOptional()
  @IsString()
  cdgSIISucur?: string;
}

class LegacyDteReceptorDto {
  @IsString()
  rutRecep: string;

  @IsString()
  rznSocRecep: string;

  @IsOptional()
  @IsString()
  giroRecep?: string;

  @IsOptional()
  @IsString()
  contacto?: string;

  @IsOptional()
  @IsString()
  correoRecep?: string;

  @IsOptional()
  @IsString()
  dirRecep?: string;

  @IsOptional()
  @IsString()
  cmnaRecep?: string;

  @IsOptional()
  @IsString()
  ciudadRecep?: string;
}

class LegacyDteTotalesDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  mntNeto?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  mntExento?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  tasaIVA?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  iva?: number;

  @Type(() => Number)
  @IsNumber()
  mntTotal: number;
}

class LegacyDteDetalleDto {
  @Type(() => Number)
  @IsInt()
  nroLinDet: number;

  @IsString()
  nmbItem: string;

  @IsOptional()
  @IsString()
  dscItem?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  qtyItem?: number;

  @IsOptional()
  @IsString()
  unmdItem?: string;

  @Type(() => Number)
  @IsNumber()
  prcItem: number;

  @Type(() => Number)
  @IsNumber()
  montoItem: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  indExe?: number;
}

class LegacyDteReferenciaDto {
  @Type(() => Number)
  @IsInt()
  nroLinRef: number;

  @IsOptional()
  @IsString()
  tipoDTERef?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  folioRef?: number;

  @IsOptional()
  @IsString()
  fechaRef?: string;

  @Type(() => Number)
  @IsInt()
  @IsIn([1, 2, 3])
  codRef: number;

  @IsString()
  razonRef: string;
}

class LegacyDteDocumentDto {
  @ValidateNested()
  @Type(() => LegacyDteIdDocDto)
  idDoc: LegacyDteIdDocDto;

  @ValidateNested()
  @Type(() => LegacyDteEmisorDto)
  emisor: LegacyDteEmisorDto;

  @ValidateNested()
  @Type(() => LegacyDteReceptorDto)
  receptor: LegacyDteReceptorDto;

  @ValidateNested()
  @Type(() => LegacyDteTotalesDto)
  totales: LegacyDteTotalesDto;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LegacyDteDetalleDto)
  detalles: LegacyDteDetalleDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LegacyDteReferenciaDto)
  referencias?: LegacyDteReferenciaDto[];
}

export class EmitLegacyDteDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => IssuerContextDto)
  context?: IssuerContextDto;

  @ValidateNested()
  @Type(() => LegacyDteDocumentDto)
  document: LegacyDteDocumentDto;
}
