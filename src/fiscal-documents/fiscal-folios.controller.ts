import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { FolioStatusQueryDto } from './dto/folio-status-query.dto';
import { ImportCafDto } from './dto/import-caf.dto';
import { ReserveFolioDto } from './dto/reserve-folio.dto';
import { FiscalFoliosService } from './fiscal-folios.service';

@ApiTags('Fiscal Folios')
@ApiSecurity('x-api-key')
@UseGuards(ApiKeyGuard)
@Controller('fiscal/folios')
export class FiscalFoliosController {
  constructor(private readonly fiscalFoliosService: FiscalFoliosService) {}

  @Post('cafs')
  @Throttle({ default: { limit: 1, ttl: 10000 } })
  @ApiOperation({
    summary: 'Importa un CAF XML emitido por SII sin exponer material privado',
  })
  importCaf(@Body() dto: ImportCafDto) {
    return this.fiscalFoliosService.importCaf(dto);
  }

  @Get('status')
  @Throttle({ default: { limit: 3, ttl: 5000 } })
  @ApiOperation({
    summary: 'Consulta estado publico de CAF y folios disponibles',
  })
  getStatus(@Query() query: FolioStatusQueryDto) {
    return this.fiscalFoliosService.getStatus(query);
  }

  @Post('reserve')
  @Throttle({ default: { limit: 2, ttl: 5000 } })
  @ApiOperation({
    summary: 'Reserva el siguiente folio o un folio especifico',
  })
  reserve(@Body() dto: ReserveFolioDto) {
    return this.fiscalFoliosService.reserve(dto);
  }
}
