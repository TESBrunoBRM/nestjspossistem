import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO para solicitar la muestra impresa (PDF) de un DTE.
 */
export class MuestraImpresaRequestDto {
  @ApiProperty({ description: 'XML del DTE timbrado en Base64', example: 'PD94bWw...' })
  @IsString()
  @IsNotEmpty({ message: 'xmlBase64 es obligatorio para generar la muestra impresa' })
  xmlBase64: string;
}
