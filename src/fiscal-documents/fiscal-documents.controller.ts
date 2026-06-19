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
import { EmitLegacyDteDto } from './dto/emit-legacy-dte.dto';
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

  @Post('documents/facturas')
  @Throttle({ default: { limit: 2, ttl: 1000 } })
  @ApiOperation({ summary: 'Emite una factura electronica DTE 33' })
  emitirFactura(@Body() dto: EmitLegacyDteDto) {
    return this.fiscalDocumentService.emitirLegacyDte(dto, 33);
  }

  @Post('documents/facturas-exentas')
  @Throttle({ default: { limit: 2, ttl: 1000 } })
  @ApiOperation({ summary: 'Emite una factura exenta electronica DTE 34' })
  emitirFacturaExenta(@Body() dto: EmitLegacyDteDto) {
    return this.fiscalDocumentService.emitirLegacyDte(dto, 34);
  }

  @Post('documents/facturas-compra')
  @Throttle({ default: { limit: 2, ttl: 1000 } })
  @ApiOperation({ summary: 'Emite una factura de compra electronica DTE 46' })
  emitirFacturaCompra(@Body() dto: EmitLegacyDteDto) {
    return this.fiscalDocumentService.emitirLegacyDte(dto, 46);
  }

  @Post('documents/guias-despacho')
  @Throttle({ default: { limit: 2, ttl: 1000 } })
  @ApiOperation({
    summary: 'Emite una guia de despacho electronica DTE 52',
  })
  emitirGuiaDespacho(@Body() dto: EmitLegacyDteDto) {
    return this.fiscalDocumentService.emitirLegacyDte(dto, 52);
  }

  @Post('documents/notas-de-debito')
  @Throttle({ default: { limit: 2, ttl: 1000 } })
  @ApiOperation({
    summary: 'Emite una nota de debito DTE 56 con referencias obligatorias',
  })
  emitirNotaDebito(@Body() dto: EmitLegacyDteDto) {
    return this.fiscalDocumentService.emitirLegacyDte(dto, 56);
  }

  @Post('documents/notas-de-credito')
  @Throttle({ default: { limit: 2, ttl: 1000 } })
  @ApiOperation({
    summary: 'Emite una nota de credito DTE 61 con referencias obligatorias',
  })
  emitirNotaCredito(@Body() dto: EmitLegacyDteDto) {
    return this.fiscalDocumentService.emitirLegacyDte(dto, 61);
  }

  @Get('documents/facturas/readiness')
  @Throttle({ default: { limit: 1, ttl: 10000 } })
  @ApiOperation({
    summary:
      'Verifica si factura electronica DTE 33 esta lista para emision real',
  })
  getFacturaReadiness(@Query() query: IssuerContextDto) {
    return this.fiscalDocumentService.getFactura33Readiness(query);
  }

  @Get('documents/:id/status')
  @Throttle({ default: { limit: 1, ttl: 5000 } })
  @ApiOperation({
    summary:
      'Consulta estado de envio de boleta por TrackId o ID interno usando sii-engine',
  })
  getStatus(@Param('id') id: string, @Query() query: IssuerContextDto) {
    return this.fiscalDocumentService.getSendStatus(id, query);
  }

  @Get('documents/:id/dte-status')
  @Throttle({ default: { limit: 1, ttl: 5000 } })
  @ApiOperation({
    summary:
      'Consulta estado tributario del DTE emitido por ID interno usando sii-engine',
  })
  getDteStatus(@Param('id') id: string, @Query() query: IssuerContextDto) {
    return this.fiscalDocumentService.getDteStatus(id, query);
  }

  @Get('documents/:id/printed-sample')
  @Throttle({ default: { limit: 2, ttl: 5000 } })
  @ApiOperation({
    summary:
      'Genera el PDF417 payload y datos de impresion para un DTE emitido',
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
