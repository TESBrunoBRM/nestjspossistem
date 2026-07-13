import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { IssuerContextDto } from '../../fiscal/dto/issuer-context.dto';

export enum FiscalPollingDocumentKind {
  Boleta = 'boleta',
  Rvd = 'rvd',
  Dte = 'dte',
}

export class PollSendStatusDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => IssuerContextDto)
  context?: IssuerContextDto;

  @IsString()
  trackId: string;

  @IsOptional()
  @IsEnum(FiscalPollingDocumentKind)
  documentKind?: FiscalPollingDocumentKind;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  attempt?: number;
}

export class PollOnceDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => IssuerContextDto)
  context?: IssuerContextDto;

  @IsOptional()
  @IsEnum(FiscalPollingDocumentKind)
  documentKind?: FiscalPollingDocumentKind;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  attempt?: number;
}
