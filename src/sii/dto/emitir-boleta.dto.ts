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
import { ApiProperty } from '@nestjs/swagger';

// ─────────────────────────────────────────────
// Sub-DTOs
// ─────────────────────────────────────────────

export class IdentificacionDTEBoletaDto {
  @ApiProperty({ description: 'Tipo de Documento: 39=Boleta, 41=Boleta Exenta', example: 39, enum: [39, 41] })
  @IsInt()
  @IsIn([39, 41])
  TipoDTE: 39 | 41;

  @ApiProperty({ description: 'Folio autorizado por el SII', example: 123 })
  @IsInt()
  @Min(1)
  Folio: number;

  @ApiProperty({ description: 'Fecha de emisión', example: '2023-10-25' })
  @IsDateString()
  FechaEmision: string;

  @ApiProperty({ description: 'Indicador de servicio (1,2,3,4)', example: 3, required: false })
  @IsOptional()
  @IsInt()
  @IsIn([1, 2, 3, 4])
  IndicadorServicio?: number;

  @ApiProperty({ description: 'Indicador de montos netos (2)', example: 2, required: false })
  @IsOptional()
  @IsInt()
  IndicadorMontosNetosBoleta?: number;
}

export class EmisorBoletaDto {
  @ApiProperty({ description: 'RUT del emisor (con guión)', example: '76123456-7' })
  @IsString()
  Rut: string;

  @ApiProperty({ description: 'Razón social del emisor', example: 'Mi Empresa SpA' })
  @IsString()
  RazonSocialBoleta: string;

  @ApiProperty({ description: 'Giro del emisor', example: 'Comercio al por menor' })
  @IsString()
  GiroBoleta: string;

  @ApiProperty({ description: 'Dirección de origen', example: 'Av. Providencia 123' })
  @IsString()
  DireccionOrigen: string;

  @ApiProperty({ description: 'Comuna de origen', example: 'Providencia' })
  @IsString()
  ComunaOrigen: string;
}

export class ReceptorBoletaDto {
  @ApiProperty({ description: 'RUT del receptor (66.666.666-6 si es anónimo)', example: '66.666.666-6' })
  @IsString()
  Rut: string;

  @ApiProperty({ description: 'Razón social del receptor', example: 'Cliente Frecuente', required: false })
  @IsOptional()
  @IsString()
  RazonSocial?: string;

  @ApiProperty({ description: 'Dirección del receptor', example: 'Av. Siempre Viva 742', required: false })
  @IsOptional()
  @IsString()
  Direccion?: string;

  @ApiProperty({ description: 'Comuna del receptor', example: 'Santiago', required: false })
  @IsOptional()
  @IsString()
  Comuna?: string;

  @ApiProperty({ description: 'Ciudad del receptor', example: 'Santiago', required: false })
  @IsOptional()
  @IsString()
  Ciudad?: string;

  @ApiProperty({ description: 'Contacto del receptor', example: 'Juan Pérez', required: false })
  @IsOptional()
  @IsString()
  Contacto?: string;
}

export class TotalesBoletaDto {
  @ApiProperty({ description: 'Monto total de la boleta', example: 1190 })
  @IsNumber()
  MontoTotal: number;

  @ApiProperty({ description: 'Monto neto (sin IVA)', example: 1000, required: false })
  @IsOptional()
  @IsNumber()
  MontoNeto?: number;

  @ApiProperty({ description: 'Monto de IVA', example: 190, required: false })
  @IsOptional()
  @IsNumber()
  IVA?: number;

  @ApiProperty({ description: 'Monto exento', example: 0, required: false })
  @IsOptional()
  @IsNumber()
  MontoExento?: number;
}

export class ItemBoletaDto {
  @ApiProperty({ description: 'Nombre del producto/servicio', example: 'Producto A' })
  @IsString()
  Nombre: string;

  @ApiProperty({ description: 'Cantidad', example: 2 })
  @IsNumber()
  Cantidad: number;

  @ApiProperty({ description: 'Precio unitario', example: 500 })
  @IsNumber()
  Precio: number;

  @ApiProperty({ description: 'Monto total del ítem', example: 1000 })
  @IsNumber()
  MontoItem: number;

  @ApiProperty({ description: 'Indicador exento (0=Afecto, 1=Exento)', example: 0, enum: [0, 1], required: false })
  @IsOptional()
  @IsInt()
  @IsIn([0, 1])
  IndicadorExento?: 0 | 1;

  @ApiProperty({ description: 'Descuento', example: 0, required: false })
  @IsOptional()
  @IsNumber()
  Descuento?: number;

  @ApiProperty({ description: 'Recargo', example: 0, required: false })
  @IsOptional()
  @IsNumber()
  Recargo?: number;
}

export class CertificadoDto {
  @ApiProperty({ description: 'RUT del certificado', example: '12345678-9' })
  @IsString()
  Rut: string;

  @ApiProperty({ description: 'Contraseña del certificado', example: 'MiSuperPassword' })
  @IsString()
  Password: string;
}

// ─────────────────────────────────────────────
// DTO Principal: Boleta Electrónica (tipo 39)
// ─────────────────────────────────────────────

export class EmitirBoletaDto {
  @ApiProperty({ type: IdentificacionDTEBoletaDto })
  @ValidateNested()
  @Type(() => IdentificacionDTEBoletaDto)
  IdentificacionDTE: IdentificacionDTEBoletaDto;

  @ApiProperty({ type: EmisorBoletaDto })
  @ValidateNested()
  @Type(() => EmisorBoletaDto)
  Emisor: EmisorBoletaDto;

  @ApiProperty({ type: ReceptorBoletaDto })
  @ValidateNested()
  @Type(() => ReceptorBoletaDto)
  Receptor: ReceptorBoletaDto;

  @ApiProperty({ type: TotalesBoletaDto })
  @ValidateNested()
  @Type(() => TotalesBoletaDto)
  Totales: TotalesBoletaDto;

  @ApiProperty({ type: [ItemBoletaDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ItemBoletaDto)
  Detalles: ItemBoletaDto[];

  @ApiProperty({ type: CertificadoDto })
  @ValidateNested()
  @Type(() => CertificadoDto)
  Certificado: CertificadoDto;
}
