import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';
import { IssuerContextDto } from '../../fiscal/dto/issuer-context.dto';

export class FolioStatusQueryDto extends IssuerContextDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  tipoDTE?: number;
}
