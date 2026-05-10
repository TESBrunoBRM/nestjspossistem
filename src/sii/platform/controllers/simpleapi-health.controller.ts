import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { ApiKeyGuard } from '../../../auth/api-key.guard';
import { SiiService } from '../../sii.service';

@ApiTags('Plataforma')
@ApiSecurity('x-api-key')
@UseGuards(ApiKeyGuard)
@Controller('sii/sesion')
export class SimpleApiHealthController {
  constructor(private readonly siiService: SiiService) {}

  @Get('health')
  @ApiOperation({ summary: 'Verificar la conexión y configuración de SimpleAPI' })
  @ApiResponse({ status: 200, description: 'Estado de conexión OK.' })
  async health() {
    return this.siiService.healthCheck();
  }
}