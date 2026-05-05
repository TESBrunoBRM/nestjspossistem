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

export class CertificadoFoliosDto {
  @ApiProperty({ description: 'RUT del titular del certificado', example: '12345678-9' })
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
  @ApiProperty({ description: 'RUT de la empresa', example: '76123456-7' })
  @IsString()
  @IsNotEmpty()
  RutEmpresa: string;

  @ApiProperty({
    description: 'Tipo de DTE para los folios',
    example: 33,
    enum: [33, 34, 39, 41, 46, 52, 56, 61],
  })
  @IsInt()
  @IsIn([33, 34, 39, 41, 46, 52, 56, 61])
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
