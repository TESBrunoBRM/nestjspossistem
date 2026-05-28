import { Type } from 'class-transformer';
import { IsString, MinLength, ValidateNested } from 'class-validator';
import { IssuerContextDto } from '../../fiscal/dto/issuer-context.dto';

export class ImportCafDto {
  @ValidateNested()
  @Type(() => IssuerContextDto)
  context: IssuerContextDto;

  @IsString()
  @MinLength(20)
  cafXml: string;
}
