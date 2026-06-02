import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { FiscalIssuerAdminService } from './fiscal-issuer-admin.service';
import { FiscalIssuerQueryDto } from './dto/fiscal-issuer-query.dto';
import { UpsertFiscalIssuerDto } from './dto/upsert-fiscal-issuer.dto';

@ApiTags('Fiscal Issuers')
@ApiSecurity('x-api-key')
@UseGuards(ApiKeyGuard)
@Controller('fiscal/issuers')
export class FiscalIssuersController {
  constructor(private readonly issuerAdminService: FiscalIssuerAdminService) {}

  @Post()
  @ApiOperation({
    summary:
      'Registra o rota el PFX/password activo de un emisor fiscal y deja su contexto disponible',
  })
  upsertIssuer(@Body() dto: UpsertFiscalIssuerDto) {
    return this.issuerAdminService.upsertIssuer(dto);
  }

  @Get()
  @ApiOperation({
    summary: 'Consulta el emisor fiscal almacenado para un tenant y RUT',
  })
  getIssuer(@Query() query: FiscalIssuerQueryDto) {
    return this.issuerAdminService.getIssuer(query);
  }
}
