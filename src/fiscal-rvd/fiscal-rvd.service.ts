import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  BoletaSiiClient,
  buildResumenVentasDiariasXml,
  signEnvelope,
  toPublicSendResult,
  type SigningProvider,
} from 'sii-engine';
import { FiscalContextResolver } from '../fiscal/fiscal-context.resolver';
import { FISCAL_SIGNING_PROVIDER } from '../fiscal/fiscal-provider.tokens';
import { FiscalTokenProvider } from '../fiscal/fiscal-token.provider';
import { SendRvdDto } from './dto/send-rvd.dto';
import { FiscalRvdSequenceProvider } from './fiscal-rvd-sequence.provider';
import {
  FISCAL_RVD_TRACKING_REPOSITORY,
  type FiscalRvdTrackingRepository,
} from './fiscal-rvd.repository';

@Injectable()
export class FiscalRvdService {
  private readonly boletaClient = new BoletaSiiClient();

  constructor(
    private readonly contextResolver: FiscalContextResolver,
    @Inject(FISCAL_SIGNING_PROVIDER)
    private readonly signingProvider: SigningProvider,
    private readonly tokenProvider: FiscalTokenProvider,
    private readonly sequenceProvider: FiscalRvdSequenceProvider,
    @Inject(FISCAL_RVD_TRACKING_REPOSITORY)
    private readonly repository: FiscalRvdTrackingRepository,
  ) {}

  async send(dto: SendRvdDto) {
    const context = await this.contextResolver.resolve(dto.context);
    const cert = await this.signingProvider.getSigningMaterial(context);

    let secEnvio = dto.secEnvio;
    if (secEnvio === undefined || secEnvio === null) {
      secEnvio = this.sequenceProvider.getNextSequence(
        context.rutEmisor,
        dto.fecha,
      );
    } else {
      this.sequenceProvider.setSequence(context.rutEmisor, dto.fecha, secEnvio);
    }

    const rvdXml = buildResumenVentasDiariasXml(
      context.rutEmisor,
      cert.rutFirmante,
      dto.fecha,
      context.nroResolucion,
      context.fechaResolucion,
      secEnvio,
      dto.totales,
    );
    const signedRvd = signEnvelope(rvdXml, cert);
    const token = await this.tokenProvider.getToken(
      context,
      this.signingProvider,
    );
    const result = await this.boletaClient.sendRvd(
      signedRvd,
      context,
      token.token,
    );
    const internalId = randomUUID();

    this.repository.create({
      internalId,
      tenantId: context.tenantId,
      rutEmisor: context.rutEmisor,
      fecha: dto.fecha,
      secEnvio,
      trackId: result.trackId,
      status: result.status,
      attempts: 0,
      nextPollAt: new Date(Date.now() + 60000),
      publicStatus: result.status,
      protectedRawResponse: result.rawResponse,
    });

    return {
      internalId,
      secEnvio,
      ...toPublicSendResult(result),
    };
  }
}
