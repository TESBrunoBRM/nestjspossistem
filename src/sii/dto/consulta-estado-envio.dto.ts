import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO para la consulta de estado de un envío por TrackID.
 * Valida que todas las credenciales estén presentes.
 */
export class ConsultaEstadoEnvioDto {
  @ApiProperty({ description: 'RUT de la empresa emisora', example: '76123456-7' })
  @IsString()
  @IsNotEmpty({ message: 'rutEmpresa es obligatorio' })
  rutEmpresa: string;

  @ApiProperty({ description: 'RUT del titular del certificado digital', example: '12345678-9' })
  @IsString()
  @IsNotEmpty({ message: 'rutCertificado es obligatorio' })
  rutCertificado: string;

  @ApiProperty({ description: 'Contraseña del certificado digital' })
  @IsString()
  @IsNotEmpty({ message: 'passwordCertificado es obligatorio' })
  passwordCertificado: string;
}
