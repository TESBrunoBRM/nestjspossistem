import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { EmitBoletaDto } from './dto/emit-boleta.dto';
import { EmitDteDto } from './dto/emit-dte.dto';
import { CreateEdgeProvisionDto } from './dto/create-edge-provision.dto';
import { FiscalDocumentService } from './fiscal-document.service';
import { IssuerContextDto } from '../fiscal/dto/issuer-context.dto';
import { CreateSourceNoteDto } from './dto/create-source-note.dto';
import { PrintedDocumentQueryDto } from './dto/printed-document-query.dto';
import type { Response } from 'express';

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
  emitirFactura(@Body() dto: EmitDteDto) {
    return this.fiscalDocumentService.emitirDte(dto, 33);
  }

  @Post('documents/facturas-exentas')
  @Throttle({ default: { limit: 2, ttl: 1000 } })
  @ApiOperation({ summary: 'Emite una factura exenta electronica DTE 34' })
  emitirFacturaExenta(@Body() dto: EmitDteDto) {
    return this.fiscalDocumentService.emitirDte(dto, 34);
  }

  @Post('documents/facturas-compra')
  @Throttle({ default: { limit: 2, ttl: 1000 } })
  @ApiOperation({ summary: 'Emite una factura de compra electronica DTE 46' })
  emitirFacturaCompra(@Body() dto: EmitDteDto) {
    return this.fiscalDocumentService.emitirDte(dto, 46);
  }

  @Post('documents/guias-despacho')
  @Throttle({ default: { limit: 2, ttl: 1000 } })
  @ApiOperation({
    summary: 'Emite una guia de despacho electronica DTE 52',
  })
  emitirGuiaDespacho(@Body() dto: EmitDteDto) {
    return this.fiscalDocumentService.emitirDte(dto, 52);
  }

  @Post('documents/notas-de-debito')
  @Throttle({ default: { limit: 2, ttl: 1000 } })
  @ApiOperation({
    summary: 'Emite una nota de debito DTE 56 con referencias obligatorias',
  })
  emitirNotaDebito(@Body() dto: EmitDteDto) {
    return this.fiscalDocumentService.emitirDte(dto, 56);
  }

  @Post('documents/notas-de-credito')
  @Throttle({ default: { limit: 2, ttl: 1000 } })
  @ApiOperation({
    summary: 'Emite una nota de credito DTE 61 con referencias obligatorias',
  })
  emitirNotaCredito(@Body() dto: EmitDteDto) {
    return this.fiscalDocumentService.emitirDte(dto, 61);
  }

  @Post('documents/:sourceInternalId/credit-notes')
  @Throttle({ default: { limit: 2, ttl: 1000 } })
  @ApiOperation({
    summary:
      'Emite nota de credito DTE 61 derivando la referencia desde el documento origen',
  })
  emitirNotaCreditoDesdeOrigen(
    @Param('sourceInternalId') sourceInternalId: string,
    @Body() dto: CreateSourceNoteDto,
  ) {
    return this.fiscalDocumentService.emitirNotaCreditoDesdeOrigen(
      sourceInternalId,
      dto,
    );
  }

  @Post('documents/:sourceInternalId/debit-notes')
  @Throttle({ default: { limit: 2, ttl: 1000 } })
  @ApiOperation({
    summary:
      'Emite nota de debito DTE 56 derivando la referencia desde el documento origen',
  })
  emitirNotaDebitoDesdeOrigen(
    @Param('sourceInternalId') sourceInternalId: string,
    @Body() dto: CreateSourceNoteDto,
  ) {
    return this.fiscalDocumentService.emitirNotaDebitoDesdeOrigen(
      sourceInternalId,
      dto,
    );
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

  @Get('documents/facturas-exentas/readiness')
  @Throttle({ default: { limit: 1, ttl: 10000 } })
  @ApiOperation({
    summary: 'Verifica si factura exenta DTE 34 esta lista para emision real',
  })
  getFacturaExentaReadiness(@Query() query: IssuerContextDto) {
    return this.fiscalDocumentService.getLegacyDteReadiness(query, 34);
  }

  @Get('documents/facturas-compra/readiness')
  @Throttle({ default: { limit: 1, ttl: 10000 } })
  @ApiOperation({
    summary:
      'Verifica si factura de compra DTE 46 esta lista para emision real',
  })
  getFacturaCompraReadiness(@Query() query: IssuerContextDto) {
    return this.fiscalDocumentService.getLegacyDteReadiness(query, 46);
  }

  @Get('documents/guias-despacho/readiness')
  @Throttle({ default: { limit: 1, ttl: 10000 } })
  @ApiOperation({
    summary: 'Verifica si guia de despacho DTE 52 esta lista para emision real',
  })
  getGuiaDespachoReadiness(@Query() query: IssuerContextDto) {
    return this.fiscalDocumentService.getLegacyDteReadiness(query, 52);
  }

  @Get('documents/notas-de-debito/readiness')
  @Throttle({ default: { limit: 1, ttl: 10000 } })
  @ApiOperation({
    summary: 'Verifica si nota de debito DTE 56 esta lista para emision real',
  })
  getNotaDebitoReadiness(@Query() query: IssuerContextDto) {
    return this.fiscalDocumentService.getLegacyDteReadiness(query, 56);
  }

  @Get('documents/notas-de-credito/readiness')
  @Throttle({ default: { limit: 1, ttl: 10000 } })
  @ApiOperation({
    summary: 'Verifica si nota de credito DTE 61 esta lista para emision real',
  })
  getNotaCreditoReadiness(@Query() query: IssuerContextDto) {
    return this.fiscalDocumentService.getLegacyDteReadiness(query, 61);
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

  @Get('documents/:id/pdf')
  @Throttle({ default: { limit: 2, ttl: 5000 } })
  @ApiOperation({
    summary: 'Genera representación PDF A4 o térmica 80mm con timbre PDF417',
  })
  async getPdf(
    @Param('id') id: string,
    @Query() query: PrintedDocumentQueryDto,
    @Res() response: Response,
  ) {
    const pdf = await this.fiscalDocumentService.getPdf(id, query);
    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader(
      'Content-Disposition',
      `inline; filename="dte-${id}-${pdf.format}.pdf"`,
    );
    response.setHeader('ETag', `"${pdf.sha256}"`);
    response.setHeader('X-Fiscal-Pdf-Format', pdf.format);
    response.send(pdf.buffer);
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
