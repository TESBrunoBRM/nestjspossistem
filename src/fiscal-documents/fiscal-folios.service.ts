import { Inject, Injectable } from '@nestjs/common';
import {
  parseCaf,
  toPublicCafMetadata,
  toPublicCafStatus,
  toPublicFolioAssignment,
  type FolioProvider,
  type IssuerContext,
} from 'sii-engine';
import { FiscalContextResolver } from '../fiscal/fiscal-context.resolver';
import { FISCAL_FOLIO_PROVIDER } from './fiscal-documents.tokens';
import { FolioStatusQueryDto } from './dto/folio-status-query.dto';
import { ImportCafDto } from './dto/import-caf.dto';
import { ReserveFolioDto } from './dto/reserve-folio.dto';

@Injectable()
export class FiscalFoliosService {
  constructor(
    private readonly contextResolver: FiscalContextResolver,
    @Inject(FISCAL_FOLIO_PROVIDER)
    private readonly folioProvider: CafImportFolioProvider,
  ) {}

  async importCaf(dto: ImportCafDto) {
    const context = await this.contextResolver.resolve(dto.context);
    const caf = parseCaf(dto.cafXml);

    await this.folioProvider.addCafXml(context, dto.cafXml);

    return toPublicCafMetadata(caf);
  }

  async getStatus(query: FolioStatusQueryDto) {
    const context = await this.contextResolver.resolve(query);
    const statuses = await this.folioProvider.getStatus(context, query.tipoDTE);

    return statuses.map((status) => toPublicCafStatus(status));
  }

  async reserve(dto: ReserveFolioDto) {
    const context = await this.contextResolver.resolve(dto.context);
    const tipoDTE = dto.tipoDTE;
    const assignment =
      dto.folio !== undefined
        ? await this.folioProvider.reserveFolio(context, tipoDTE, dto.folio)
        : await this.folioProvider.getNextFolio(context, tipoDTE);

    return toPublicFolioAssignment(assignment);
  }
}

interface CafImportFolioProvider extends FolioProvider {
  addCafXml(context: IssuerContext | undefined, cafXml: string): Promise<void>;
}
