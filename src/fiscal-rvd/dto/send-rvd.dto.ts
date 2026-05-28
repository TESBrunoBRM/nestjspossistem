import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { IssuerContextDto } from '../../fiscal/dto/issuer-context.dto';

export class RvdTotalDto {
  @Type(() => Number)
  @IsInt()
  tipoDTE: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  cantidad: number;

  @Type(() => Number)
  @IsNumber()
  montoTotal: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  montoExento?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  montoIVA?: number;
}

export class SendRvdDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => IssuerContextDto)
  context?: IssuerContextDto;

  @IsString()
  fecha: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  secEnvio?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RvdTotalDto)
  totales: RvdTotalDto[];
}
