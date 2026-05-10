import {
  IsString,
  IsNotEmpty,
  IsInt,
  IsIn,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export const FOLIOS_TIPO_DTE_VALUES = [33, 34, 39, 41, 43, 46, 52, 56, 61, 110, 111, 112] as const;

export class CertificadoFoliosDto {
  @ApiProperty({
    description: 'RUT del titular del certificado digital, sin puntos y con guión',
    example: '17096073-4',
  })
  @IsString()
  @IsNotEmpty()
  Rut: string;

  @ApiProperty({ description: 'Contraseña del certificado' })
  @IsString()
  @IsNotEmpty()
  Password: string;
}

/**
 * DTO para la obtención de folios (CAF) desde el SII.
 */
export class FoliosRequestDto {
  @ApiProperty({
    description: 'RUT de la empresa a la que se solicitarán folios, sin puntos y con guión',
    example: '76269769-6',
  })
  @IsString()
  @IsNotEmpty()
  RutEmpresa: string;

  @ApiProperty({
    description: 'Tipo de DTE para los folios',
    example: 33,
    enum: FOLIOS_TIPO_DTE_VALUES,
  })
  @IsInt()
  @IsIn(FOLIOS_TIPO_DTE_VALUES)
  TipoDTE: number;

  @ApiProperty({ description: 'Cantidad de folios a solicitar', example: 10 })
  @IsInt()
  @Min(1, { message: 'Cantidad debe ser al menos 1' })
  Cantidad: number;

  @ApiProperty({ description: 'Ambiente: 0=Certificación, 1=Producción', example: 0, enum: [0, 1] })
  @IsInt()
  @IsIn([0, 1])
  Ambiente: 0 | 1;

  @ApiProperty({ type: CertificadoFoliosDto })
  @ValidateNested()
  @Type(() => CertificadoFoliosDto)
  Certificado: CertificadoFoliosDto;
}
