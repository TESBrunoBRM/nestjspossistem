import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { TipoDTE } from 'sii-engine';
import { IssuerContextDto } from '../../fiscal/dto/issuer-context.dto';

export const ALLOWED_CAF_ACQUISITION_TIPO_DTE = [
  TipoDTE.FacturaElectronica,
  TipoDTE.BoletaElectronica,
  TipoDTE.BoletaNoAfectaExentaElectronica,
  TipoDTE.NotaDebito,
  TipoDTE.NotaCredito,
] as const;

export const MAX_CAF_ACQUISITION_QUANTITY = 50;

export class RequestCafAcquisitionDto {
  @ValidateNested()
  @Type(() => IssuerContextDto)
  context: IssuerContextDto;

  @Type(() => Number)
  @IsInt()
  @IsIn(ALLOWED_CAF_ACQUISITION_TIPO_DTE)
  tipoDTE: TipoDTE;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_CAF_ACQUISITION_QUANTITY)
  quantity: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  idempotencyKey?: string;
}
