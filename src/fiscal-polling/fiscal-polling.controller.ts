import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { PollOnceDto, PollSendStatusDto } from './dto/poll-send-status.dto';
import { FiscalPollingService } from './fiscal-polling.service';

@ApiTags('Fiscal Polling')
@ApiSecurity('x-api-key')
@UseGuards(ApiKeyGuard)
@Controller('fiscal/polling')
export class FiscalPollingController {
  constructor(private readonly fiscalPollingService: FiscalPollingService) {}

  @Post('send-status')
  @Throttle({ default: { limit: 1, ttl: 5000 } }) // 1 every 5 seconds
  @ApiOperation({
    summary: 'Consulta una vez el estado de envio usando sii-engine',
  })
  pollSendStatus(@Body() dto: PollSendStatusDto) {
    return this.fiscalPollingService.pollSendStatus(dto);
  }

  @Post(':trackId/poll-once')
  @Throttle({ default: { limit: 1, ttl: 5000 } })
  @ApiOperation({
    summary: 'Consulta una vez el estado de envio usando TrackId en URL',
  })
  pollOnce(@Param('trackId') trackId: string, @Body() dto: PollOnceDto) {
    return this.fiscalPollingService.pollSendStatus({ ...dto, trackId });
  }
}
