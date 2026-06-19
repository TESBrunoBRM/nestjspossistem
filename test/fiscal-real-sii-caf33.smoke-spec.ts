import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { Response } from 'supertest';
import { SiiEnvironment, TipoDTE } from 'sii-engine';
import { resolveProjectPath } from '../src/common/utils/project-path.util';
import { loadCertificateMaterialFromP12 } from '../src/fiscal/fiscal-certificate.util';
import { createFiscalTestApp } from './support/nest-test-app';
import { optionalEnv, prepareRealSiiTestEnv } from './support/env-loader';

prepareRealSiiTestEnv();

jest.setTimeout(300000);

describe('Real SII CAF 33 acquisition by portal scraping (smoke)', () => {
  let app: INestApplication;
  let apiKey: string;

  const tenantId =
    optionalEnv('REAL_SII_TEST_FACTURA33_TENANT_ID') ||
    optionalEnv('REAL_SII_TEST_TENANT_ID') ||
    'real-sii-caf33-smoke';
  const merchantId =
    optionalEnv('REAL_SII_TEST_MERCHANT_ID') || 'merchant-main';
  const branchId = optionalEnv('REAL_SII_TEST_BRANCH_ID') || 'branch-001';
  const rutEmisor =
    optionalEnv('REAL_SII_TEST_RUT_EMISOR') ||
    optionalEnv('SII_RUT_EMISOR') ||
    '';
  const rutFirmante =
    optionalEnv('REAL_SII_TEST_RUT_FIRMANTE') ||
    optionalEnv('SII_RUT_FIRMANTE') ||
    '';
  const fechaResolucion =
    optionalEnv('REAL_SII_TEST_FECHA_RESOLUCION') ||
    optionalEnv('SII_FECHA_RESOLUCION') ||
    '';
  const nroResolucionRaw =
    optionalEnv('REAL_SII_TEST_NRO_RESOLUCION') ||
    optionalEnv('SII_NRO_RESOLUCION') ||
    '';
  const nroResolucion = Number(nroResolucionRaw);
  const pfxPath = resolveRealSiiTestPfxPath();
  const pfxPassword =
    optionalEnv('REAL_SII_TEST_PFX_PASSWORD') ??
    optionalEnv('SII_PFX_PASSWORD') ??
    '';
  const cafQuantity = Number(
    optionalEnv('REAL_SII_TEST_FACTURA33_CAF_QUANTITY') ||
      optionalEnv('REAL_SII_TEST_CAF_QUANTITY') ||
      '1',
  );
  const environment = parseEnvironment(
    optionalEnv('REAL_SII_TEST_ENVIRONMENT') || 'CERTIFICACION',
  );

  beforeAll(async () => {
    if (!rutEmisor) {
      throw new Error(
        'Falta REAL_SII_TEST_RUT_EMISOR o SII_RUT_EMISOR para scraping real CAF 33.',
      );
    }
    if (!existsSync(pfxPath)) {
      throw new Error(
        `Falta el archivo PFX para scraping real CAF 33 en ${pfxPath}. Ajusta REAL_SII_TEST_PFX_PATH.`,
      );
    }
    if (!pfxPassword.trim()) {
      throw new Error(
        'Falta la password del PFX para scraping real CAF 33. Define REAL_SII_TEST_PFX_PASSWORD o SII_PFX_PASSWORD.',
      );
    }
    if (!rutFirmante) {
      throw new Error(
        'Falta REAL_SII_TEST_RUT_FIRMANTE o SII_RUT_FIRMANTE para scraping real CAF 33.',
      );
    }
    if (!fechaResolucion.trim()) {
      throw new Error(
        'Falta REAL_SII_TEST_FECHA_RESOLUCION o SII_FECHA_RESOLUCION para scraping real CAF 33.',
      );
    }
    if (!Number.isInteger(nroResolucion) || nroResolucion < 0) {
      throw new Error(
        `REAL_SII_TEST_NRO_RESOLUCION o SII_NRO_RESOLUCION es invalido (${nroResolucionRaw || 'vacio'}).`,
      );
    }
    if (!Number.isInteger(cafQuantity) || cafQuantity < 1) {
      throw new Error(
        `REAL_SII_TEST_FACTURA33_CAF_QUANTITY o REAL_SII_TEST_CAF_QUANTITY es invalido (${cafQuantity}).`,
      );
    }

    try {
      loadCertificateMaterialFromP12(
        readFileSync(pfxPath),
        pfxPassword,
        rutFirmante,
      );
    } catch (error) {
      throw new Error(
        `No se pudo abrir el PFX real de pruebas en ${pfxPath}. Causa: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    apiKey = process.env.API_KEY_FRONTEND || 'dev-ministack-key';
    app = await createFiscalTestApp();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('scrapes CAF 33 from SII certification and imports it into custody', async () => {
    const pfxBase64 = readFileSync(pfxPath).toString('base64');

    await request(testServer(app))
      .post('/api/fiscal/issuers')
      .set('x-api-key', apiKey)
      .send({
        tenantId,
        merchantId,
        branchId,
        rutEmisor,
        environment,
        fechaResolucion,
        nroResolucion,
        pfxBase64,
        pfxPassword,
        rutFirmante,
      })
      .expect(201);

    const availabilityResponse = await request(testServer(app))
      .post('/api/fiscal/folios/availability')
      .set('x-api-key', apiKey)
      .send({
        context: {
          tenantId,
          merchantId,
          branchId,
          rutEmisor,
          environment,
        },
        tipoDTE: TipoDTE.FacturaElectronica,
      })
      .expect(201);

    assertPublicPayloadSafe(availabilityResponse.body);
    const availabilityData =
      responseData<FolioAvailabilityApiData>(availabilityResponse);
    if (availabilityData.status !== 'available') {
      writeFolioAvailabilityError(availabilityResponse.body);
      throw new Error(
        folioAvailabilityBlockerMessage(
          availabilityData,
          availabilityResponse.body,
        ),
      );
    }

    const cafResponse = await request(testServer(app))
      .post('/api/fiscal/folios/requests')
      .set('x-api-key', apiKey)
      .send({
        context: {
          tenantId,
          merchantId,
          branchId,
          rutEmisor,
          environment,
        },
        tipoDTE: TipoDTE.FacturaElectronica,
        quantity: cafQuantity,
        idempotencyKey: `real-sii-scrape-caf33-${new Date()
          .toISOString()
          .replace(/[^0-9]/g, '')}`,
      })
      .expect(201);

    assertPublicPayloadSafe(cafResponse.body);

    const cafData = responseData<CafRequestApiData>(cafResponse);
    if (cafData.status !== 'imported') {
      writeCafAcquisitionError(cafResponse.body);
      throw new Error(caf33ScrapingBlockerMessage(cafData, cafResponse.body));
    }

    expect(cafData).toMatchObject({
      status: 'imported',
      tipoDTE: TipoDTE.FacturaElectronica,
      caf: expect.objectContaining({
        rutEmisor,
        tipoDTE: TipoDTE.FacturaElectronica,
      }),
    });

    const statusResponse = await request(testServer(app))
      .get('/api/fiscal/folios/status')
      .set('x-api-key', apiKey)
      .query({
        tenantId,
        rutEmisor,
        environment,
        tipoDTE: TipoDTE.FacturaElectronica,
      })
      .expect(200);

    assertPublicPayloadSafe(statusResponse.body);
    expect(hasActiveCaf(responseData<unknown>(statusResponse))).toBe(true);
  });
});

type SuperTestTarget = Parameters<typeof request>[0];

interface CafRequestApiData {
  status: string;
  detail?: string;
  retryable?: boolean;
  tipoDTE?: number;
  caf?: {
    rutEmisor?: string;
    tipoDTE?: number;
  };
}

interface FolioAvailabilityApiData {
  status: string;
  detail?: string;
  retryable?: boolean;
  availableFolios?: number;
  maxAuthorizedFolios?: number;
}

function testServer(app: INestApplication): SuperTestTarget {
  return app.getHttpServer() as SuperTestTarget;
}

function responseData<T>(response: Response): T {
  const body: unknown = response.body;
  if (!isRecord(body) || !('data' in body)) {
    throw new Error('Respuesta HTTP sin envelope data.');
  }

  return body.data as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function hasActiveCaf(statuses: unknown): boolean {
  if (!Array.isArray(statuses)) return false;

  return statuses.some((entry) => {
    const item = entry as { status?: unknown; remaining?: unknown };
    const status = item.status;
    const remaining = Number(item.remaining ?? 0);
    return (
      (status === 'active' || status === 'expiring_soon') &&
      Number.isFinite(remaining) &&
      remaining > 0
    );
  });
}

function parseEnvironment(value: string): SiiEnvironment {
  const normalized = value.trim().toUpperCase();
  return normalized === 'PRODUCCION' ||
    normalized === 'PRODUCTION' ||
    normalized === '1'
    ? SiiEnvironment.Produccion
    : SiiEnvironment.Certificacion;
}

function resolveRealSiiTestPfxPath(): string {
  const configuredPath = optionalEnv('REAL_SII_TEST_PFX_PATH');
  if (configuredPath) {
    return resolveProjectPath(configuredPath);
  }

  const candidates = [
    'secure/real-sii-tests/certificado.pfx',
    'secure/certificado.pfx',
  ].map((candidate) => resolveProjectPath(candidate));

  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0];
}

function caf33ScrapingBlockerMessage(
  cafData: CafRequestApiData,
  publicBody: unknown,
): string {
  const detail = cafData.detail ? ` Detail: ${cafData.detail}` : '';
  const retryable =
    typeof cafData.retryable === 'boolean'
      ? ` Retryable: ${cafData.retryable}.`
      : '';

  return `La solicitud real de scraping CAF 33 no termino importada. Status: ${cafData.status}.${retryable}${detail} Body publico: ${JSON.stringify(
    publicBody,
  )}`;
}

function folioAvailabilityBlockerMessage(
  availabilityData: FolioAvailabilityApiData,
  publicBody: unknown,
): string {
  const detail = availabilityData.detail
    ? ` Detail: ${availabilityData.detail}`
    : '';
  const retryable =
    typeof availabilityData.retryable === 'boolean'
      ? ` Retryable: ${availabilityData.retryable}.`
      : '';

  return `El scraping de folios CAF 33 no encontro disponibilidad para solicitar CAF. Status: ${availabilityData.status}. Disponible: ${
    availabilityData.availableFolios ?? 'n/a'
  }. Maximo Autorizado: ${
    availabilityData.maxAuthorizedFolios ?? 'n/a'
  }.${retryable}${detail} Body publico: ${JSON.stringify(publicBody)}`;
}

function writeCafAcquisitionError(body: unknown): void {
  const artifactDir = resolveProjectPath(
    'secure/real-sii-tests/artifacts/caf33/last-failed-acquisition',
  );
  mkdirSync(artifactDir, { recursive: true });
  writeFileSync(
    join(artifactDir, 'response-body.json'),
    JSON.stringify(body, null, 2),
  );
}

function writeFolioAvailabilityError(body: unknown): void {
  const artifactDir = resolveProjectPath(
    'secure/real-sii-tests/artifacts/caf33/last-failed-availability',
  );
  mkdirSync(artifactDir, { recursive: true });
  writeFileSync(
    join(artifactDir, 'response-body.json'),
    JSON.stringify(body, null, 2),
  );
}

function assertPublicPayloadSafe(body: unknown): void {
  expect(JSON.stringify(body)).not.toMatch(secretLeakPattern());
}

function secretLeakPattern(): RegExp {
  return /RSASK|rawXml|<CAF|PRIVATE KEY|privateKey|token|password|pfx|PFX/i;
}
