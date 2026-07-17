import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { IssuerContextDto } from '../../fiscal/dto/issuer-context.dto';

export enum SourceNoteOperation {
  Annulment = 'annulment',
  TextCorrection = 'text_correction',
  AmountDecrease = 'amount_decrease',
  AmountIncrease = 'amount_increase',
}

class SourceNoteDetailDto {
  @Type(() => Number)
  @IsInt()
  nroLinDet: number;

  @IsString()
  @MinLength(1)
  nmbItem: string;

  @IsOptional()
  @IsString()
  dscItem?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  qtyItem?: number;

  @IsOptional()
  @IsString()
  unmdItem?: string;

  @Type(() => Number)
  @IsNumber()
  prcItem: number;

  @Type(() => Number)
  @IsNumber()
  montoItem: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  indExe?: number;
}

class SourceNoteTotalsDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  mntNeto?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  mntExento?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  tasaIVA?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  iva?: number;

  @Type(() => Number)
  @IsNumber()
  mntTotal: number;
}

export class CreateSourceNoteDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => IssuerContextDto)
  context?: IssuerContextDto;

  @IsEnum(SourceNoteOperation)
  operation: SourceNoteOperation;

  @IsString()
  @MinLength(3)
  @MaxLength(90)
  reason: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SourceNoteDetailDto)
  details?: SourceNoteDetailDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => SourceNoteTotalsDto)
  totals?: SourceNoteTotalsDto;
}
