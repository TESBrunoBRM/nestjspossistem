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

// ─────────────────────────────────────────────
// Sub-DTOs
// ─────────────────────────────────────────────

export class IdentificacionDTEBoletaDto {
  /** 39: Boleta Electrónica | 41: Boleta No Afecta o Exenta */
  @IsInt()
  @IsIn([39, 41])
  TipoDTE: 39 | 41;

  /** Folio autorizado por el SII */
  @IsInt()
  @Min(1)
  Folio: number;

  /** Fecha de emisión (AAAA-MM-DD) */
  @IsDateString()
  FechaEmision: string;

  /**
   * Indicador de servicio:
   * 1=servicios periódicos, 2=servicios domiciliarios,
   * 3=ventas y servicios, 4=espectáculos por terceros
   */
  @IsOptional()
  @IsInt()
  @IsIn([1, 2, 3, 4])
  IndicadorServicio?: number;

  /**
   * 2 = líneas de detalle indican montos netos (sin IVA).
   * No aplica en boleta exenta.
   */
  @IsOptional()
  @IsInt()
  IndicadorMontosNetosBoleta?: number;
}

export class EmisorBoletaDto {
  /** RUT del emisor con guión y dígito verificador (ej: 12345678-9) */
  @IsString()
  Rut: string;

  /** Razón social para boleta */
  @IsString()
  RazonSocialBoleta: string;

  /** Giro del emisor para boleta */
  @IsString()
  GiroBoleta: string;

  /** Dirección de origen */
  @IsString()
  DireccionOrigen: string;

  /** Comuna de origen */
  @IsString()
  ComunaOrigen: string;
}

export class ReceptorBoletaDto {
  /**
   * RUT del receptor. Si no hay individualización, usar 66.666.666-6.
   * Formato: con guión y dígito verificador.
   */
  @IsString()
  Rut: string;

  @IsOptional()
  @IsString()
  RazonSocial?: string;

  @IsOptional()
  @IsString()
  Direccion?: string;

  @IsOptional()
  @IsString()
  Comuna?: string;

  @IsOptional()
  @IsString()
  Ciudad?: string;

  @IsOptional()
  @IsString()
  Contacto?: string;
}

export class TotalesBoletaDto {
  /** Monto total del documento */
  @IsNumber()
  MontoTotal: number;

  /** Monto neto (sin IVA) */
  @IsOptional()
  @IsNumber()
  MontoNeto?: number;

  /** Monto del IVA (19%) */
  @IsOptional()
  @IsNumber()
  IVA?: number;

  /** Monto exento */
  @IsOptional()
  @IsNumber()
  MontoExento?: number;
}

export class ItemBoletaDto {
  @IsString()
  Nombre: string;

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

export class CertificadoDto {
  /** RUT del certificado digital (sin puntos, con guión) */
  @IsString()
  Rut: string;

  /** Contraseña del certificado digital .pfx */
  @IsString()
  Password: string;
}

// ─────────────────────────────────────────────
// DTO Principal: Boleta Electrónica (tipo 39)
// ─────────────────────────────────────────────

export class EmitirBoletaDto {
  @ValidateNested()
  @Type(() => IdentificacionDTEBoletaDto)
  IdentificacionDTE: IdentificacionDTEBoletaDto;

  @ValidateNested()
  @Type(() => EmisorBoletaDto)
  Emisor: EmisorBoletaDto;

  @ValidateNested()
  @Type(() => ReceptorBoletaDto)
  Receptor: ReceptorBoletaDto;

  @ValidateNested()
  @Type(() => TotalesBoletaDto)
  Totales: TotalesBoletaDto;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ItemBoletaDto)
  Detalles: ItemBoletaDto[];

  @ValidateNested()
  @Type(() => CertificadoDto)
  Certificado: CertificadoDto;
}
