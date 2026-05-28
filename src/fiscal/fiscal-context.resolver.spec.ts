import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SiiEnvironment } from 'sii-engine';
import { FiscalContextResolver } from './fiscal-context.resolver';
import {
  LocalEnvFiscalIssuerStore,
  type FiscalIssuerStore,
} from './fiscal-issuer.store';

describe('FiscalContextResolver', () => {
  it('builds an IssuerContext from an authorized issuer store lookup', async () => {
    const resolveIssuer = jest.fn().mockResolvedValue({
      tenantId: 'tenant-a',
      merchantId: 'merchant-a',
      branchId: 'branch-a',
      rutEmisor: '76123456-7',
      environment: SiiEnvironment.Certificacion,
      certificateRef: 'tenant-cert',
      certificateFingerprint: 'AA:BB',
      fechaResolucion: '2020-01-01',
      nroResolucion: 0,
    });
    const store: FiscalIssuerStore = {
      resolveIssuer,
    };
    const resolver = new FiscalContextResolver(store);

    const context = await resolver.resolve({
      tenantId: 'tenant-a',
      merchantId: 'merchant-a',
      branchId: 'branch-a',
      fechaResolucion: '2020-01-01',
      nroResolucion: 0,
    });

    expect(resolveIssuer).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      merchantId: 'merchant-a',
      branchId: 'branch-a',
      fechaResolucion: '2020-01-01',
      nroResolucion: 0,
    });
    expect(context).toMatchObject({
      tenantId: 'tenant-a',
      merchantId: 'merchant-a',
      branchId: 'branch-a',
      rutEmisor: '76123456-7',
      environment: SiiEnvironment.Certificacion,
      certificateRef: 'tenant-cert',
      certificateFingerprint: 'AA:BB',
    });
  });

  it('keeps env fallback only as local/test bootstrap configuration', () => {
    const store = new LocalEnvFiscalIssuerStore(
      mockConfigService({
        NODE_ENV: 'test',
        SII_RUT_EMISOR: '11111111-1',
        SII_CERT_REF: 'default-cert',
        SII_AMBIENTE: '1',
        SII_FECHA_RESOLUCION: '2020-01-01',
        SII_NRO_RESOLUCION: '0',
      }),
    );

    const context = store.resolveIssuer();

    expect(context).toMatchObject({
      tenantId: 'local-bootstrap',
      rutEmisor: '11111111-1',
      certificateRef: 'default-cert',
      environment: SiiEnvironment.Produccion,
      fechaResolucion: '2020-01-01',
      nroResolucion: 0,
    });
  });

  it('disables env fallback in production', () => {
    const store = new LocalEnvFiscalIssuerStore(
      mockConfigService({
        NODE_ENV: 'production',
        SII_RUT_EMISOR: '11111111-1',
        SII_CERT_REF: 'default-cert',
        SII_FECHA_RESOLUCION: '2020-01-01',
        SII_NRO_RESOLUCION: '0',
      }),
    );

    expect(store.resolveIssuer()).toBeUndefined();
  });

  it('rejects missing authorized issuer context', async () => {
    const resolver = new FiscalContextResolver({
      resolveIssuer: jest.fn().mockResolvedValue(undefined),
    });

    await expect(
      resolver.resolve({
        fechaResolucion: '2020-01-01',
        nroResolucion: 0,
      }),
    ).rejects.toThrow(BadRequestException);
  });
});

function mockConfigService(values: Record<string, unknown>): ConfigService {
  return {
    get: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService;
}
