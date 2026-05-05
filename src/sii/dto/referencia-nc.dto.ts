import { IsInt, IsIn, Min, IsDateString, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO de referencia específico para Notas de Crédito / Débito.
 * A diferencia de ReferenciaDto, aquí FolioReferencia y CodigoReferencia
 * son OBLIGATORIOS porque una NC/ND siempre debe referenciar un documento.
 */
export class ReferenciaNcDto {
  @ApiProperty({ description: 'Fecha del documento referenciado', example: '2023-10-15' })
  @IsDateString()
  FechaDocumentoReferencia: string;

  @ApiProperty({ description: 'Tipo de documento referenciado (ej: 33 para Factura)', example: 33 })
  @IsInt()
  TipoDocumento: number;

  @ApiProperty({
    description: 'Código de referencia: 1=Anula, 2=Corrige texto, 3=Corrige montos (OBLIGATORIO para NC/ND)',
    example: 1,
    enum: [1, 2, 3],
  })
  @IsInt()
  @IsIn([1, 2, 3], { message: 'CodigoReferencia debe ser 1 (anula), 2 (corrige texto) o 3 (corrige montos)' })
  CodigoReferencia: 1 | 2 | 3;

  @ApiProperty({ description: 'Razón de la referencia', example: 'Anula documento por error en monto', required: false })
  @IsOptional()
  @IsString()
  RazonReferencia?: string;

  @ApiProperty({ description: 'Folio del documento referenciado (OBLIGATORIO para NC/ND)', example: 1050 })
  @IsInt()
  @Min(1, { message: 'FolioReferencia debe ser mayor o igual a 1' })
  FolioReferencia: number;
}
