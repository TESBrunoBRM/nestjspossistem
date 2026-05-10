import {
  BadRequestException,
  Controller,
  Get,
  Param,
  UseGuards,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { ApiKeyGuard } from '../../../auth/api-key.guard';
import { RutService } from '../services/rut.service';

const RUT_REGEX = /^\d{1,2}\.?\d{3}\.?\d{3}-[\dkK]$/;

@ApiTags('RUT')
@ApiSecurity('x-api-key')
@UseGuards(ApiKeyGuard)
@Controller('sii/contribuyente')
export class RutController {
  constructor(private readonly rutService: RutService) {}

  @Get(':rut')
  @ApiOperation({ summary: 'Obtener datos de un contribuyente por RUT' })
  @ApiParam({
    name: 'rut',
    description: 'RUT del contribuyente (ej: 76123456-7 ó 76.123.456-7)',
  })
  @ApiResponse({ status: 200, description: 'Datos del contribuyente retornados.' })
  @ApiResponse({ status: 400, description: 'RUT faltante o con formato inválido.' })
  async obtenerDatos(@Param('rut') rut: string) {
    if (!rut || !RUT_REGEX.test(rut)) {
      throw new BadRequestException(
        'Se requiere un RUT válido (ej: 76123456-7 ó 76.123.456-7)',
      );
    }

    return this.rutService.obtenerDatos(rut);
  }
}