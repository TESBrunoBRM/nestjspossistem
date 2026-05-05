import {
  IsString,
  IsInt,
  IsNotEmpty,
  IsDateString,
  IsIn,
  Min,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO para la consulta del estado de un DTE individual en el SII.
 * Todos los campos son obligatorios — se valida que numéricos no sean NaN.
 */
export class ConsultaEstadoDteDto {
  @ApiProperty({ description: 'RUT de la empresa emisora', example: '76123456-7' })
  @IsString()
  @IsNotEmpty({ message: 'rutEmpresa es obligatorio' })
  rutEmpresa: string;

  @ApiProperty({ description: 'RUT del receptor del DTE', example: '11222333-4' })
  @IsString()
  @IsNotEmpty({ message: 'rutReceptor es obligatorio' })
  rutReceptor: string;

  @ApiProperty({ description: 'Folio del documento', example: 100 })
  @IsInt({ message: 'folio debe ser un número entero válido' })
  @Min(1, { message: 'folio debe ser mayor o igual a 1' })
  folio: number;

  @ApiProperty({
    description: 'Tipo de DTE',
    example: 33,
    enum: [33, 34, 39, 41, 46, 52, 56, 61],
  })
  @IsInt({ message: 'tipoDte debe ser un número entero válido' })
  @IsIn([33, 34, 39, 41, 46, 52, 56, 61], {
    message: 'tipoDte debe ser uno de: 33, 34, 39, 41, 46, 52, 56, 61',
  })
  tipoDte: number;

  @ApiProperty({ description: 'Monto total del DTE', example: 119000 })
  @IsInt({ message: 'total debe ser un número entero válido' })
  @Min(0, { message: 'total debe ser mayor o igual a 0' })
  total: number;

  @ApiProperty({ description: 'Fecha del DTE (ISO 8601)', example: '2023-10-25' })
  @IsDateString({}, { message: 'fechaDte debe ser una fecha válida (YYYY-MM-DD)' })
  fechaDte: string;

  @ApiProperty({ description: 'RUT del titular del certificado digital', example: '12345678-9' })
  @IsString()
  @IsNotEmpty({ message: 'rutCertificado es obligatorio' })
  rutCertificado: string;

  @ApiProperty({ description: 'Contraseña del certificado digital' })
  @IsString()
  @IsNotEmpty({ message: 'passwordCertificado es obligatorio' })
  passwordCertificado: string;
}
