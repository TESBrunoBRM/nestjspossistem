import { IsEnum, IsOptional } from 'class-validator';
import { IssuerContextDto } from '../../fiscal/dto/issuer-context.dto';

export enum PrintedDocumentFormat {
  Auto = 'auto',
  Thermal = 'thermal',
  A4 = 'a4',
}

export class PrintedDocumentQueryDto extends IssuerContextDto {
  @IsOptional()
  @IsEnum(PrintedDocumentFormat)
  format: PrintedDocumentFormat = PrintedDocumentFormat.Auto;
}
