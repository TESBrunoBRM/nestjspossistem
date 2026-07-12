import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import request from 'supertest';
import type { Response } from 'supertest';
import { INestApplication } from '@nestjs/common';
import { FiscalTokenProvider } from '../src/fiscal/fiscal-token.provider';
import { FiscalContextResolver } from '../src/fiscal/fiscal-context.resolver';
import { FISCAL_SIGNING_PROVIDER } from '../src/fiscal/fiscal-provider.tokens';
import { FISCAL_CAF_ACQUISITION_PROVIDER } from '../src/fiscal-caf-acquisition/fiscal-caf-acquisition.tokens';
import { FiscalDocumentRepository } from '../src/fiscal-documents/fiscal-document.repository';
import { loadCertificateMaterialFromP12 } from '../src/fiscal/fiscal-certificate.util';
import { resolveProjectPath } from '../src/common/utils/project-path.util';
import { LegacySiiClient, SiiEnvironment, TipoDTE } from 'sii-engine';
import { createFiscalTestApp } from './support/nest-test-app';
import { optionalEnv, prepareRealSiiTestEnv } from './support/env-loader';
import {
  assertNormalSmokeDteStatus,
  assertNormalSmokeSendStatus,
  shouldRetryNormalSmokeDteStatus,
  shouldRetryNormalSmokeSendStatus,
} from './support/sii-smoke-assertions';

prepareRealSiiTestEnv();

jest.setTimeout(300000);

describe('Real SII certification flow for factura 33 (smoke)', () => {
  let app: INestApplication;
  let apiKey: string;
  let internalId: string | undefined;
  let trackId: string | undefined;
  let factura33PreconditionBlocker: string | undefined;
  let factura33EmissionBlocker: string | undefined;
  let custodyOnlyCafRequestSpy: jest.SpyInstance | undefined;

  const tenantId =
    optionalEnv('REAL_SII_TEST_FACTURA33_TENANT_ID') ||
    optionalEnv('REAL_SII_TEST_TENANT_ID') ||
    'real-sii-factura33-smoke';
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
    optionalEnv('REAL_SII_TEST_FACTURA33_CAF_QUANTITY') || '50',
  );
  const existingCaf33Path = resolveOptionalRealSiiTestCaf33Path();
  const skipCafRequest = parseBooleanEnv(
    optionalEnv('REAL_SII_TEST_SKIP_CAF_REQUEST'),
  );
  const environment = parseEnvironment(
    optionalEnv('REAL_SII_TEST_ENVIRONMENT') || 'CERTIFICACION',
  );
  const statusSettleDelayMs = Number(
    optionalEnv('REAL_SII_TEST_STATUS_SETTLE_MS') || '5000',
  );
  const statusPollTimeoutMs = Number(
    optionalEnv('REAL_SII_TEST_STATUS_POLL_TIMEOUT_MS') || '120000',
  );
  const statusPollIntervalMs = Number(
    optionalEnv('REAL_SII_TEST_STATUS_POLL_INTERVAL_MS') || '10000',
  );

  beforeAll(async () => {
    smokeLog('Validando precondiciones locales');
    if (environment !== SiiEnvironment.Certificacion) {
      throw new Error(
        'El smoke fiscal-real-sii-factura33 solo puede ejecutarse con REAL_SII_TEST_ENVIRONMENT=CERTIFICACION. Se rechazo la ejecucion antes de contactar al SII.',
      );
    }
    smokeLog('Ambiente validado: CERTIFICACION');
    if (!rutEmisor) {
      throw new Error(
        'Falta REAL_SII_TEST_RUT_EMISOR o SII_RUT_EMISOR para el smoke real de factura 33.',
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
        'Falta REAL_SII_TEST_FECHA_RESOLUCION o SII_FECHA_RESOLUCION para las pruebas reales del SII.',
      );
    }
    if (!Number.isInteger(nroResolucion) || nroResolucion < 0) {
      throw new Error(
        `REAL_SII_TEST_NRO_RESOLUCION o SII_NRO_RESOLUCION es invalido (${nroResolucionRaw || 'vacio'}).`,
      );
    }
    if (!Number.isInteger(cafQuantity) || cafQuantity < 1 || cafQuantity > 50) {
      throw new Error(
        `REAL_SII_TEST_FACTURA33_CAF_QUANTITY es invalido (${cafQuantity}). Debe ser un entero entre 1 y 50 y se usa como maximo, no como cantidad obligatoria.`,
      );
    }
    assertValidSettleDelay(statusSettleDelayMs);
    assertValidPollingConfig(statusPollTimeoutMs, statusPollIntervalMs);
    if (existingCaf33Path && !existsSync(existingCaf33Path)) {
      throw new Error(
        `REAL_SII_TEST_FACTURA33_CAF_PATH apunta a un archivo inexistente: ${existingCaf33Path}`,
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
    app = await runWithHeartbeat(
      'Inicializando aplicacion y custodia AWS',
      () => createFiscalTestApp(),
    );
    if (skipCafRequest) {
      const acquisitionProvider = app.get<{
        requestCaf: (...args: unknown[]) => Promise<unknown>;
      }>(FISCAL_CAF_ACQUISITION_PROVIDER);
      custodyOnlyCafRequestSpy = jest
        .spyOn(acquisitionProvider, 'requestCaf')
        .mockRejectedValue(
          new Error(
            'El modo custody-only prohibe solicitar o reobtener CAF desde el SII.',
          ),
        );
    }
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    jest.restoreAllMocks();
  });

  it('stores issuer in custody and acquires a real SII token', async () => {
    smokeLog('Guardando emisor y certificado en custodia');
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
    const token = await runWithHeartbeat('Solicitando token real al SII', () =>
      tokenProvider.getToken(context, app.get(FISCAL_SIGNING_PROVIDER)),
    );

    expect(token.environment).toBe(environment);
    expect(token.token).toBeTruthy();
    smokeLog('Token SII obtenido correctamente');
  });

  it(
    skipCafRequest
      ? 'uses only the active CAF 33 already persisted in custody'
      : 'ensures a CAF 33 is available, requesting one from SII certification if needed',
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
        existingCaf33Path: skipCafRequest ? undefined : existingCaf33Path,
        allowRequest: !skipCafRequest,
        onExternalBlocker: (message) => {
          factura33PreconditionBlocker = message;
        },
      });
      if (skipCafRequest) {
        expect(custodyOnlyCafRequestSpy).not.toHaveBeenCalled();
        smokeLog(
          'CAF 33 custodiado confirmado; no se solicito ni reobtuvo CAF',
        );
      }
    },
  );

  it('emits a factura 33 in SII certification using persisted certificate and CAF 33', async () => {
    smokeLog('Verificando CAF 33 antes de emitir');
    if (factura33PreconditionBlocker) {
      throw new Error(
        `No se ejecuta emision real DTE 33 porque falta CAF 33 autorizado. ${factura33PreconditionBlocker}`,
      );
    }

    await ensureUsableCafAvailable({
      app,
      apiKey,
      tenantId,
      merchantId,
      branchId,
      rutEmisor,
      environment,
      cafQuantity,
      existingCaf33Path: skipCafRequest ? undefined : existingCaf33Path,
      allowRequest: false,
      onExternalBlocker: (message) => {
        factura33PreconditionBlocker = message;
      },
    });

    const today = new Date().toISOString().slice(0, 10);
    const sendSpy = captureLegacyUploadAttempts();
    let response: Response;
    try {
      response = await runWithHeartbeat(
        'Construyendo, firmando y enviando factura 33',
        () =>
          request(testServer(app))
            .post('/api/fiscal/documents/facturas')
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
                  tipoDTE: TipoDTE.FacturaElectronica,
                  fechaEmision: today,
                  formaPago: 1,
                },
                emisor: {
                  rutEmisor,
                  rznSoc: 'RESUELTA DESDE CAF CUSTODIADO',
                  giroEmis:
                    optionalEnv('REAL_SII_TEST_EMISOR_GIRO') ||
                    'SERVICIOS INFORMATICOS',
                  acteco: Number(
                    optionalEnv('REAL_SII_TEST_EMISOR_ACTECO') || 620200,
                  ),
                  dirOrigen:
                    optionalEnv('REAL_SII_TEST_EMISOR_DIRECCION') ||
                    'AV. PROVIDENCIA 123',
                  cmnaOrigen:
                    optionalEnv('REAL_SII_TEST_EMISOR_COMUNA') || 'PROVIDENCIA',
                  ciudadOrigen:
                    optionalEnv('REAL_SII_TEST_EMISOR_CIUDAD') || 'SANTIAGO',
                },
                receptor: {
                  rutRecep:
                    optionalEnv('REAL_SII_TEST_FACTURA33_RECEPTOR_RUT') ||
                    optionalEnv('REAL_SII_TEST_RECEPTOR_RUT') ||
                    '60803000-K',
                  rznSocRecep:
                    optionalEnv(
                      'REAL_SII_TEST_FACTURA33_RECEPTOR_RAZON_SOCIAL',
                    ) ||
                    optionalEnv('REAL_SII_TEST_RECEPTOR_RAZON_SOCIAL') ||
                    'SERVICIO DE IMPUESTOS INTERNOS',
                  giroRecep:
                    optionalEnv('REAL_SII_TEST_FACTURA33_RECEPTOR_GIRO') ||
                    optionalEnv('REAL_SII_TEST_RECEPTOR_GIRO') ||
                    'ADMINISTRACION PUBLICA',
                  dirRecep:
                    optionalEnv('REAL_SII_TEST_FACTURA33_RECEPTOR_DIRECCION') ||
                    optionalEnv('REAL_SII_TEST_RECEPTOR_DIRECCION') ||
                    'TEATINOS 120',
                  cmnaRecep:
                    optionalEnv('REAL_SII_TEST_FACTURA33_RECEPTOR_COMUNA') ||
                    optionalEnv('REAL_SII_TEST_RECEPTOR_COMUNA') ||
                    'SANTIAGO',
                  ciudadRecep:
                    optionalEnv('REAL_SII_TEST_FACTURA33_RECEPTOR_CIUDAD') ||
                    optionalEnv('REAL_SII_TEST_RECEPTOR_CIUDAD') ||
                    'SANTIAGO',
                },
                detalles: [
                  {
                    nroLinDet: 1,
                    nmbItem: `Smoke factura 33 ${today}`,
                    qtyItem: 1,
                    unmdItem: 'UN',
                    prcItem: 1000,
                    montoItem: 1000,
                  },
                ],
                totales: {
                  mntNeto: 1000,
                  tasaIVA: 19,
                  iva: 190,
                  mntTotal: 1190,
                },
              },
            }),
      );
    } finally {
      sendSpy.mockRestore();
    }

    if (response.status !== 201) {
      writeLastUploadError(response.body);
      factura33EmissionBlocker = `La emision real DTE 33 esperaba HTTP 201 y recibio ${response.status}. Body: ${JSON.stringify(
        response.body,
      )}. El folio fue reservado antes del upload y no debe reutilizarse automaticamente hasta descartar recepcion por el SII.`;
      throw new Error(factura33EmissionBlocker);
    }

    const emitData = responseData<EmitFacturaApiData>(response);
    internalId = emitData.internalId;
    trackId = emitData.trackId;

    expect(emitData.internalId).toBeTruthy();
    expect(emitData.trackId).toBeTruthy();
    expect(emitData.folio).toBeGreaterThan(0);
    expect(JSON.stringify(response.body)).not.toMatch(secretLeakPattern());

    writeDebugArtifacts(app, {
      internalId,
      tenantId,
      rutEmisor,
      environment,
      trackId,
    });

    assertNormalSmokeSendStatus(
      emitData.status,
      'Upload de factura 33',
      emitData.detail,
    );
    smokeLog(`Factura enviada; trackId recibido y folio ${emitData.folio}`);
  });

  it('queries the factura 33 send status with the returned trackId', async () => {
    const emitted = requireFactura33EmissionState({
      internalId,
      trackId,
      blocker: factura33EmissionBlocker ?? factura33PreconditionBlocker,
    });

    smokeLog(
      `Esperando ${statusSettleDelayMs} ms antes de consultar estado de envio`,
    );
    await delay(statusSettleDelayMs);

    const statusResult = await pollSmokeResult({
      label: 'Consultando estado de envio en SII',
      timeoutMs: statusPollTimeoutMs,
      intervalMs: statusPollIntervalMs,
      query: async () => {
        const response = await request(testServer(app))
          .get(`/api/fiscal/documents/${emitted.internalId}/status`)
          .set('x-api-key', apiKey)
          .query({
            tenantId,
            rutEmisor,
            environment,
          })
          .expect(200);
        return {
          data: responseData<SendStatusApiData>(response),
          publicBody: response.body,
        };
      },
      shouldRetry: (result) =>
        shouldRetryNormalSmokeSendStatus(result.data.normalizedStatus),
      status: (result) => result.data.normalizedStatus,
    });

    const statusData = statusResult.data;
    expect(statusData.trackId).toBe(emitted.trackId);
    expect(JSON.stringify(statusResult.publicBody)).not.toMatch(
      secretLeakPattern(),
    );
    assertNormalSmokeSendStatus(
      statusData.normalizedStatus,
      'Consulta de envio de factura 33',
      statusData.detail,
      statusData.statistics,
    );
    smokeLog(`Estado de envio aceptable: ${statusData.normalizedStatus}`);
  });

  it('queries the factura 33 DTE status and printed sample without leaking secrets', async () => {
    const emitted = requireFactura33EmissionState({
      internalId,
      trackId,
      blocker: factura33EmissionBlocker ?? factura33PreconditionBlocker,
    });

    const dteStatusResult = await pollSmokeResult({
      label: 'Consultando estado tributario del DTE 33',
      timeoutMs: statusPollTimeoutMs,
      intervalMs: statusPollIntervalMs,
      query: async () => {
        const response = await request(testServer(app))
          .get(`/api/fiscal/documents/${emitted.internalId}/dte-status`)
          .set('x-api-key', apiKey)
          .query({
            tenantId,
            rutEmisor,
            environment,
          })
          .expect(200);
        return {
          data: responseData<DteStatusApiData>(response),
          publicBody: response.body,
        };
      },
      shouldRetry: (result) =>
        shouldRetryNormalSmokeDteStatus(result.data.status),
      status: (result) => result.data.status,
    });

    const dteStatusData = dteStatusResult.data;
    expect(dteStatusData.tipoDTE).toBe(TipoDTE.FacturaElectronica);
    expect(dteStatusData.folio).toBeGreaterThan(0);
    expect(JSON.stringify(dteStatusResult.publicBody)).not.toMatch(
      secretLeakPattern(),
    );
    assertNormalSmokeDteStatus(
      dteStatusData.status,
      'Consulta DTE de factura 33',
      dteStatusData.glosa,
    );
    smokeLog(`Estado DTE aceptable: ${dteStatusData.status}`);

    const printedSampleResponse = await request(testServer(app))
      .get(`/api/fiscal/documents/${emitted.internalId}/printed-sample`)
      .set('x-api-key', apiKey)
      .expect(200);

    const printedSample = responseData<PrintedSampleApiData>(
      printedSampleResponse,
    );
    expect(printedSample.tipoDTE).toBe(TipoDTE.FacturaElectronica);
    expect(printedSample.folio).toBeGreaterThan(0);
    expect(JSON.stringify(printedSampleResponse.body)).not.toMatch(
      secretLeakPattern(),
    );
  });
});

type SuperTestTarget = Parameters<typeof request>[0];

interface FiscalIssuerApiData {
  tenantId: string;
  rutEmisor: string;
  environment: SiiEnvironment;
  custodyMode: string;
}

interface EmitFacturaApiData {
  internalId: string;
  trackId: string;
  folio: number;
  status: string;
  detail?: string;
}

interface SendStatusApiData {
  trackId: string;
  normalizedStatus: string;
  detail?: string;
  statistics?: { rechazados?: number; reparos?: number };
}

interface DteStatusApiData {
  tipoDTE: number;
  folio: number;
  status: string;
  glosa?: string;
}

interface PrintedSampleApiData {
  tipoDTE: number;
  folio: number;
}

interface CafRequestApiData {
  status: string;
  detail?: string;
  retryable?: boolean;
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

function summarizeCustodiedCafs(statuses: unknown): string {
  if (!Array.isArray(statuses) || statuses.length === 0) {
    return 'No hay registros CAF 33 custodiados para este tenant/emisor/ambiente.';
  }

  const summaries = statuses.map((entry) => {
    const item = entry as {
      status?: unknown;
      remaining?: unknown;
      caf?: { rangeStart?: unknown; rangeEnd?: unknown };
    };
    const rangeStart = Number(item.caf?.rangeStart);
    const rangeEnd = Number(item.caf?.rangeEnd);
    const range =
      Number.isInteger(rangeStart) && Number.isInteger(rangeEnd)
        ? `${rangeStart}-${rangeEnd}`
        : 'desconocido';
    const remaining = Number(item.remaining ?? 0);
    return `rango=${range}, estado=${String(item.status ?? 'desconocido')}, restantes=${Number.isFinite(remaining) ? remaining : 'desconocido'}`;
  });

  return `CAF 33 custodiados: ${summaries.join('; ')}.`;
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
  existingCaf33Path?: string;
  allowRequest: boolean;
  onExternalBlocker?: (message: string) => void;
}): Promise<void> {
  smokeLog('Consultando CAF 33 activo en custodia');
  const initialStatusResponse = await request(testServer(input.app))
    .get('/api/fiscal/folios/status')
    .set('x-api-key', input.apiKey)
    .query({
      tenantId: input.tenantId,
      rutEmisor: input.rutEmisor,
      environment: input.environment,
      tipoDTE: TipoDTE.FacturaElectronica,
    })
    .expect(200);
  const initialStatuses = responseData<unknown>(initialStatusResponse);

  if (hasActiveCaf(initialStatuses)) {
    smokeLog('CAF 33 activo encontrado en custodia');
    return;
  }

  const custodyDiagnostic = summarizeCustodiedCafs(initialStatuses);
  smokeLog(`No hay CAF 33 activo en custodia. ${custodyDiagnostic}`);

  if (input.existingCaf33Path) {
    smokeLog('Importando CAF 33 configurado para pruebas');
    await importExistingCaf33({
      ...input,
      existingCaf33Path: input.existingCaf33Path,
    });

    const importedStatusResponse = await request(testServer(input.app))
      .get('/api/fiscal/folios/status')
      .set('x-api-key', input.apiKey)
      .query({
        tenantId: input.tenantId,
        rutEmisor: input.rutEmisor,
        environment: input.environment,
        tipoDTE: TipoDTE.FacturaElectronica,
      })
      .expect(200);

    if (hasActiveCaf(responseData<unknown>(importedStatusResponse))) {
      smokeLog('CAF 33 configurado importado y activo');
      return;
    }

    const blocker = `Se importo el CAF 33 desde ${input.existingCaf33Path}, pero no quedo activo con folios disponibles para ${input.rutEmisor}. Verifique RUT, tipoDTE 33, rango y fecha del CAF.`;
    input.onExternalBlocker?.(blocker);
    throw new Error(blocker);
  }

  if (!input.allowRequest) {
    const blocker = `No existe un CAF activo para factura 33 y el modo custody-only prohibe solicitar o importar otro. ${custodyDiagnostic}`;
    input.onExternalBlocker?.(blocker);
    throw new Error(blocker);
  }

  const cafResponse = await runWithHeartbeat(
    'Solicitando y descargando CAF 33 desde el portal SII',
    () =>
      request(testServer(input.app))
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
          tipoDTE: TipoDTE.FacturaElectronica,
          quantity: input.cafQuantity,
          idempotencyKey: `real-sii-caf-33-${new Date()
            .toISOString()
            .replace(/[^0-9]/g, '')}`,
        })
        .expect(201),
  );

  const cafData = responseData<CafRequestApiData>(cafResponse);
  if (cafData.status !== 'imported') {
    writeCafAcquisitionError(cafResponse.body);
    const blocker = caf33AcquisitionBlockerMessage(cafData, cafResponse.body);
    input.onExternalBlocker?.(blocker);
    throw new Error(blocker);
  }
  expect(JSON.stringify(cafResponse.body)).not.toMatch(secretLeakPattern());

  const finalStatusResponse = await request(testServer(input.app))
    .get('/api/fiscal/folios/status')
    .set('x-api-key', input.apiKey)
    .query({
      tenantId: input.tenantId,
      rutEmisor: input.rutEmisor,
      environment: input.environment,
      tipoDTE: TipoDTE.FacturaElectronica,
    })
    .expect(200);

  expect(hasActiveCaf(responseData<unknown>(finalStatusResponse))).toBe(true);
  smokeLog('CAF 33 nuevo importado y disponible en custodia');
}

async function importExistingCaf33(input: {
  app: INestApplication;
  apiKey: string;
  tenantId: string;
  merchantId: string;
  branchId: string;
  rutEmisor: string;
  environment: SiiEnvironment;
  existingCaf33Path: string;
}): Promise<void> {
  const importResponse = await request(testServer(input.app))
    .post('/api/fiscal/folios/cafs')
    .set('x-api-key', input.apiKey)
    .send({
      context: {
        tenantId: input.tenantId,
        merchantId: input.merchantId,
        branchId: input.branchId,
        rutEmisor: input.rutEmisor,
        environment: input.environment,
      },
      cafXml: readFileSync(input.existingCaf33Path, 'utf8'),
    })
    .expect(201);

  expect(JSON.stringify(importResponse.body)).not.toMatch(secretLeakPattern());
}

function caf33AcquisitionBlockerMessage(
  cafData: CafRequestApiData,
  publicBody: unknown,
): string {
  const detail = cafData.detail ? ` Detail: ${cafData.detail}` : '';
  const retryable =
    typeof cafData.retryable === 'boolean'
      ? ` Retryable: ${cafData.retryable}.`
      : '';

  return `La solicitud real de CAF 33 esperaba status imported y recibio ${cafData.status}.${retryable}${detail} Body publico: ${JSON.stringify(
    publicBody,
  )}`;
}

function requireFactura33EmissionState(input: {
  internalId?: string;
  trackId?: string;
  blocker?: string;
}): { internalId: string; trackId: string } {
  if (input.internalId && input.trackId) {
    return { internalId: input.internalId, trackId: input.trackId };
  }

  throw new Error(
    `No hay Factura 33 con internalId y trackId disponible para consultar. Causa: ${
      input.blocker ?? 'internalId/trackId no fueron generados.'
    }`,
  );
}

function parseBooleanEnv(value?: string): boolean {
  if (!value) return false;
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

function assertValidSettleDelay(value: number): void {
  if (!Number.isInteger(value) || value < 0 || value > 60_000) {
    throw new Error(
      `REAL_SII_TEST_STATUS_SETTLE_MS es invalido (${String(value)}). Debe ser un entero entre 0 y 60000.`,
    );
  }
}

function assertValidPollingConfig(timeoutMs: number, intervalMs: number): void {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 10_000 || timeoutMs > 300_000) {
    throw new Error(
      `REAL_SII_TEST_STATUS_POLL_TIMEOUT_MS es invalido (${String(timeoutMs)}). Debe ser un entero entre 10000 y 300000.`,
    );
  }
  if (
    !Number.isInteger(intervalMs) ||
    intervalMs < 1_000 ||
    intervalMs > 60_000 ||
    intervalMs > timeoutMs
  ) {
    throw new Error(
      `REAL_SII_TEST_STATUS_POLL_INTERVAL_MS es invalido (${String(intervalMs)}). Debe ser un entero entre 1000 y 60000 y no superar el timeout.`,
    );
  }
}

async function pollSmokeResult<T>(input: {
  label: string;
  timeoutMs: number;
  intervalMs: number;
  query: () => Promise<T>;
  shouldRetry: (result: T) => boolean;
  status: (result: T) => string;
}): Promise<T> {
  const startedAt = Date.now();
  let attempt = 0;

  while (true) {
    attempt += 1;
    const result = await runWithHeartbeat(
      `${input.label} (intento ${attempt})`,
      input.query,
    );
    if (!input.shouldRetry(result)) return result;

    const remainingMs = input.timeoutMs - (Date.now() - startedAt);
    if (remainingMs <= 0) {
      smokeLog(
        `${input.label}: se agoto la espera con estado ${input.status(result)}`,
      );
      return result;
    }

    const waitMs = Math.min(input.intervalMs, remainingMs);
    smokeLog(
      `${input.label}: estado ${input.status(result)} aun pendiente; reintento en ${waitMs} ms`,
    );
    await delay(waitMs);
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function runWithHeartbeat<T>(
  label: string,
  action: () => PromiseLike<T>,
): Promise<T> {
  const startedAt = Date.now();
  smokeLog(`${label}: inicio`);
  const heartbeat = setInterval(() => {
    smokeLog(`${label}: sigue en curso (${elapsedSeconds(startedAt)} s)`);
  }, 10_000);
  heartbeat.unref();

  try {
    const result = await action();
    smokeLog(`${label}: completado (${elapsedSeconds(startedAt)} s)`);
    return result;
  } catch (error) {
    smokeLog(`${label}: fallo (${elapsedSeconds(startedAt)} s)`);
    throw error;
  } finally {
    clearInterval(heartbeat);
  }
}

function smokeLog(message: string): void {
  process.stdout.write(
    `[real-sii:factura33] ${new Date().toISOString()} ${message}\n`,
  );
}

function elapsedSeconds(startedAt: number): number {
  return Math.round((Date.now() - startedAt) / 1000);
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

function resolveOptionalRealSiiTestCaf33Path(): string | undefined {
  const configuredPath =
    optionalEnv('REAL_SII_TEST_FACTURA33_CAF_PATH') ||
    optionalEnv('REAL_SII_TEST_CAF33_PATH');

  return configuredPath ? resolveProjectPath(configuredPath) : undefined;
}

type LegacySend = (
  ...args: Parameters<LegacySiiClient['send']>
) => ReturnType<LegacySiiClient['send']>;

function captureLegacyUploadAttempts(): jest.SpyInstance {
  const originalSendCandidate: unknown = Object.getOwnPropertyDescriptor(
    LegacySiiClient.prototype,
    'send',
  )?.value;

  if (typeof originalSendCandidate !== 'function') {
    throw new Error('No se pudo capturar LegacySiiClient.send original.');
  }

  const originalSend = originalSendCandidate as LegacySend;

  return jest
    .spyOn(LegacySiiClient.prototype, 'send')
    .mockImplementation(async function (
      this: LegacySiiClient,
      ...params: Parameters<LegacySiiClient['send']>
    ) {
      const [signedEnvelope] = params;
      writeUploadAttemptArtifacts(signedEnvelope);
      try {
        return await originalSend.apply(this, params);
      } catch (error) {
        writeLegacyUploadFailureArtifacts(error);
        throw error;
      }
    });
}

function writeUploadAttemptArtifacts(signedEnvelope: string): void {
  const folio = extractXmlValue(signedEnvelope, 'Folio') ?? 'unknown';
  const artifactDir = resolveProjectPath(
    `secure/real-sii-tests/artifacts/factura33/${folio}`,
  );
  mkdirSync(artifactDir, { recursive: true });

  writeFileSync(
    join(artifactDir, 'signed-envio-dte-attempt.xml'),
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

function writeLegacyUploadFailureArtifacts(error: unknown): void {
  const artifactDir = resolveProjectPath(
    'secure/real-sii-tests/artifacts/factura33/last-failed-upload',
  );
  mkdirSync(artifactDir, { recursive: true });

  const rawResponse =
    typeof error === 'object' &&
    error !== null &&
    'rawResponse' in error &&
    typeof (error as { rawResponse?: unknown }).rawResponse === 'string'
      ? (error as { rawResponse: string }).rawResponse
      : undefined;

  writeFileSync(
    join(artifactDir, 'error-summary.json'),
    JSON.stringify(
      {
        name: error instanceof Error ? error.name : typeof error,
        message: error instanceof Error ? error.message : String(error),
        code:
          typeof error === 'object' && error !== null && 'code' in error
            ? String((error as { code?: unknown }).code ?? '')
            : undefined,
        hasRawResponse: Boolean(rawResponse),
      },
      null,
      2,
    ),
  );

  if (rawResponse) {
    writeFileSync(
      join(artifactDir, 'raw-upload-response.txt'),
      sanitizeDiagnosticText(rawResponse),
    );
  }
}

function sanitizeDiagnosticText(value: string): string {
  return value
    .replace(/TOKEN=[^;"'\s<]+/gi, 'TOKEN=[REDACTED]')
    .replace(/<TOKEN>[\s\S]*?<\/TOKEN>/gi, '<TOKEN>[REDACTED]</TOKEN>')
    .replace(/<RSASK>[\s\S]*?<\/RSASK>/gi, '<RSASK>[REDACTED]</RSASK>')
    .replace(
      /<X509Certificate>[\s\S]*?<\/X509Certificate>/gi,
      '<X509Certificate>[REDACTED]</X509Certificate>',
    );
}

function writeLastUploadError(body: unknown): void {
  const artifactDir = resolveProjectPath(
    'secure/real-sii-tests/artifacts/factura33/last-failed-upload',
  );
  mkdirSync(artifactDir, { recursive: true });
  writeFileSync(
    join(artifactDir, 'response-body.json'),
    JSON.stringify(body, null, 2),
  );
}

function writeCafAcquisitionError(body: unknown): void {
  const artifactDir = resolveProjectPath(
    'secure/real-sii-tests/artifacts/factura33/last-failed-caf-acquisition',
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
    `secure/real-sii-tests/artifacts/factura33/${record.folio}`,
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
      join(artifactDir, 'signed-envio-dte.xml'),
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
        tipoDTE: record.tipoDTE,
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

function secretLeakPattern(): RegExp {
  return /RSASK|rawXml|<CAF|PRIVATE KEY|token|password|pfx|PFX/i;
}
