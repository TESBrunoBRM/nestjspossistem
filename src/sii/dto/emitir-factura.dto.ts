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
import { ApiProperty } from '@nestjs/swagger';

// ─────────────────────────────────────────────
// Sub-DTOs específicos de Factura
// ─────────────────────────────────────────────

export class IdentificacionDTEFacturaDto {
  @ApiProperty({ description: 'Tipo: 33=Factura, 34=Factura Exenta, 46=Compra, 52=Guía, 56=ND, 61=NC', example: 33, enum: [33, 34, 46, 52, 56, 61] })
  @IsInt()
  @IsIn([33, 34, 46, 52, 56, 61])
  TipoDTE: 33 | 34 | 46 | 52 | 56 | 61;

  @ApiProperty({ description: 'Folio autorizado por el SII', example: 1050 })
  @IsInt()
  @Min(1)
  Folio: number;

  @ApiProperty({ description: 'Fecha de emisión', example: '2023-11-01' })
  @IsDateString()
  FechaEmision: string;

  @ApiProperty({ description: 'Forma de pago: 1=Contado, 2=Crédito, 3=Sin costo', example: 1, enum: [1, 2, 3], required: false })
  @IsOptional()
  @IsInt()
  @IsIn([1, 2, 3])
  FormaPago?: 1 | 2 | 3;

  @ApiProperty({ description: 'Medio de pago (CH, EF, TC, etc)', example: 'EF', required: false })
  @IsOptional()
  @IsString()
  @IsIn(['CH', 'CF', 'LT', 'EF', 'PE', 'TC', 'OT'])
  MedioPago?: string;
}

export class EmisorFacturaDto {
  @ApiProperty({ description: 'RUT del emisor (con guión)', example: '76123456-7' })
  @IsString()
  Rut: string;

  @ApiProperty({ description: 'Razón social del emisor', example: 'Mi Empresa SpA' })
  @IsString()
  RazonSocial: string;

  @ApiProperty({ description: 'Giro del emisor', example: 'Venta al por mayor' })
  @IsString()
  Giro: string;

  @ApiProperty({ description: 'Código de actividad económica SII', example: 620100, required: false })
  @IsOptional()
  @IsNumber()
  ActividadEconomica?: number;

  @ApiProperty({ description: 'Dirección de origen', example: 'Av. Providencia 123' })
  @IsString()
  DireccionOrigen: string;

  @ApiProperty({ description: 'Comuna de origen', example: 'Providencia' })
  @IsString()
  ComunaOrigen: string;

  @ApiProperty({ description: 'Ciudad de origen', example: 'Santiago', required: false })
  @IsOptional()
  @IsString()
  CiudadOrigen?: string;

  @ApiProperty({ description: 'Teléfonos del emisor', example: ['+56912345678'], type: [String], required: false })
  @IsOptional()
  @IsArray()
  Telefono?: string[];
}

export class ReceptorFacturaDto {
  @ApiProperty({ description: 'RUT del receptor (con guión)', example: '11222333-4' })
  @IsString()
  Rut: string;

  @ApiProperty({ description: 'Razón social del receptor', example: 'Cliente Corp S.A.' })
  @IsString()
  RazonSocial: string;

  @ApiProperty({ description: 'Dirección del receptor', example: 'Calle Falsa 123' })
  @IsString()
  Direccion: string;

  @ApiProperty({ description: 'Comuna del receptor', example: 'Las Condes' })
  @IsString()
  Comuna: string;

  @ApiProperty({ description: 'Ciudad del receptor', example: 'Santiago', required: false })
  @IsOptional()
  @IsString()
  Ciudad?: string;

  @ApiProperty({ description: 'Giro del receptor', example: 'Comercializadora', required: false })
  @IsOptional()
  @IsString()
  Giro?: string;

  @ApiProperty({ description: 'Contacto comercial', example: 'María López', required: false })
  @IsOptional()
  @IsString()
  Contacto?: string;

  @ApiProperty({ description: 'Correo electrónico receptor', example: 'contacto@cliente.com', required: false })
  @IsOptional()
  @IsString()
  CorreoElectronico?: string;
}

export class TotalesFacturaDto {
  @ApiProperty({ description: 'Monto total de la factura', example: 119000 })
  @IsNumber()
  MontoTotal: number;

  @ApiProperty({ description: 'Monto neto (base imponible)', example: 100000 })
  @IsNumber()
  MontoNeto: number;

  @ApiProperty({ description: 'Monto del IVA', example: 19000 })
  @IsNumber()
  IVA: number;

  @ApiProperty({ description: 'Tasa del IVA (%)', example: 19, required: false })
  @IsOptional()
  @IsNumber()
  TasaIVA?: number;

  @ApiProperty({ description: 'Monto exento', example: 0, required: false })
  @IsOptional()
  @IsNumber()
  MontoExento?: number;
}

export class ItemFacturaDto {
  @ApiProperty({ description: 'Nombre del ítem', example: 'Servicio de Consultoría' })
  @IsString()
  Nombre: string;

  @ApiProperty({ description: 'Descripción detallada', example: 'Horas de consultoría TI mes de Octubre', required: false })
  @IsOptional()
  @IsString()
  Descripcion?: string;

  @ApiProperty({ description: 'Cantidad', example: 1 })
  @IsNumber()
  Cantidad: number;

  @ApiProperty({ description: 'Precio unitario', example: 100000 })
  @IsNumber()
  Precio: number;

  @ApiProperty({ description: 'Monto total del ítem', example: 100000 })
  @IsNumber()
  MontoItem: number;

  @ApiProperty({ description: 'Indicador exento (0=Afecto, 1=Exento)', example: 0, enum: [0, 1], required: false })
  @IsOptional()
  @IsInt()
  @IsIn([0, 1])
  IndicadorExento?: 0 | 1;

  @ApiProperty({ description: 'Descuento aplicado', example: 0, required: false })
  @IsOptional()
  @IsNumber()
  Descuento?: number;

  @ApiProperty({ description: 'Recargo aplicado', example: 0, required: false })
  @IsOptional()
  @IsNumber()
  Recargo?: number;
}

export class ReferenciaDto {
  @ApiProperty({ description: 'Fecha del documento referenciado', example: '2023-10-15' })
  @IsDateString()
  FechaDocumentoReferencia: string;

  @ApiProperty({ description: 'Tipo de documento referenciado (ej: 33 para Factura)', example: 33 })
  @IsInt()
  TipoDocumento: number;

  @ApiProperty({ description: 'Código de referencia: 1=Anula, 2=Corrige texto, 3=Corrige montos', example: 1, enum: [0, 1, 2, 3], required: false })
  @IsOptional()
  @IsInt()
  @IsIn([0, 1, 2, 3])
  CodigoReferencia?: 0 | 1 | 2 | 3;

  @ApiProperty({ description: 'Razón de la referencia', example: 'Anula documento por error en monto', required: false })
  @IsOptional()
  @IsString()
  RazonReferencia?: string;

  @ApiProperty({ description: 'Folio del documento referenciado', example: 1050, required: false })
  @IsOptional()
  @IsInt()
  FolioReferencia?: number;
}

// ─────────────────────────────────────────────
// DTO Principal: Factura Electrónica (tipo 33)
// ─────────────────────────────────────────────

export class EmitirFacturaDto {
  @ApiProperty({ type: IdentificacionDTEFacturaDto })
  @ValidateNested()
  @Type(() => IdentificacionDTEFacturaDto)
  IdentificacionDTE: IdentificacionDTEFacturaDto;

  @ApiProperty({ type: EmisorFacturaDto })
  @ValidateNested()
  @Type(() => EmisorFacturaDto)
  Emisor: EmisorFacturaDto;

  @ApiProperty({ type: ReceptorFacturaDto })
  @ValidateNested()
  @Type(() => ReceptorFacturaDto)
  Receptor: ReceptorFacturaDto;

  @ApiProperty({ type: TotalesFacturaDto })
  @ValidateNested()
  @Type(() => TotalesFacturaDto)
  Totales: TotalesFacturaDto;

  @ApiProperty({ type: [ItemFacturaDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ItemFacturaDto)
  Detalles: ItemFacturaDto[];

  @ApiProperty({ type: [ReferenciaDto], required: false })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReferenciaDto)
  Referencias?: ReferenciaDto[];

  @ApiProperty({ type: CertificadoDto })
  @ValidateNested()
  @Type(() => CertificadoDto)
  Certificado: CertificadoDto;
}
