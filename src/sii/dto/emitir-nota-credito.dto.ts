import { ValidateNested, IsArray, ArrayMinSize, IsInt, IsIn } from 'class-validator';
import { Type } from 'class-transformer';
import {
  IdentificacionDTEFacturaDto,
  EmisorFacturaDto,
  ReceptorFacturaDto,
  TotalesFacturaDto,
  ItemFacturaDto,
} from './emitir-factura.dto';
import { CertificadoDto } from './emitir-boleta.dto';
import { ReferenciaNcDto } from './referencia-nc.dto';
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

  // ⚠️ Para NC/ND las referencias son OBLIGATORIAS y deben incluir
  // FolioReferencia y CodigoReferencia (campos obligatorios en ReferenciaNcDto)
  @ApiProperty({
    type: [ReferenciaNcDto],
    description: 'Referencias al documento que modifica o anula (OBLIGATORIO para NC/ND, con FolioReferencia y CodigoReferencia obligatorios)',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReferenciaNcDto)
  Referencias: ReferenciaNcDto[];

  @ApiProperty({ type: CertificadoDto })
  @ValidateNested()
  @Type(() => CertificadoDto)
  Certificado: CertificadoDto;
}
