import {
  IsString,
  IsNotEmpty,
  IsInt,
  IsIn,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class CertificadoSobreDto {
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
 * DTO para generar el Sobre de Envío al SII.
 */
export class SobreEnvioRequestDto {
  @ApiProperty({ description: 'RUT de la empresa emisora', example: '76123456-7' })
  @IsString()
  @IsNotEmpty()
  RutEmpresa: string;

  @ApiProperty({ description: 'RUT del receptor del sobre (SII o intercambio)', example: '60803000-K' })
  @IsString()
  @IsNotEmpty()
  RutReceptor: string;

  @ApiProperty({ description: 'Ambiente: 0=Certificación, 1=Producción', example: 0, enum: [0, 1] })
  @IsInt()
  @IsIn([0, 1])
  Ambiente: 0 | 1;

  @ApiProperty({ type: CertificadoSobreDto })
  @ValidateNested()
  @Type(() => CertificadoSobreDto)
  Certificado: CertificadoSobreDto;
}
