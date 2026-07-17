import { SiiEnvironment, TipoDTE } from 'sii-engine';
import { optionalEnv } from './env-loader';

export const SUPPORTED_CERTIFICATION_DTE_TYPES = [
  TipoDTE.FacturaElectronica,
  TipoDTE.FacturaNoAfectaExentaElectronica,
  TipoDTE.BoletaElectronica,
  TipoDTE.BoletaNoAfectaExentaElectronica,
  TipoDTE.NotaDebito,
  TipoDTE.NotaCredito,
] as const;

export type SupportedCertificationDte =
  (typeof SUPPORTED_CERTIFICATION_DTE_TYPES)[number];

const DTE_NAMES: Record<SupportedCertificationDte, string> = {
  [TipoDTE.FacturaElectronica]: 'factura33',
  [TipoDTE.FacturaNoAfectaExentaElectronica]: 'factura34',
  [TipoDTE.BoletaElectronica]: 'boleta39',
  [TipoDTE.BoletaNoAfectaExentaElectronica]: 'boleta41',
  [TipoDTE.NotaDebito]: 'nota56',
  [TipoDTE.NotaCredito]: 'nota61',
};

export function parseCertificationDteType(
  value = optionalEnv('REAL_SII_TEST_CAF_TYPE'),
): SupportedCertificationDte {
  const parsed = Number(value);
  if (!isSupportedCertificationDte(parsed)) {
    throw new Error(
      `REAL_SII_TEST_CAF_TYPE debe ser uno de ${SUPPORTED_CERTIFICATION_DTE_TYPES.join(', ')}; valor recibido: ${value || 'vacio'}.`,
    );
  }
  return parsed;
}

function isSupportedCertificationDte(
  value: number,
): value is SupportedCertificationDte {
  return SUPPORTED_CERTIFICATION_DTE_TYPES.some(
    (tipoDTE) => Number(tipoDTE) === value,
  );
}

export function resolveCertificationTenantId(
  tipoDTE: SupportedCertificationDte,
): string {
  const dteSpecific = optionalEnv(`REAL_SII_TEST_DTE_${tipoDTE}_TENANT_ID`);
  if (dteSpecific) return dteSpecific;

  if (tipoDTE === TipoDTE.FacturaElectronica) {
    return (
      optionalEnv('REAL_SII_TEST_FACTURA33_TENANT_ID') ||
      'certification-factura33'
    );
  }

  if (tipoDTE === TipoDTE.BoletaElectronica) {
    return optionalEnv('REAL_SII_TEST_TENANT_ID') || 'certification-boleta39';
  }

  return (
    optionalEnv('REAL_SII_TEST_LEGACY_TENANT_ID') ||
    `certification-dte${tipoDTE}`
  );
}

export function certificationDteName(
  tipoDTE: SupportedCertificationDte,
): string {
  return DTE_NAMES[tipoDTE];
}

export function parseCertificationEnvironment(): SiiEnvironment {
  const value = optionalEnv('REAL_SII_TEST_ENVIRONMENT') || 'CERTIFICACION';
  if (value.trim().toUpperCase() !== 'CERTIFICACION') {
    throw new Error(
      'Las pruebas reales solo admiten REAL_SII_TEST_ENVIRONMENT=CERTIFICACION.',
    );
  }
  return SiiEnvironment.Certificacion;
}

export function parseCafAcquisitionQuantity(
  tipoDTE: SupportedCertificationDte,
): number {
  void tipoDTE;
  const raw = optionalEnv('REAL_SII_TEST_CAF_QUANTITY') || '1';
  const quantity = Number(raw);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 50) {
    throw new Error(
      `REAL_SII_TEST_CAF_QUANTITY debe ser un entero entre 1 y 50; valor recibido: ${raw}.`,
    );
  }
  return quantity;
}
