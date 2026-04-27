import {
  Controller,
  Get,
  UseGuards,
} from '@nestjs/common';
import { ApiKeyGuard } from '../../auth/api-key.guard';
import { SiiService } from '../sii.service';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('Sesión SII')
@UseGuards(ApiKeyGuard)
@Controller('sii/sesion')
export class SesionController {
  constructor(private readonly siiService: SiiService) {}

  @Get('health')
  @ApiOperation({ summary: 'Verificar la conexión y configuración de SimpleAPI' })
  @ApiResponse({ status: 200, description: 'Estado de conexión OK.' })
  async health() {
    return this.siiService.healthCheck();
  }
}
