import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import {
  BoletaSiiClient,
  LegacySiiClient,
  pollOnce,
  toPublicPollingResult,
  type SigningProvider,
} from 'sii-engine';
import { FiscalContextResolver } from '../fiscal/fiscal-context.resolver';
import { FISCAL_SIGNING_PROVIDER } from '../fiscal/fiscal-provider.tokens';
import { FiscalTokenProvider } from '../fiscal/fiscal-token.provider';
import {
  FiscalPollingDocumentKind,
  PollSendStatusDto,
} from './dto/poll-send-status.dto';
import { FiscalDocumentRepository } from '../fiscal-documents/fiscal-document.repository';
import {
  FISCAL_RVD_TRACKING_REPOSITORY,
  type FiscalRvdTrackingRepository,
} from '../fiscal-rvd/fiscal-rvd.repository';

@Injectable()
export class FiscalPollingService {
  private readonly boletaClient = new BoletaSiiClient();
  private readonly legacyClient = new LegacySiiClient();
  private readonly inFlight = new Set<string>();

  constructor(
    private readonly contextResolver: FiscalContextResolver,
    @Inject(FISCAL_SIGNING_PROVIDER)
    private readonly signingProvider: SigningProvider,
    private readonly tokenProvider: FiscalTokenProvider,
    private readonly repository: FiscalDocumentRepository,
    @Inject(FISCAL_RVD_TRACKING_REPOSITORY)
    private readonly rvdRepository: FiscalRvdTrackingRepository,
  ) {}

  async pollSendStatus(dto: PollSendStatusDto) {
    if (dto.attempt && dto.attempt > 15) {
      throw new BadRequestException(
        'Se superó el número máximo de intentos permitidos de polling para este trackId.',
      );
    }

    const context = await this.contextResolver.resolve(dto.context);
    const lockKey = `${context.environment}:${context.rutEmisor}:${dto.trackId}`;

    if (this.inFlight.has(lockKey)) {
      throw new BadRequestException(
        'Ya existe una consulta en curso para este trackId.',
      );
    }
    this.inFlight.add(lockKey);

    try {
      const token = await this.tokenProvider.getToken(
        context,
        this.signingProvider,
      );
      const client =
        this.resolveDocumentKind(dto) === FiscalPollingDocumentKind.LegacyDte
          ? this.legacyClient
          : this.boletaClient;
      const result = await pollOnce(
        dto.trackId,
        { context, token: token.token },
        client,
        dto.attempt ?? 0,
      );

      const record = this.repository.findByTrackId(dto.trackId);
      if (record) {
        this.repository.update(record.internalId, {
          status: result.normalizedStatus,
          attempts: (dto.attempt ?? record.attempts) + 1,
          nextPollAt: new Date(Date.now() + result.nextPollAfter),
        });
      }
      const rvdRecord = this.rvdRepository.findByTrackId(dto.trackId);
      if (rvdRecord) {
        this.rvdRepository.update(rvdRecord.internalId, {
          status: result.normalizedStatus,
          attempts: (dto.attempt ?? rvdRecord.attempts) + 1,
          nextPollAt: new Date(Date.now() + result.nextPollAfter),
          publicStatus: result.normalizedStatus,
          protectedRawResponse: result.rawResponse,
        });
      }

      return toPublicPollingResult(result);
    } finally {
      this.inFlight.delete(lockKey);
    }
  }

  private resolveDocumentKind(
    dto: PollSendStatusDto,
  ): FiscalPollingDocumentKind {
    if (dto.documentKind) return dto.documentKind;
    if (this.rvdRepository.findByTrackId(dto.trackId)) {
      return FiscalPollingDocumentKind.Rvd;
    }
    if (this.repository.findByTrackId(dto.trackId)) {
      return FiscalPollingDocumentKind.Boleta;
    }
    return FiscalPollingDocumentKind.LegacyDte;
  }
}
