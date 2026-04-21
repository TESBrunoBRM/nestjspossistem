import {
  IsString,
  IsNumber,
  IsOptional,
  IsArray,
  ValidateNested,
  IsInt,
  Min,
  IsDateString,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CertificadoDto } from './emitir-boleta.dto';

// ─────────────────────────────────────────────
// Sub-DTOs específicos de Factura
// ─────────────────────────────────────────────

export class IdentificacionDTEFacturaDto {
  /**
   * 33: Factura Electrónica | 34: Factura No Afecta o Exenta |
   * 46: Factura de Compra | 52: Guía de Despacho |
   * 56: Nota de Débito | 61: Nota de Crédito
   */
  @IsInt()
  @IsIn([33, 34, 46, 52, 56, 61])
  TipoDTE: 33 | 34 | 46 | 52 | 56 | 61;

  /** Folio autorizado por el SII */
  @IsInt()
  @Min(1)
  Folio: number;

  /** Fecha de emisión (AAAA-MM-DD) */
  @IsDateString()
  FechaEmision: string;

  /**
   * Forma de pago: 1=Contado, 2=Crédito, 3=Sin costo
   */
  @IsOptional()
  @IsInt()
  @IsIn([1, 2, 3])
  FormaPago?: 1 | 2 | 3;

  /**
   * Medio de pago:
   * CH=Cheque, EF=Efectivo, TC=Tarjeta Crédito, OT=Otro
   */
  @IsOptional()
  @IsString()
  @IsIn(['CH', 'CF', 'LT', 'EF', 'PE', 'TC', 'OT'])
  MedioPago?: string;
}

export class EmisorFacturaDto {
  /** RUT sin puntos, con guión (ej: 12345678-9) */
  @IsString()
  Rut: string;

  /** Razón social de la empresa */
  @IsString()
  RazonSocial: string;

  /** Giro comercial */
  @IsString()
  Giro: string;

  /** Código de actividad económica SII */
  @IsOptional()
  @IsNumber()
  ActividadEconomica?: number;

  @IsString()
  DireccionOrigen: string;

  @IsString()
  ComunaOrigen: string;

  @IsOptional()
  @IsString()
  CiudadOrigen?: string;

  @IsOptional()
  @IsArray()
  Telefono?: string[];
}

export class ReceptorFacturaDto {
  /** RUT del receptor con guión y dígito verificador */
  @IsString()
  Rut: string;

  @IsString()
  RazonSocial: string;

  @IsString()
  Direccion: string;

  @IsString()
  Comuna: string;

  @IsOptional()
  @IsString()
  Ciudad?: string;

  @IsOptional()
  @IsString()
  Giro?: string;

  @IsOptional()
  @IsString()
  Contacto?: string;

  @IsOptional()
  @IsString()
  CorreoElectronico?: string;
}

export class TotalesFacturaDto {
  /** Monto total del documento */
  @IsNumber()
  MontoTotal: number;

  /** Monto neto (base imponible) */
  @IsNumber()
  MontoNeto: number;

  /** IVA calculado (19% del MontoNeto) */
  @IsNumber()
  IVA: number;

  /** Tasa IVA (normalmente 19) */
  @IsOptional()
  @IsNumber()
  TasaIVA?: number;

  @IsOptional()
  @IsNumber()
  MontoExento?: number;
}

export class ItemFacturaDto {
  @IsString()
  Nombre: string;

  @IsOptional()
  @IsString()
  Descripcion?: string;

  @IsNumber()
  Cantidad: number;

  @IsNumber()
  Precio: number;

  /** Precio * Cantidad */
  @IsNumber()
  MontoItem: number;

  /** 1=exento, 0=no exento */
  @IsOptional()
  @IsInt()
  @IsIn([0, 1])
  IndicadorExento?: 0 | 1;

  @IsOptional()
  @IsNumber()
  Descuento?: number;

  @IsOptional()
  @IsNumber()
  Recargo?: number;
}

export class ReferenciaDto {
  @IsDateString()
  FechaDocumentoReferencia: string;

  @IsInt()
  TipoDocumento: number;

  /** 0=no definido, 1=anular, 2=corregir texto, 3=corregir montos */
  @IsOptional()
  @IsInt()
  @IsIn([0, 1, 2, 3])
  CodigoReferencia?: 0 | 1 | 2 | 3;

  @IsOptional()
  @IsString()
  RazonReferencia?: string;

  @IsOptional()
  @IsInt()
  FolioReferencia?: number;
}

// ─────────────────────────────────────────────
// DTO Principal: Factura Electrónica (tipo 33)
// ─────────────────────────────────────────────

export class EmitirFacturaDto {
  @ValidateNested()
  @Type(() => IdentificacionDTEFacturaDto)
  IdentificacionDTE: IdentificacionDTEFacturaDto;

  @ValidateNested()
  @Type(() => EmisorFacturaDto)
  Emisor: EmisorFacturaDto;

  @ValidateNested()
  @Type(() => ReceptorFacturaDto)
  Receptor: ReceptorFacturaDto;

  @ValidateNested()
  @Type(() => TotalesFacturaDto)
  Totales: TotalesFacturaDto;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ItemFacturaDto)
  Detalles: ItemFacturaDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReferenciaDto)
  Referencias?: ReferenciaDto[];

  @ValidateNested()
  @Type(() => CertificadoDto)
  Certificado: CertificadoDto;
}
