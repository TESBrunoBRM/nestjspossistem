import { INestApplication } from '@nestjs/common';
import { TipoDTE, type IssuerContext } from 'sii-engine';
import { FiscalCustodyService } from '../src/fiscal-storage/fiscal-custody.service';
import { createFiscalTestApp } from './support/nest-test-app';
import { optionalEnv, prepareRealSiiTestEnv } from './support/env-loader';
import {
  parseCertificationDteType,
  parseCertificationEnvironment,
  resolveCertificationTenantId,
} from './support/sii-certification-options';

prepareRealSiiTestEnv();

jest.setTimeout(60000);

const tipoDTE = parseCertificationDteType();

describe(`Custodied CAF ${tipoDTE} precondition`, () => {
  let app: INestApplication;

  const tenantId = resolveCertificationTenantId(tipoDTE);
  const rutEmisor = optionalEnv('REAL_SII_TEST_RUT_EMISOR') || '';
  const environment = parseCertificationEnvironment();

  beforeAll(async () => {
    if (!rutEmisor) {
      throw new Error(
        'Falta REAL_SII_TEST_RUT_EMISOR para consultar custodia.',
      );
    }
    app = await createFiscalTestApp();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it(`has an active CAF ${tipoDTE} with available folios`, async () => {
    const custody = app.get(FiscalCustodyService);
    const profile = await custody.getIssuerProfile({
      tenantId,
      rutEmisor,
      environment,
    });
    if (!profile) {
      throw new Error(
        `No existe emisor custodiado para tenant=${tenantId}, rut=${rutEmisor}, ambiente=${environment}.`,
      );
    }

    const context: IssuerContext = {
      tenantId: profile.tenantId,
      merchantId: profile.merchantId,
      branchId: profile.branchId,
      rutEmisor: profile.rutEmisor,
      environment: profile.environment,
      fechaResolucion: profile.fechaResolucion,
      nroResolucion: profile.nroResolucion,
      certificateRef: profile.certificateRef,
      certificateFingerprint: profile.certificateFingerprint,
    };
    const statuses = await custody.getCafStatus(context, tipoDTE);
    const active = statuses.filter(
      (entry) =>
        (entry.status === 'active' || entry.status === 'expiring_soon') &&
        entry.remaining > 0,
    );

    if (active.length === 0) {
      const summary = statuses.map((entry) => ({
        type: entry.caf.da.tipoDTE,
        range: `${entry.caf.da.rangeStart}-${entry.caf.da.rangeEnd}`,
        status: entry.status,
        remaining: entry.remaining,
      }));
      throw new Error(
        `No hay CAF ${tipoDTE} activo con folios disponibles en custodia. Estado: ${JSON.stringify(summary)}.`,
      );
    }

    expect(active.every((entry) => entry.caf.da.tipoDTE === tipoDTE)).toBe(
      true,
    );
    expect(
      active.reduce((sum, entry) => sum + entry.remaining, 0),
    ).toBeGreaterThan(0);
    expect([TipoDTE.FacturaElectronica, TipoDTE.BoletaElectronica]).toContain(
      tipoDTE,
    );
  });
});
