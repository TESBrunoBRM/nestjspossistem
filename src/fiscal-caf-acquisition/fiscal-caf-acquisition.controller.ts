import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { RequestCafAcquisitionDto } from './dto/request-caf-acquisition.dto';
import { FiscalCafAcquisitionService } from './fiscal-caf-acquisition.service';

@ApiTags('Fiscal CAF Acquisition')
@ApiSecurity('x-api-key')
@UseGuards(ApiKeyGuard)
@Controller('fiscal/folios')
export class FiscalCafAcquisitionController {
  constructor(
    private readonly cafAcquisitionService: FiscalCafAcquisitionService,
  ) {}

  @Post('requests')
  @Throttle({ default: { limit: 1, ttl: 30000 } })
  @ApiOperation({
    summary:
      'Solicita CAF al portal SII mediante adapter Nest sin exponer secretos',
  })
  requestCaf(@Body() dto: RequestCafAcquisitionDto) {
    return this.cafAcquisitionService.requestCaf(dto);
  }
}
