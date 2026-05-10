import {
  BadRequestException,
  Body,
  Controller,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { ApiKeyGuard } from '../../../../auth/api-key.guard';
import { ValidadorDteService } from '../services/validador-dte.service';

@ApiTags('DTE - Consultas')
@ApiSecurity('x-api-key')
@UseGuards(ApiKeyGuard)
@Controller('sii/utilidades')
export class ValidadorDteController {
  constructor(private readonly validadorDteService: ValidadorDteService) {}

  @Post('validador')
  @ApiOperation({ summary: 'Validar XML de un DTE o Sobre' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        xml: { type: 'string', description: 'XML del DTE en base64' },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Resultado de la validación.' })
  async validar(@Body('xml') xmlBase64: string) {
    if (!xmlBase64 || typeof xmlBase64 !== 'string' || xmlBase64.trim().length === 0) {
      throw new BadRequestException('Se requiere base64 en variable "xml"');
    }

    return this.validadorDteService.validar(xmlBase64);
  }
}