import {
  IsString,
  IsNotEmpty,
  IsInt,
  IsDateString,
  ValidateNested,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class CertificadoRvdDto {
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
 * DTO para generar el Registro de Ventas Diarias (RVD / RCOF).
 */
export class RvdRequestDto {
  @ApiProperty({ description: 'RUT de la empresa emisora', example: '76123456-7' })
  @IsString()
  @IsNotEmpty()
  RutEmpresa: string;

  @ApiProperty({ description: 'Fecha del resumen de ventas (ISO)', example: '2023-10-25' })
  @IsDateString()
  FechaResumen: string;

  @ApiProperty({ description: 'Ambiente: 0=Certificación, 1=Producción', example: 0, enum: [0, 1] })
  @IsInt()
  @IsIn([0, 1])
  Ambiente: 0 | 1;

  @ApiProperty({ type: CertificadoRvdDto })
  @ValidateNested()
  @Type(() => CertificadoRvdDto)
  Certificado: CertificadoRvdDto;
}
