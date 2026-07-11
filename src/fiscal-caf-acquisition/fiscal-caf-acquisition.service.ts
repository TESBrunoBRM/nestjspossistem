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
import { QueryFolioAvailabilityDto } from './dto/query-folio-availability.dto';
import {
  ALLOWED_CAF_ACQUISITION_TIPO_DTE,
  MAX_CAF_ACQUISITION_QUANTITY,
  RequestCafAcquisitionDto,
} from './dto/request-caf-acquisition.dto';
import {
  type CafAcquisitionIdempotencyScope,
  type CafAcquisitionRepository,
} from './fiscal-caf-acquisition.repository';
import {
  FISCAL_CAF_ACQUISITION_PROVIDER,
  FISCAL_CAF_ACQUISITION_REPOSITORY,
} from './fiscal-caf-acquisition.tokens';
import {
  type FolioAvailabilityProvider,
  toPublicFolioAvailabilityResult,
} from './fiscal-folio-availability.types';

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
    const requestedCap = Math.min(dto.quantity, MAX_CAF_ACQUISITION_QUANTITY);
    const requestTemplate: CafAcquisitionRequest = {
      context,
      tipoDTE: dto.tipoDTE,
      quantity: requestedCap,
      method: 'sii_portal_automation',
      idempotencyKey: dto.idempotencyKey,
    };

    assertCafAcquisitionRequest(requestTemplate, {
      allowedTipoDTE: ALLOWED_CAF_ACQUISITION_TIPO_DTE,
      maxQuantity: MAX_CAF_ACQUISITION_QUANTITY,
    });

    const idempotencyScope = this.idempotencyScope(requestTemplate);
    const cached = this.repository.findByIdempotencyKey(idempotencyScope);
    if (cached) return toPublicCafAcquisitionResult(cached);

    const request: CafAcquisitionRequest = {
      ...requestTemplate,
      quantity: await this.resolveRequestQuantity(
        context,
        dto.tipoDTE,
        requestedCap,
      ),
    };
    const result = await this.acquisitionProvider.requestCaf(request);
    const importedResult = await this.importDownloadedCaf(result);
    const saved = this.repository.save(importedResult, idempotencyScope);

    return toPublicCafAcquisitionResult(saved);
  }

  async queryFolioAvailability(dto: QueryFolioAvailabilityDto) {
    const context = await this.contextResolver.resolve(dto.context);
    const result = await this.availabilityProvider().queryAvailableFolios({
      context,
      tipoDTE: dto.tipoDTE,
      method: 'sii_portal_availability_scraping',
    });

    return toPublicFolioAvailabilityResult(result);
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

  private async resolveRequestQuantity(
    context: IssuerContext,
    tipoDTE: number,
    requestedCap: number,
  ): Promise<number> {
    const availability = await this.availabilityProvider().queryAvailableFolios(
      {
        context,
        tipoDTE,
        method: 'sii_portal_availability_scraping',
      },
    );
    if (availability.status !== 'available') return 1;

    const portalLimits = [
      availability.availableFolios,
      availability.maxAuthorizedFolios,
    ].filter(
      (value): value is number => Number.isInteger(value) && Number(value) > 0,
    );

    return portalLimits.length > 0
      ? Math.min(requestedCap, ...portalLimits)
      : 1;
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

  private availabilityProvider(): FolioAvailabilityProvider {
    const candidate = this
      .acquisitionProvider as Partial<FolioAvailabilityProvider>;
    if (typeof candidate.queryAvailableFolios !== 'function') {
      throw new Error(
        'El provider de CAF no soporta consulta de folios disponibles por scraping.',
      );
    }

    return candidate as FolioAvailabilityProvider;
  }
}

interface CafImportFolioProvider extends FolioProvider {
  addCafXml(context: IssuerContext | undefined, cafXml: string): Promise<void>;
}
