import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { IssuerContextDto } from '../../fiscal/dto/issuer-context.dto';

export class CreateEdgeProvisionDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => IssuerContextDto)
  context?: IssuerContextDto;

  @Type(() => Number)
  @IsInt()
  tipoDTE: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  folioStart: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  folioEnd: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxDocuments?: number;

  @IsString()
  expiresAt: string;
}
