import { IsObject, IsNotEmptyObject, IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class DatosGenericosDto {
  @ApiProperty({ description: 'Datos dinámicos para la utilidad del SII' })
  @IsObject()
  @IsNotEmptyObject()
  payload: any;
}
