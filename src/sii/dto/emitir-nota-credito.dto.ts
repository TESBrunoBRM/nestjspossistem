import { ValidateNested, IsArray, ArrayMinSize, IsInt, IsIn } from 'class-validator';
import { Type } from 'class-transformer';
import {
  IdentificacionDTEFacturaDto,
  EmisorFacturaDto,
  ReceptorFacturaDto,
  TotalesFacturaDto,
  ItemFacturaDto,
  ReferenciaDto,
} from './emitir-factura.dto';
import { CertificadoDto } from './emitir-boleta.dto';
import { ApiProperty } from '@nestjs/swagger';

export class IdentificacionDTENotaCreditoDto extends IdentificacionDTEFacturaDto {
  @ApiProperty({ description: '61: Nota de Crédito | 56: Nota de Débito', example: 61, enum: [56, 61] })
  @IsInt()
  @IsIn([61, 56])
  declare TipoDTE: 61 | 56;
}

export class EmitirNotaCreditoDto {
  @ApiProperty({ type: IdentificacionDTENotaCreditoDto })
  @ValidateNested()
  @Type(() => IdentificacionDTENotaCreditoDto)
  IdentificacionDTE: IdentificacionDTENotaCreditoDto;

  @ApiProperty({ type: EmisorFacturaDto })
  @ValidateNested()
  @Type(() => EmisorFacturaDto)
  Emisor: EmisorFacturaDto;

  @ApiProperty({ type: ReceptorFacturaDto })
  @ValidateNested()
  @Type(() => ReceptorFacturaDto)
  Receptor: ReceptorFacturaDto;

  @ApiProperty({ type: TotalesFacturaDto })
  @ValidateNested()
  @Type(() => TotalesFacturaDto)
  Totales: TotalesFacturaDto;

  @ApiProperty({ type: [ItemFacturaDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ItemFacturaDto)
  Detalles: ItemFacturaDto[];

  // ⚠️ La diferencia principal con una boleta o factura normal, es que en una
  // Nota de crédito o débito las RUTAS DE REFERENCIA son OBLIGATORIAS para anular o modificar.
  @ApiProperty({ type: [ReferenciaDto], description: 'Referencias a los documentos que modifica o anula (OBLIGATORIO para NC/ND)' })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReferenciaDto)
  Referencias: ReferenciaDto[];

  @ApiProperty({ type: CertificadoDto })
  @ValidateNested()
  @Type(() => CertificadoDto)
  Certificado: CertificadoDto;
}
