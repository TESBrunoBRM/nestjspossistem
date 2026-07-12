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

export const SUPPORTED_DTE_TYPES = [33, 34, 46, 52, 56, 61] as const;

class DteIdDocDto {
  @Type(() => Number)
  @IsInt()
  @IsIn(SUPPORTED_DTE_TYPES)
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

class DteEmisorDto {
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

class DteReceptorDto {
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

class DteTotalesDto {
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

class DteDetalleDto {
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

class DteReferenciaDto {
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

class DteDocumentDto {
  @ValidateNested()
  @Type(() => DteIdDocDto)
  idDoc: DteIdDocDto;

  @ValidateNested()
  @Type(() => DteEmisorDto)
  emisor: DteEmisorDto;

  @ValidateNested()
  @Type(() => DteReceptorDto)
  receptor: DteReceptorDto;

  @ValidateNested()
  @Type(() => DteTotalesDto)
  totales: DteTotalesDto;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DteDetalleDto)
  detalles: DteDetalleDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DteReferenciaDto)
  referencias?: DteReferenciaDto[];
}

export class EmitDteDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => IssuerContextDto)
  context?: IssuerContextDto;

  @ValidateNested()
  @Type(() => DteDocumentDto)
  document: DteDocumentDto;
}
