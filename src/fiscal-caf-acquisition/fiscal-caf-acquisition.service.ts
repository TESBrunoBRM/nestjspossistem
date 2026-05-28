import { Inject, Injectable } from '@nestjs/common';
import {
  assertCafAcquisitionRequest,
  toPublicCafAcquisitionResult,
  type CafAcquisitionProvider,
  type CafAcquisitionRequest,
  type CafAcquisitionResult,
  type FolioProvider,
  type IssuerContext,
} from 'sii-engine';
import { FiscalContextResolver } from '../fiscal/fiscal-context.resolver';
import { FISCAL_FOLIO_PROVIDER } from '../fiscal-documents/fiscal-documents.tokens';
import { ALLOWED_CAF_ACQUISITION_TIPO_DTE } from './dto/request-caf-acquisition.dto';
import { RequestCafAcquisitionDto } from './dto/request-caf-acquisition.dto';
import {
  type CafAcquisitionIdempotencyScope,
  type CafAcquisitionRepository,
} from './fiscal-caf-acquisition.repository';
import {
  FISCAL_CAF_ACQUISITION_PROVIDER,
  FISCAL_CAF_ACQUISITION_REPOSITORY,
} from './fiscal-caf-acquisition.tokens';

@Injectable()
export class FiscalCafAcquisitionService {
  constructor(
    private readonly contextResolver: FiscalContextResolver,
    @Inject(FISCAL_CAF_ACQUISITION_PROVIDER)
    private readonly acquisitionProvider: CafAcquisitionProvider,
    @Inject(FISCAL_CAF_ACQUISITION_REPOSITORY)
    private readonly repository: CafAcquisitionRepository,
    @Inject(FISCAL_FOLIO_PROVIDER)
    private readonly folioProvider: CafImportFolioProvider,
  ) {}

  async requestCaf(dto: RequestCafAcquisitionDto) {
    const context = await this.contextResolver.resolve(dto.context);
    const request: CafAcquisitionRequest = {
      context,
      tipoDTE: dto.tipoDTE,
      quantity: dto.quantity,
      method: 'sii_portal_automation',
      idempotencyKey: dto.idempotencyKey,
    };

    assertCafAcquisitionRequest(request, {
      allowedTipoDTE: ALLOWED_CAF_ACQUISITION_TIPO_DTE,
      maxQuantity: 1000,
    });

    const idempotencyScope = this.idempotencyScope(request);
    const cached = this.repository.findByIdempotencyKey(idempotencyScope);
    if (cached) return toPublicCafAcquisitionResult(cached);

    const result = await this.acquisitionProvider.requestCaf(request);
    const importedResult = await this.importDownloadedCaf(result);
    const saved = this.repository.save(importedResult, idempotencyScope);

    return toPublicCafAcquisitionResult(saved);
  }

  private async importDownloadedCaf(
    result: CafAcquisitionResult,
  ): Promise<CafAcquisitionResult> {
    if (!result.caf?.rawXml) return result;

    await this.folioProvider.addCafXml(result.context, result.caf.rawXml);

    return {
      ...result,
      status: 'imported',
      completedAt: result.completedAt ?? new Date(),
    };
  }

  private idempotencyScope(
    request: CafAcquisitionRequest,
  ): CafAcquisitionIdempotencyScope {
    return {
      environment: request.context.environment,
      rutEmisor: request.context.rutEmisor,
      tipoDTE: request.tipoDTE,
      idempotencyKey: request.idempotencyKey,
    };
  }
}

interface CafImportFolioProvider extends FolioProvider {
  addCafXml(context: IssuerContext | undefined, cafXml: string): Promise<void>;
}
