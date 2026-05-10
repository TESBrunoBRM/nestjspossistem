import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { ApiKeyGuard } from '../../../auth/api-key.guard';
import { SimpleApiHealthService } from '../services/simpleapi-health.service';

@ApiTags('Plataforma')
@ApiSecurity('x-api-key')
@UseGuards(ApiKeyGuard)
@Controller('sii/sesion')
export class SimpleApiHealthController {
  constructor(private readonly simpleApiHealthService: SimpleApiHealthService) {}

  @Get('health')
  @ApiOperation({ summary: 'Verificar la conexión y configuración de SimpleAPI' })
  @ApiResponse({ status: 200, description: 'Estado de conexión OK.' })
  async health() {
    return this.simpleApiHealthService.health();
  }
}