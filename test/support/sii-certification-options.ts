import { SiiEnvironment, TipoDTE } from 'sii-engine';
import { optionalEnv } from './env-loader';

export type SupportedCertificationDte =
  | TipoDTE.FacturaElectronica
  | TipoDTE.BoletaElectronica;

export function parseCertificationDteType(
  value = optionalEnv('REAL_SII_TEST_CAF_TYPE'),
): SupportedCertificationDte {
  const parsed = Number(value);
  if (
    parsed !== TipoDTE.FacturaElectronica &&
    parsed !== TipoDTE.BoletaElectronica
  ) {
    throw new Error(
      `REAL_SII_TEST_CAF_TYPE debe ser 33 o 39; valor recibido: ${value || 'vacio'}.`,
    );
  }
  return parsed;
}

export function resolveCertificationTenantId(
  tipoDTE: SupportedCertificationDte,
): string {
  if (tipoDTE === TipoDTE.FacturaElectronica) {
    return (
      optionalEnv('REAL_SII_TEST_FACTURA33_TENANT_ID') ||
      'certification-factura33'
    );
  }
  return optionalEnv('REAL_SII_TEST_TENANT_ID') || 'certification-boleta39';
}

export function certificationDteName(
  tipoDTE: SupportedCertificationDte,
): 'factura' | 'boleta' {
  return tipoDTE === TipoDTE.FacturaElectronica ? 'factura' : 'boleta';
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
  const defaultQuantity = tipoDTE === TipoDTE.FacturaElectronica ? '50' : '5';
  const raw = optionalEnv('REAL_SII_TEST_CAF_QUANTITY') || defaultQuantity;
  const quantity = Number(raw);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 50) {
    throw new Error(
      `REAL_SII_TEST_CAF_QUANTITY debe ser un entero entre 1 y 50; valor recibido: ${raw}.`,
    );
  }
  return quantity;
}
