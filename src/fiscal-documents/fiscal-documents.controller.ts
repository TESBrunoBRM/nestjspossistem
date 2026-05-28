import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { EmitBoletaDto } from './dto/emit-boleta.dto';
import { CreateEdgeProvisionDto } from './dto/create-edge-provision.dto';
import { FiscalDocumentService } from './fiscal-document.service';
import { IssuerContextDto } from '../fiscal/dto/issuer-context.dto';

@ApiTags('Fiscal Documents')
@ApiSecurity('x-api-key')
@UseGuards(ApiKeyGuard)
@Controller('fiscal')
export class FiscalDocumentsController {
  constructor(private readonly fiscalDocumentService: FiscalDocumentService) {}

  @Post('documents/boletas')
  @Throttle({ default: { limit: 2, ttl: 1000 } })
  @ApiOperation({ summary: 'Emite una boleta electronica usando sii-engine' })
  emitirBoleta(@Body() dto: EmitBoletaDto) {
    return this.fiscalDocumentService.emitirBoleta(dto);
  }

  @Get('documents/:id/status')
  @Throttle({ default: { limit: 1, ttl: 5000 } })
  @ApiOperation({
    summary:
      'Consulta estado de envio de boleta por TrackId o ID interno usando sii-engine',
  })
  getStatus(@Param('id') id: string, @Query() query: IssuerContextDto) {
    return this.fiscalDocumentService.getBoletaStatus(id, query);
  }

  @Get('documents/:id/printed-sample')
  @Throttle({ default: { limit: 2, ttl: 5000 } })
  @ApiOperation({
    summary:
      'Genera el PDF417 payload y datos de impresion para una boleta emitida',
  })
  getPrintedSample(@Param('id') id: string) {
    return this.fiscalDocumentService.getPrintedSample(id);
  }

  @Post('edge/provisions')
  @Throttle({ default: { limit: 2, ttl: 5000 } })
  @ApiOperation({
    summary:
      'Genera una provision offline controlada para Flutter sin exponer secretos',
  })
  createEdgeProvision(@Body() dto: CreateEdgeProvisionDto) {
    return this.fiscalDocumentService.generateEdgeProvision(dto);
  }
}
