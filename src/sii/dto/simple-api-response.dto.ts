import { ApiProperty } from '@nestjs/swagger';

export class SimpleApiResponseDto {
  @ApiProperty({ description: 'Track ID otorgado por el SII', example: '123456789', required: false })
  trackId?: string;

  @ApiProperty({ description: 'Folio asignado al documento', example: 123, required: false })
  folio?: number;

  @ApiProperty({ description: 'Respuesta en bruto del SII', required: false })
  respuestaSii?: any;
}
