import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import {
  BoletaSiiClient,
  DteSiiClient,
  pollOnce,
  resolveBoletaAuthScope,
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
  private readonly dteClient = new DteSiiClient();
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
      const documentKind = await this.resolveDocumentKind(dto);
      const isBoleta = documentKind === FiscalPollingDocumentKind.Boleta;
      const token =
        isBoleta &&
        resolveBoletaAuthScope(context.environment) === 'boleta_rest'
          ? await this.tokenProvider.getBoletaToken(
              context,
              this.signingProvider,
            )
          : await this.tokenProvider.getToken(context, this.signingProvider);
      const client = isBoleta ? this.boletaClient : this.dteClient;
      const result = await pollOnce(
        dto.trackId,
        { context, token: token.token },
        client,
        dto.attempt ?? 0,
      );

      const record = await this.repository.findByTrackIdDurable(dto.trackId);
      if (record) {
        await this.repository.updateDurable(record.internalId, {
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

  private async resolveDocumentKind(
    dto: PollSendStatusDto,
  ): Promise<FiscalPollingDocumentKind> {
    if (dto.documentKind) return dto.documentKind;
    if (this.rvdRepository.findByTrackId(dto.trackId)) {
      return FiscalPollingDocumentKind.Rvd;
    }
    if (await this.repository.findByTrackIdDurable(dto.trackId)) {
      return FiscalPollingDocumentKind.Boleta;
    }
    return FiscalPollingDocumentKind.Dte;
  }
}
