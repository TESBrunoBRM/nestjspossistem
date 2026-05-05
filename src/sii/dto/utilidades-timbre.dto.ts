import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO para solicitar la imagen del timbre electrónico (PDF417/TED).
 */
export class TimbreRequestDto {
  @ApiProperty({ description: 'XML del DTE timbrado en Base64', example: 'PD94bWw...' })
  @IsString()
  @IsNotEmpty({ message: 'xmlBase64 es obligatorio para generar el timbre' })
  xmlBase64: string;
}
