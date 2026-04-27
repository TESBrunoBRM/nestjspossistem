import {
  Controller,
  Get,
  Param,
  BadRequestException,
  UseGuards,
} from '@nestjs/common';
import { ApiKeyGuard } from '../../auth/api-key.guard';
import { SiiService } from '../sii.service';
import { ApiTags, ApiOperation, ApiParam, ApiResponse } from '@nestjs/swagger';

@ApiTags('Contribuyentes')
@UseGuards(ApiKeyGuard)
@Controller('sii/contribuyente')
export class ContribuyenteController {
  constructor(private readonly siiService: SiiService) {}

  @Get(':rut')
  @ApiOperation({ summary: 'Obtener datos de un contribuyente por RUT' })
  @ApiParam({ name: 'rut', description: 'RUT del contribuyente (ej: 76123456-7)' })
  @ApiResponse({ status: 200, description: 'Datos del contribuyente retornados.' })
  async obtenerDatosEmpresa(@Param('rut') rut: string) {
    if (!rut) throw new BadRequestException('Se requiere el RUT');
    return this.siiService.obtenerDatosEmpresa(rut);
  }
}
