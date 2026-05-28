import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SiiEnvironment } from 'sii-engine';
import { IssuerContextDto } from './dto/issuer-context.dto';

export const FISCAL_ISSUER_STORE = Symbol('FISCAL_ISSUER_STORE');

export interface FiscalIssuerConfig {
  tenantId?: string;
  merchantId?: string;
  branchId?: string;
  environment: SiiEnvironment;
  rutEmisor: string;
  fechaResolucion: string;
  nroResolucion: number;
  certificateRef: string;
  certificateFingerprint?: string;
}

export interface FiscalIssuerStore {
  resolveIssuer(
    lookup: IssuerContextDto | undefined,
  ): Promise<FiscalIssuerConfig | undefined> | FiscalIssuerConfig | undefined;
}

@Injectable()
export class LocalEnvFiscalIssuerStore implements FiscalIssuerStore {
  constructor(private readonly configService: ConfigService) {}

  resolveIssuer(lookup?: IssuerContextDto): FiscalIssuerConfig | undefined {
    if (this.configService.get<string>('NODE_ENV') === 'production') {
      return undefined;
    }

    const rutEmisor = this.configService.get<string>('SII_RUT_EMISOR');
    const fechaResolucion =
      lookup?.fechaResolucion ??
      this.configService.get<string>('SII_FECHA_RESOLUCION');
    const nroResolucion = resolveResolutionNumber(
      lookup?.nroResolucion,
      this.configService.get<string | number>('SII_NRO_RESOLUCION'),
    );

    if (!rutEmisor || !fechaResolucion || nroResolucion === undefined) {
      return undefined;
    }

    return {
      tenantId: lookup?.tenantId ?? 'local-bootstrap',
      merchantId: lookup?.merchantId,
      branchId: lookup?.branchId,
      environment: this.resolveEnvironment(),
      rutEmisor,
      fechaResolucion,
      nroResolucion,
      certificateRef:
        this.configService.get<string>('SII_CERT_REF') ?? 'default',
      certificateFingerprint: this.configService.get<string>(
        'SII_CERT_FINGERPRINT',
      ),
    };
  }

  private resolveEnvironment(): SiiEnvironment {
    const configured = this.configService.get<string | number>('SII_AMBIENTE');

    if (
      configured === 1 ||
      configured === '1' ||
      configured === SiiEnvironment.Produccion
    ) {
      return SiiEnvironment.Produccion;
    }

    return SiiEnvironment.Certificacion;
  }
}

function resolveResolutionNumber(
  dtoValue?: number,
  configured?: string | number,
): number | undefined {
  if (dtoValue !== undefined) return dtoValue;
  if (configured === undefined || configured === '') return undefined;

  const value = Number(configured);
  return Number.isInteger(value) && value >= 0 ? value : undefined;
}
