import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { SendRvdDto } from './dto/send-rvd.dto';
import { FiscalRvdService } from './fiscal-rvd.service';

@ApiTags('Fiscal RVD')
@ApiSecurity('x-api-key')
@UseGuards(ApiKeyGuard)
@Controller('fiscal/rvd')
export class FiscalRvdController {
  constructor(private readonly fiscalRvdService: FiscalRvdService) {}

  @Post()
  @Throttle({ default: { limit: 1, ttl: 10000 } }) // 1 every 10 seconds
  @ApiOperation({
    summary: 'Envia Resumen de Ventas Diarias usando sii-engine',
  })
  send(@Body() dto: SendRvdDto) {
    return this.fiscalRvdService.send(dto);
  }
}
