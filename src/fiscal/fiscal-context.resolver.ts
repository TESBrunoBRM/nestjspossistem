import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { IssuerContext } from 'sii-engine';
import { IssuerContextDto } from './dto/issuer-context.dto';
import {
  FISCAL_ISSUER_STORE,
  type FiscalIssuerStore,
} from './fiscal-issuer.store';

@Injectable()
export class FiscalContextResolver {
  constructor(
    @Inject(FISCAL_ISSUER_STORE)
    private readonly issuerStore: FiscalIssuerStore,
  ) {}

  async resolve(dto?: IssuerContextDto): Promise<IssuerContext> {
    const issuer = await this.issuerStore.resolveIssuer(dto);

    if (!issuer) {
      throw new BadRequestException(
        'No existe contexto fiscal autorizado para el tenant/emisor solicitado',
      );
    }

    return {
      tenantId: issuer.tenantId,
      merchantId: issuer.merchantId,
      branchId: issuer.branchId,
      environment: issuer.environment,
      rutEmisor: issuer.rutEmisor,
      fechaResolucion: issuer.fechaResolucion,
      nroResolucion: issuer.nroResolucion,
      certificateRef: issuer.certificateRef,
      certificateFingerprint: issuer.certificateFingerprint,
    };
  }
}
