import { Type } from 'class-transformer';
import { IsIn, IsInt, ValidateNested } from 'class-validator';
import { TipoDTE } from 'sii-engine';
import { IssuerContextDto } from '../../fiscal/dto/issuer-context.dto';
import { ALLOWED_CAF_ACQUISITION_TIPO_DTE } from './request-caf-acquisition.dto';

export class QueryFolioAvailabilityDto {
  @ValidateNested()
  @Type(() => IssuerContextDto)
  context: IssuerContextDto;

  @Type(() => Number)
  @IsInt()
  @IsIn(ALLOWED_CAF_ACQUISITION_TIPO_DTE)
  tipoDTE: TipoDTE;
}
