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

export class IdentificacionDTENotaCreditoDto extends IdentificacionDTEFacturaDto {
  /** 61: Nota de Crédito | 56: Nota de Débito */
  @IsInt()
  @IsIn([61, 56])
  declare TipoDTE: 61 | 56;
}

export class EmitirNotaCreditoDto {
  @ValidateNested()
  @Type(() => IdentificacionDTENotaCreditoDto)
  IdentificacionDTE: IdentificacionDTENotaCreditoDto;

  @ValidateNested()
  @Type(() => EmisorFacturaDto)
  Emisor: EmisorFacturaDto;

  @ValidateNested()
  @Type(() => ReceptorFacturaDto)
  Receptor: ReceptorFacturaDto;

  @ValidateNested()
  @Type(() => TotalesFacturaDto)
  Totales: TotalesFacturaDto;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ItemFacturaDto)
  Detalles: ItemFacturaDto[];

  // ⚠️ La diferencia principal con una boleta o factura normal, es que en una
  // Nota de crédito o débito las RUTAS DE REFERENCIA son OBLIGATORIAS para anular o modificar.
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReferenciaDto)
  Referencias: ReferenciaDto[];

  @ValidateNested()
  @Type(() => CertificadoDto)
  Certificado: CertificadoDto;
}
