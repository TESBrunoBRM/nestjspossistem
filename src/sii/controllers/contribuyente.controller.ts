import {
  Controller,
  Get,
  Param,
  BadRequestException,
  UseGuards,
} from '@nestjs/common';
import { ApiKeyGuard } from '../../auth/api-key.guard';
import { SiiService } from '../sii.service';
import { ApiTags, ApiOperation, ApiParam, ApiResponse, ApiSecurity } from '@nestjs/swagger';

/** Regex para RUT chileno: con o sin puntos, con guión y dígito verificador */
const RUT_REGEX = /^\d{1,2}\.?\d{3}\.?\d{3}-[\dkK]$/;

@ApiTags('Contribuyentes')
@ApiSecurity('x-api-key')
@UseGuards(ApiKeyGuard)
@Controller('sii/contribuyente')
export class ContribuyenteController {
  constructor(private readonly siiService: SiiService) {}

  @Get(':rut')
  @ApiOperation({ summary: 'Obtener datos de un contribuyente por RUT' })
  @ApiParam({ name: 'rut', description: 'RUT del contribuyente (ej: 76123456-7 ó 76.123.456-7)' })
  @ApiResponse({ status: 200, description: 'Datos del contribuyente retornados.' })
  @ApiResponse({ status: 400, description: 'RUT faltante o con formato inválido.' })
  async obtenerDatosEmpresa(@Param('rut') rut: string) {
    if (!rut || !RUT_REGEX.test(rut)) {
      throw new BadRequestException(
        'Se requiere un RUT válido (ej: 76123456-7 ó 76.123.456-7)',
      );
    }
    return this.siiService.obtenerDatosEmpresa(rut);
  }
}
