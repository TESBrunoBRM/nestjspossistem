import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import request from 'supertest';
import type { Response } from 'supertest';
import { INestApplication } from '@nestjs/common';
import { FiscalTokenProvider } from '../src/fiscal/fiscal-token.provider';
import { FiscalContextResolver } from '../src/fiscal/fiscal-context.resolver';
import { FISCAL_SIGNING_PROVIDER } from '../src/fiscal/fiscal-provider.tokens';
import { FiscalDocumentRepository } from '../src/fiscal-documents/fiscal-document.repository';
import { loadCertificateMaterialFromP12 } from '../src/fiscal/fiscal-certificate.util';
import { resolveProjectPath } from '../src/common/utils/project-path.util';
import { BoletaSiiClient, SiiEnvironment, TipoDTE } from 'sii-engine';
import { createFiscalTestApp } from './support/nest-test-app';
import { optionalEnv, prepareRealSiiTestEnv } from './support/env-loader';

prepareRealSiiTestEnv();

jest.setTimeout(300000);

describe('Real SII certification flow (smoke)', () => {
  let app: INestApplication;
  let apiKey: string;
  let internalId: string | undefined;
  let trackId: string | undefined;

  const tenantId = optionalEnv('REAL_SII_TEST_TENANT_ID') || 'real-sii-smoke';
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
  const cafQuantity = Number(optionalEnv('REAL_SII_TEST_CAF_QUANTITY') || '5');
  const skipCafRequest = parseBooleanEnv(
    optionalEnv('REAL_SII_TEST_SKIP_CAF_REQUEST'),
  );
  const environment = parseEnvironment(
    optionalEnv('REAL_SII_TEST_ENVIRONMENT') || 'CERTIFICACION',
  );

  beforeAll(async () => {
    if (!rutEmisor) {
      throw new Error(
        'Falta REAL_SII_TEST_RUT_EMISOR o SII_RUT_EMISOR para las pruebas reales del SII.',
      );
    }
    if (!existsSync(pfxPath)) {
      throw new Error(
        `Falta el archivo PFX para smoke real del SII en ${pfxPath}. Colocalo en secure/real-sii-tests/, secure/ o ajusta REAL_SII_TEST_PFX_PATH.`,
      );
    }
    if (!pfxPassword.trim()) {
      throw new Error(
        'Falta la password del PFX para las pruebas reales del SII. Define REAL_SII_TEST_PFX_PASSWORD o SII_PFX_PASSWORD.',
      );
    }
    if (!rutFirmante) {
      throw new Error(
        'Falta REAL_SII_TEST_RUT_FIRMANTE o SII_RUT_FIRMANTE para las pruebas reales del SII',
      );
    }
    if (!fechaResolucion.trim()) {
      throw new Error(
        'Falta REAL_SII_TEST_FECHA_RESOLUCION o SII_FECHA_RESOLUCION para las pruebas reales del SII. No se usan defaults de ejemplo para smoke real.',
      );
    }
    if (!Number.isInteger(nroResolucion) || nroResolucion < 0) {
      throw new Error(
        `REAL_SII_TEST_NRO_RESOLUCION o SII_NRO_RESOLUCION es invalido (${nroResolucionRaw || 'vacio'}). Debe ser un entero mayor o igual a 0 y corresponder a la resolucion DTE real del emisor en SII.`,
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
        `No se pudo abrir el PFX real de pruebas en ${pfxPath}. La password entregada no coincide con ese archivo, o el PFX no contiene un par certificado/clave valido para ${rutFirmante}. Causa: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    apiKey = process.env.API_KEY_FRONTEND || 'dev-ministack-key';
    app = await createFiscalTestApp();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    jest.restoreAllMocks();
  });

  it('stores issuer in custody and acquires a real SII token', async () => {
    const pfxBase64 = readFileSync(pfxPath).toString('base64');

    const upsertResponse = await request(testServer(app))
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

    const upsertData = responseData<FiscalIssuerApiData>(upsertResponse);
    expect(upsertData).toMatchObject({
      tenantId,
      rutEmisor,
      environment,
      custodyMode: 'aws',
    });

    const contextResolver = app.get(FiscalContextResolver);
    const tokenProvider = app.get(FiscalTokenProvider);
    const context = await contextResolver.resolve({
      tenantId,
      rutEmisor,
      environment,
    });
    const token = await tokenProvider.getToken(
      context,
      app.get(FISCAL_SIGNING_PROVIDER),
    );

    expect(token.environment).toBe(environment);
    expect(token.token).toBeTruthy();
  });

  (skipCafRequest ? it.skip : it)(
    'ensures a CAF is available, requesting one from SII certification if needed',
    async () => {
      await ensureUsableCafAvailable({
        app,
        apiKey,
        tenantId,
        merchantId,
        branchId,
        rutEmisor,
        environment,
        cafQuantity,
        allowRequest: true,
      });
    },
  );

  it('emits a boleta in SII certification using persisted certificate and CAF', async () => {
    await ensureUsableCafAvailable({
      app,
      apiKey,
      tenantId,
      merchantId,
      branchId,
      rutEmisor,
      environment,
      cafQuantity,
      allowRequest: false,
    });

    const today = new Date().toISOString().slice(0, 10);
    const sendSpy = captureBoletaUploadAttempts();
    const response = await request(testServer(app))
      .post('/api/fiscal/documents/boletas')
      .set('x-api-key', apiKey)
      .send({
        context: {
          tenantId,
          merchantId,
          branchId,
          rutEmisor,
          environment,
        },
        document: {
          idDoc: {
            tipoDTE: TipoDTE.BoletaElectronica,
            fechaEmision: today,
          },
          emisor: {
            rutEmisor,
            rznSoc: 'PRUEBA CERTIFICACION SII',
            giroEmis: 'VENTA AL POR MENOR',
            acteco: 521100,
            dirOrigen: 'AV. PROVIDENCIA 123',
            cmnaOrigen: 'PROVIDENCIA',
          },
          detalles: [
            {
              nroLinDet: 1,
              nmbItem: `Smoke ${today}`,
              qtyItem: 1,
              prcItem: 500,
              montoItem: 500,
            },
          ],
          totales: {
            mntTotal: 500,
          },
        },
      });

    if (response.status !== 201) {
      writeLastUploadError(response.body);
      throw new Error(
        `La emision real SII esperaba HTTP 201 y recibio ${response.status}. Body: ${JSON.stringify(
          response.body,
        )}`,
      );
    }

    sendSpy.mockRestore();

    const emitData = responseData<EmitBoletaApiData>(response);
    internalId = emitData.internalId;
    trackId = emitData.trackId;

    expect(emitData.internalId).toBeTruthy();
    expect(emitData.trackId).toBeTruthy();
    expect(emitData.folio).toBeGreaterThan(0);
    expect(emitData.status).toBeTruthy();

    writeDebugArtifacts(app, {
      internalId,
      tenantId,
      rutEmisor,
      environment,
      trackId,
    });
  });

  it('queries the boleta status with the returned trackId', async () => {
    expect(internalId).toBeTruthy();
    expect(trackId).toBeTruthy();

    const response = await request(testServer(app))
      .get(`/api/fiscal/documents/${internalId}/status`)
      .set('x-api-key', apiKey)
      .query({
        tenantId,
        rutEmisor,
        environment,
      })
      .expect(200);

    const statusData = responseData<SendStatusApiData>(response);
    expect(statusData.trackId).toBe(trackId);
    expect(statusData.normalizedStatus).toBeTruthy();
  });
});

type SuperTestTarget = Parameters<typeof request>[0];

interface FiscalIssuerApiData {
  tenantId: string;
  rutEmisor: string;
  environment: SiiEnvironment;
  custodyMode: string;
}

interface EmitBoletaApiData {
  internalId: string;
  trackId: string;
  folio: number;
  status: string;
}

interface SendStatusApiData {
  trackId: string;
  normalizedStatus: string;
}

interface CafRequestApiData {
  status: string;
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

async function ensureUsableCafAvailable(input: {
  app: INestApplication;
  apiKey: string;
  tenantId: string;
  merchantId: string;
  branchId: string;
  rutEmisor: string;
  environment: SiiEnvironment;
  cafQuantity: number;
  allowRequest: boolean;
}): Promise<void> {
  const initialStatusResponse = await request(testServer(input.app))
    .get('/api/fiscal/folios/status')
    .set('x-api-key', input.apiKey)
    .query({
      tenantId: input.tenantId,
      rutEmisor: input.rutEmisor,
      environment: input.environment,
      tipoDTE: TipoDTE.BoletaElectronica,
    })
    .expect(200);

  if (hasActiveCaf(responseData<unknown>(initialStatusResponse))) {
    return;
  }

  if (!input.allowRequest) {
    throw new Error(
      'No existe un CAF activo para la boleta de pruebas y REAL_SII_TEST_SKIP_CAF_REQUEST impide solicitar uno nuevo. Carga/importa un CAF antes de ejecutar este smoke.',
    );
  }

  const cafResponse = await request(testServer(input.app))
    .post('/api/fiscal/folios/requests')
    .set('x-api-key', input.apiKey)
    .send({
      context: {
        tenantId: input.tenantId,
        merchantId: input.merchantId,
        branchId: input.branchId,
        rutEmisor: input.rutEmisor,
        environment: input.environment,
      },
      tipoDTE: TipoDTE.BoletaElectronica,
      quantity: input.cafQuantity,
      idempotencyKey: `real-sii-caf-${new Date().toISOString().slice(0, 10)}`,
    })
    .expect(201);

  expect(responseData<CafRequestApiData>(cafResponse).status).toBe('imported');

  const finalStatusResponse = await request(testServer(input.app))
    .get('/api/fiscal/folios/status')
    .set('x-api-key', input.apiKey)
    .query({
      tenantId: input.tenantId,
      rutEmisor: input.rutEmisor,
      environment: input.environment,
      tipoDTE: TipoDTE.BoletaElectronica,
    })
    .expect(200);

  expect(hasActiveCaf(responseData<unknown>(finalStatusResponse))).toBe(true);
}

function parseBooleanEnv(value?: string): boolean {
  if (!value) return false;
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
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

type BoletaSend = (
  ...args: Parameters<BoletaSiiClient['send']>
) => ReturnType<BoletaSiiClient['send']>;

function captureBoletaUploadAttempts(): jest.SpyInstance {
  const originalSendCandidate: unknown = Object.getOwnPropertyDescriptor(
    BoletaSiiClient.prototype,
    'send',
  )?.value;

  if (typeof originalSendCandidate !== 'function') {
    throw new Error('No se pudo capturar BoletaSiiClient.send original.');
  }

  const originalSend = originalSendCandidate as BoletaSend;

  return jest
    .spyOn(BoletaSiiClient.prototype, 'send')
    .mockImplementation(function (
      this: BoletaSiiClient,
      ...params: Parameters<BoletaSiiClient['send']>
    ) {
      const [signedEnvelope] = params;
      writeUploadAttemptArtifacts(signedEnvelope);
      return originalSend(...params);
    });
}

function writeUploadAttemptArtifacts(signedEnvelope: string): void {
  const folio = extractXmlValue(signedEnvelope, 'Folio') ?? 'unknown';
  const artifactDir = resolveProjectPath(
    `secure/real-sii-tests/artifacts/${folio}`,
  );
  mkdirSync(artifactDir, { recursive: true });

  writeFileSync(
    join(artifactDir, 'signed-envio-boleta-attempt.xml'),
    signedEnvelope,
  );

  const tedXml = extractXmlBlock(signedEnvelope, 'TED');
  if (tedXml) {
    writeFileSync(join(artifactDir, 'ted-attempt.xml'), tedXml);
  }

  const dteXml = extractXmlBlock(signedEnvelope, 'DTE');
  if (dteXml) {
    writeFileSync(join(artifactDir, 'signed-dte-attempt.xml'), dteXml);
  }
}

function writeLastUploadError(body: unknown): void {
  const artifactDir = resolveProjectPath(
    'secure/real-sii-tests/artifacts/last-failed-upload',
  );
  mkdirSync(artifactDir, { recursive: true });
  writeFileSync(
    join(artifactDir, 'response-body.json'),
    JSON.stringify(body, null, 2),
  );
}

function writeDebugArtifacts(
  app: INestApplication,
  input: {
    internalId: string;
    tenantId: string;
    rutEmisor: string;
    environment: SiiEnvironment;
    trackId?: string;
  },
): void {
  const repository = app.get(FiscalDocumentRepository);
  const record = repository.findById(input.internalId);
  if (!record) return;

  const artifactDir = resolveProjectPath(
    `secure/real-sii-tests/artifacts/${record.folio}`,
  );
  mkdirSync(artifactDir, { recursive: true });

  if (record.tedXml) {
    writeFileSync(join(artifactDir, 'ted.xml'), record.tedXml);
  }
  if (record.signedDteXml) {
    writeFileSync(join(artifactDir, 'signed-dte.xml'), record.signedDteXml);
  }
  if (record.signedEnvelopeXml) {
    writeFileSync(
      join(artifactDir, 'signed-envio-boleta.xml'),
      record.signedEnvelopeXml,
    );
  }

  writeFileSync(
    join(artifactDir, 'metadata.json'),
    JSON.stringify(
      {
        internalId: input.internalId,
        folio: record.folio,
        trackId: input.trackId,
        tenantId: input.tenantId,
        rutEmisor: input.rutEmisor,
        environment: input.environment,
        writtenAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
}

function extractXmlValue(xml: string, tagName: string): string | undefined {
  const match = xml.match(
    new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)</${tagName}>`, 'i'),
  );
  const value = match?.[1]?.trim();
  return value ? value : undefined;
}

function extractXmlBlock(xml: string, tagName: string): string | undefined {
  const match = xml.match(
    new RegExp(`<${tagName}\\b[^>]*>[\\s\\S]*?</${tagName}>`, 'i'),
  );
  return match?.[0];
}
