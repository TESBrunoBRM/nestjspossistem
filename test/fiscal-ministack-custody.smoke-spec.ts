import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { SiiEnvironment, TipoDTE } from 'sii-engine';
import { FiscalContextResolver } from '../src/fiscal/fiscal-context.resolver';
import { FiscalSigningProvider } from '../src/fiscal/fiscal-signing.provider';
import { createFiscalTestApp } from './support/nest-test-app';
import { prepareMinistackTestEnv } from './support/env-loader';
import {
  buildCafXml,
  createTestPfxWithoutRut,
} from './support/fiscal-fixtures';

prepareMinistackTestEnv();

jest.setTimeout(120000);

describe('Fiscal custody on Ministack (smoke)', () => {
  let app: INestApplication;
  let apiKey: string;

  const tenantId = 'ministack-custody-smoke';
  const rutEmisor = '76123456-0';
  const rutFirmante = '12345678-5';
  const pfxPassword = 'custody-smoke-password';

  beforeAll(async () => {
    apiKey = process.env.API_KEY_FRONTEND || 'dev-ministack-key';
    app = await createFiscalTestApp();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    jest.restoreAllMocks();
  });

  it('persists issuer certificate and CAF in AWS-mode custody across app restarts even when the certificate requires rutFirmante override', async () => {
    const pfx = createTestPfxWithoutRut(
      pfxPassword,
      'Firmante smoke sin RUT explicito',
    );

    const upsertResponse = await request(app.getHttpServer())
      .post('/api/fiscal/issuers')
      .set('x-api-key', apiKey)
      .send({
        tenantId,
        merchantId: 'merchant-ministack',
        branchId: 'branch-ministack',
        rutEmisor,
        environment: SiiEnvironment.Certificacion,
        fechaResolucion: '2020-01-01',
        nroResolucion: 80,
        pfxBase64: pfx.pfxBuffer.toString('base64'),
        pfxPassword,
        rutFirmante,
      });

    if (upsertResponse.status !== 201) {
      throw new Error(
        `Upsert issuer fallo con HTTP ${upsertResponse.status}: ${JSON.stringify(upsertResponse.body)}`,
      );
    }

    expect(upsertResponse.body.data).toMatchObject({
      tenantId,
      rutEmisor,
      environment: SiiEnvironment.Certificacion,
      custodyMode: 'aws',
    });

    await request(app.getHttpServer())
      .post('/api/fiscal/folios/cafs')
      .set('x-api-key', apiKey)
      .send({
        context: {
          tenantId,
          merchantId: 'merchant-ministack',
          branchId: 'branch-ministack',
          rutEmisor,
          environment: SiiEnvironment.Certificacion,
        },
        cafXml: buildCafXml(rutEmisor, 900, 905),
      })
      .expect(201);

    await app.close();
    app = await createFiscalTestApp();

    const issuerResponse = await request(app.getHttpServer())
      .get('/api/fiscal/issuers')
      .set('x-api-key', apiKey)
      .query({
        tenantId,
        rutEmisor,
        environment: SiiEnvironment.Certificacion,
      })
      .expect(200);

    expect(issuerResponse.body.data).toMatchObject({
      tenantId,
      rutEmisor,
      environment: SiiEnvironment.Certificacion,
      custodyMode: 'aws',
    });

    const statuses = await request(app.getHttpServer())
      .get('/api/fiscal/folios/status')
      .set('x-api-key', apiKey)
      .query({
        tenantId,
        rutEmisor,
        environment: SiiEnvironment.Certificacion,
        tipoDTE: TipoDTE.BoletaElectronica,
      })
      .expect(200);

    expect(statuses.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: 'active',
          remaining: 6,
          caf: expect.objectContaining({
            rutEmisor,
            rangeStart: 900,
            rangeEnd: 905,
          }),
        }),
      ]),
    );

    const reserveResponse = await request(app.getHttpServer())
      .post('/api/fiscal/folios/reserve')
      .set('x-api-key', apiKey)
      .send({
        context: {
          tenantId,
          rutEmisor,
          environment: SiiEnvironment.Certificacion,
        },
        tipoDTE: TipoDTE.BoletaElectronica,
        folio: 900,
      })
      .expect(201);

    expect(reserveResponse.body.data).toMatchObject({
      folio: 900,
      caf: expect.objectContaining({
        rutEmisor,
        rangeStart: 900,
        rangeEnd: 905,
      }),
    });

    const contextResolver = app.get(FiscalContextResolver);
    const signingProvider = app.get(FiscalSigningProvider);
    const context = await contextResolver.resolve({
      tenantId,
      rutEmisor,
      environment: SiiEnvironment.Certificacion,
    });
    const material = await signingProvider.getSigningMaterial(context);

    expect(material.rutFirmante).toBe(rutFirmante);
    expect(material.certificatePem).toContain('BEGIN CERTIFICATE');
    expect(material.privateKeyPem).toContain('BEGIN RSA PRIVATE KEY');
  });
});
