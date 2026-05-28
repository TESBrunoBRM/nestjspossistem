import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min, ValidateNested } from 'class-validator';
import { IssuerContextDto } from '../../fiscal/dto/issuer-context.dto';

export class ReserveFolioDto {
  @ValidateNested()
  @Type(() => IssuerContextDto)
  context: IssuerContextDto;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  tipoDTE: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  folio?: number;
}
