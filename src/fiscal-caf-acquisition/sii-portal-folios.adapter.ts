import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { randomUUID } from 'crypto';
import { mkdtemp, readFile, rm } from 'fs/promises';
import { Agent as HttpsAgent } from 'https';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  chromium,
  type BrowserContext,
  type Frame,
  type Locator,
  type Page,
} from 'playwright';
import {
  SiiEnvironment,
  assertCafAcquisitionRequest,
  normalizeRut,
  parseCaf,
  type CafMaterial,
  type CertificateMaterial,
  type CafAcquisitionProvider,
  type CafAcquisitionRequest,
  type CafAcquisitionResult,
  type IssuerContext,
  type SigningProvider,
} from 'sii-engine';
import { sanitizePublicPayload } from '../common/security/sensitive-redaction.util';
import { FISCAL_SIGNING_PROVIDER } from '../fiscal/fiscal-provider.tokens';
import { FiscalTokenProvider } from '../fiscal/fiscal-token.provider';
import {
  ALLOWED_CAF_ACQUISITION_TIPO_DTE,
  MAX_CAF_ACQUISITION_QUANTITY,
} from './dto/request-caf-acquisition.dto';
import {
  type FolioAvailabilityRequest,
  type FolioAvailabilityResult,
} from './fiscal-folio-availability.types';

const CAF_XML_PATTERN = /<AUTORIZACION[\s\S]*?<\/AUTORIZACION>/i;
const DEFAULT_CERTIFICATE_ORIGINS = [
  'https://zeusr.sii.cl',
  'https://zeus.sii.cl',
  'https://hercules.sii.cl',
  'https://herculesr.sii.cl',
  'https://homer.sii.cl',
  'https://palena.sii.cl',
  'https://maullin.sii.cl',
  'https://www2.sii.cl',
  'https://www4.sii.cl',
];
const MAX_DEBUG_CONTROLS = 50;
const TOKEN_COOKIE_NAME = 'TOKEN';
const SESSION_RETRY_LIMIT = 1;
const CERT_LOGIN_REDIRECT_LIMIT = 8;

type LocatorScope = Page | Frame;
type OperationProgress = (stage: string) => void;

interface BrowserCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
}

interface ExtractedFolioAvailability {
  quantityRequested?: number;
  availableFolios: number;
  maxAuthorizedFolios: number;
}

interface ReobtencionForm {
  actionUrl: string;
  method: 'get' | 'post';
  html: string;
}

interface ReobtencionContext {
  rutBody: string;
  dv: string;
  tipoDTE: number;
}

@Injectable()
export class SiiPortalFoliosAdapter
  implements CafAcquisitionProvider, OnModuleDestroy
{
  private readonly logger = new Logger(SiiPortalFoliosAdapter.name);
  private readonly activeBrowserContexts = new Set<BrowserContext>();
  private readonly activeOperationControllers = new Set<AbortController>();

  constructor(
    private readonly configService: ConfigService,
    private readonly tokenProvider: FiscalTokenProvider,
    @Inject(FISCAL_SIGNING_PROVIDER)
    private readonly signingProvider: SigningProvider,
  ) {}

  async onModuleDestroy(): Promise<void> {
    for (const controller of this.activeOperationControllers) {
      controller.abort();
    }
    await this.closeActiveBrowserContexts();
  }

  async requestCaf(
    request: CafAcquisitionRequest,
  ): Promise<CafAcquisitionResult> {
    assertCafAcquisitionRequest(request, {
      allowedTipoDTE: ALLOWED_CAF_ACQUISITION_TIPO_DTE,
      maxQuantity: this.maxQuantity(),
    });

    if (!this.automationEnabled()) {
      return this.manualActionRequiredResult(
        request,
        'Automatizacion del portal SII deshabilitada. Configure SII_PORTAL_CAF_AUTOMATION_ENABLED=true en un entorno controlado.',
      );
    }

    const requestedAt = new Date();
    this.logger.log(`Iniciando adquisicion CAF tipoDTE ${request.tipoDTE}`);

    try {
      const cafXml = await this.runWithOperationTimeout(
        'Solicitud CAF al portal SII',
        (signal, progress) =>
          this.downloadCafXmlWithSession(request, signal, progress),
      );
      const caf = parseCaf(cafXml);
      this.assertDownloadedCafMatchesRequest(caf, request);
      this.logger.log(`CAF tipoDTE ${request.tipoDTE} descargado y validado`);

      return {
        requestId: randomUUID(),
        status: 'downloaded',
        method: 'sii_portal_automation',
        context: request.context,
        tipoDTE: request.tipoDTE,
        quantityRequested: request.quantity,
        requestedAt,
        completedAt: new Date(),
        caf,
        retryable: false,
      };
    } catch (error) {
      this.logger.warn(this.safeErrorMessage(error));
      if (error instanceof SiiPortalManualActionError) {
        return this.manualActionRequiredResult(
          request,
          this.safeErrorMessage(error),
        );
      }
      return {
        requestId: randomUUID(),
        status: 'failed',
        method: 'sii_portal_automation',
        context: request.context,
        tipoDTE: request.tipoDTE,
        quantityRequested: request.quantity,
        requestedAt,
        completedAt: new Date(),
        detail: this.safeErrorMessage(error),
        retryable: true,
      };
    }
  }

  async queryAvailableFolios(
    request: FolioAvailabilityRequest,
  ): Promise<FolioAvailabilityResult> {
    assertCafAcquisitionRequest(
      {
        context: request.context,
        tipoDTE: request.tipoDTE,
        quantity: 1,
        method: 'sii_portal_automation',
      },
      {
        allowedTipoDTE: ALLOWED_CAF_ACQUISITION_TIPO_DTE,
        maxQuantity: this.maxQuantity(),
      },
    );

    if (!this.automationEnabled()) {
      return this.manualAvailabilityActionRequiredResult(
        request,
        'Automatizacion del portal SII deshabilitada. Configure SII_PORTAL_CAF_AUTOMATION_ENABLED=true en un entorno controlado.',
      );
    }

    const requestedAt = new Date();

    try {
      const availability = await this.queryAvailableFoliosWithSession(request);
      const zeroAvailabilityCounters =
        availability.availableFolios === 0 &&
        availability.maxAuthorizedFolios === 0;

      return {
        requestId: randomUUID(),
        status: 'available',
        method: 'sii_portal_availability_scraping',
        context: request.context,
        tipoDTE: request.tipoDTE,
        quantityProbed: availability.quantityRequested ?? 1,
        availableFolios: availability.availableFolios,
        maxAuthorizedFolios: availability.maxAuthorizedFolios,
        requestedAt,
        completedAt: new Date(),
        detail: zeroAvailabilityCounters
          ? `El portal SII muestra Disponible 0 y Maximo Autorizado 0 para ${tipoDteDisplayName(
              request.tipoDTE,
            )}, pero esos contadores no son concluyentes: la solicitud directa de CAF puede estar habilitada.`
          : undefined,
        retryable: false,
      };
    } catch (error) {
      this.logger.warn(this.safeErrorMessage(error));
      return {
        requestId: randomUUID(),
        status: 'failed',
        method: 'sii_portal_availability_scraping',
        context: request.context,
        tipoDTE: request.tipoDTE,
        quantityProbed: 1,
        requestedAt,
        completedAt: new Date(),
        detail: this.safeErrorMessage(error),
        retryable: true,
      };
    }
  }

  private assertDownloadedCafMatchesRequest(
    caf: CafMaterial,
    request: CafAcquisitionRequest,
  ): void {
    if (Number(caf.da.tipoDTE) !== Number(request.tipoDTE)) {
      throw new Error(
        `El portal SII devolvio CAF tipo ${caf.da.tipoDTE}, pero se solicito tipo ${request.tipoDTE}. Revise la seleccion del tipo de documento antes de importar folios.`,
      );
    }

    if (
      normalizeRut(caf.da.rutEmisor) !== normalizeRut(request.context.rutEmisor)
    ) {
      throw new Error(
        `El portal SII devolvio CAF para RUT ${caf.da.rutEmisor}, pero el contexto solicita ${request.context.rutEmisor}.`,
      );
    }
  }

  private async downloadCafXmlWithSession(
    request: CafAcquisitionRequest,
    signal: AbortSignal,
    progress: OperationProgress,
  ): Promise<string> {
    let forceRefresh = false;
    let lastError: unknown;

    for (let attempt = 0; attempt <= SESSION_RETRY_LIMIT; attempt += 1) {
      this.assertOperationActive(signal);
      try {
        return await this.downloadCafXmlAttempt(
          request,
          forceRefresh,
          signal,
          progress,
        );
      } catch (error) {
        this.assertOperationActive(signal);
        lastError = error;
        if (!this.shouldRefreshSession(error, forceRefresh)) throw error;

        this.tokenProvider.invalidate(request.context);
        forceRefresh = true;
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error('Error desconocido en portal SII');
  }

  private async queryAvailableFoliosWithSession(
    request: FolioAvailabilityRequest,
  ): Promise<ExtractedFolioAvailability> {
    let forceRefresh = false;
    let lastError: unknown;

    for (let attempt = 0; attempt <= SESSION_RETRY_LIMIT; attempt += 1) {
      try {
        return await this.queryAvailableFoliosAttempt(request, forceRefresh);
      } catch (error) {
        lastError = error;
        if (!this.shouldRefreshSession(error, forceRefresh)) throw error;

        this.tokenProvider.invalidate(request.context);
        forceRefresh = true;
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error('Error desconocido en portal SII');
  }

  private async queryAvailableFoliosAttempt(
    request: FolioAvailabilityRequest,
    forceRefresh: boolean,
  ): Promise<ExtractedFolioAvailability> {
    if (!this.httpScrapingEnabled()) {
      throw new Error(
        'Consulta de folios disponibles requiere SII_PORTAL_HTTP_SCRAPING_ENABLED distinto de false.',
      );
    }

    const authToken = await this.tokenProvider.getToken(
      request.context,
      this.signingProvider,
      forceRefresh,
    );
    const cert = await this.signingProvider.getSigningMaterial(request.context);

    return this.queryAvailableFoliosViaHttp(request, cert, authToken.token);
  }

  private async downloadCafXmlAttempt(
    request: CafAcquisitionRequest,
    forceRefresh: boolean,
    signal: AbortSignal,
    progress: OperationProgress,
  ): Promise<string> {
    const userDataDir = await mkdtemp(join(tmpdir(), 'sii-caf-'));
    let httpFailure: string | undefined;

    try {
      this.assertOperationActive(signal);
      progress(
        `Cantidad CAF seleccionada: ${request.quantity} folio(s) para tipoDTE ${request.tipoDTE}`,
      );
      progress('Obteniendo token y material de firma para portal CAF');
      const authToken = await this.tokenProvider.getToken(
        request.context,
        this.signingProvider,
        forceRefresh,
      );
      const cert = await this.signingProvider.getSigningMaterial(
        request.context,
      );
      this.assertPortalCertificateMaterial(cert);
      progress(
        `Certificado cliente disponible y vigente hasta ${cert.expiresAt.toISOString().slice(0, 10)}`,
      );
      this.assertOperationActive(signal);
      if (this.httpScrapingEnabled()) {
        try {
          progress('Intentando adquisicion CAF por HTTP');
          return await this.downloadCafXmlViaHttp(
            request,
            cert,
            authToken.token,
            progress,
          );
        } catch (error) {
          if (error instanceof SiiPortalManualActionError) {
            throw error;
          }
          if (!this.playwrightFallbackEnabled()) {
            throw error;
          }
          httpFailure = this.safeErrorMessage(error);
          this.logger.warn(httpFailure);
          progress(`Adquisicion CAF por HTTP fallo: ${httpFailure}`);
        }
      }

      progress(
        `Iniciando fallback Playwright para adquisicion CAF (headless=${String(
          this.headless(),
        )}, runtime=${this.browserRuntimeLabel()})`,
      );
      const context = await this.createBrowserContext(
        request,
        userDataDir,
        cert,
      );
      this.activeBrowserContexts.add(context);
      try {
        this.assertOperationActive(signal);
        await this.addTokenCookies(
          context,
          request.context.environment,
          authToken.token,
        );
        await this.addCertificateLoginCookies(context, request, cert);
        try {
          return await this.downloadCafXml(context, request, progress);
        } catch (error) {
          if (error instanceof SiiPortalSessionError || !httpFailure) {
            throw error;
          }

          throw new Error(
            `Scraping HTTP no obtuvo CAF: ${httpFailure}. Fallback Playwright fallo: ${this.safeErrorMessage(error)}`,
          );
        }
      } finally {
        this.activeBrowserContexts.delete(context);
        await context.close().catch(() => undefined);
      }
    } finally {
      await rm(userDataDir, { recursive: true, force: true });
    }
  }

  private async downloadCafXmlViaHttp(
    request: CafAcquisitionRequest,
    cert: CertificateMaterial,
    token: string,
    progress: OperationProgress = () => undefined,
  ): Promise<string> {
    const loginCookies = await this.fetchCertificateLoginCookies(request, cert);
    const cookieJar = new Map(
      loginCookies.map((cookie) => [cookieKey(cookie), cookie]),
    );
    for (const domain of this.httpTokenCookieDomains(
      request.context.environment,
    )) {
      const cookie: BrowserCookie = {
        name: TOKEN_COOKIE_NAME,
        value: token,
        domain,
        path: '/',
        httpOnly: true,
        secure: true,
        sameSite: 'Lax',
      };
      cookieJar.set(cookieKey(cookie), cookie);
    }
    const baseUrl = this.portalBaseUrl(request.context.environment);
    const { body: rutBody, dv } = splitRut(request.context.rutEmisor);
    const startUrl = this.startUrl(request.context.environment);
    const firstStepUrl = new URL(
      '/cvc_cgi/dte/of_solicita_folios_dcto',
      baseUrl,
    ).toString();
    const confirmUrl = new URL(
      '/cvc_cgi/dte/of_confirma_folio',
      baseUrl,
    ).toString();
    const generateUrl = new URL(
      '/cvc_cgi/dte/of_genera_folio',
      baseUrl,
    ).toString();

    await this.portalHttpGet(startUrl, baseUrl, cert, cookieJar);

    await this.portalHttpPost(
      firstStepUrl,
      {
        RUT_EMP: rutBody,
        DV_EMP: dv,
        ACEPTAR: 'Continuar',
      },
      startUrl,
      cert,
      cookieJar,
    );

    const confirmationHtml = await this.portalHttpPost(
      confirmUrl,
      {
        RUT_EMP: rutBody,
        DV_EMP: dv,
        FOLIO_INICIAL: '0',
        COD_DOCTO: String(request.tipoDTE),
        AFECTO_IVA: 'S',
        ANOTACION: 'N',
        CON_CREDITO: '',
        CON_AJUSTE: '',
        FACTOR: '',
        CANT_DOCTOS: String(request.quantity),
        ACEPTAR: 'Solicitar',
      },
      firstStepUrl,
      cert,
      cookieJar,
    );
    this.assertHttpPortalStep(
      confirmationHtml,
      'El portal SII no entrego confirmacion de folios',
    );

    const hiddenFields = extractInputValues(confirmationHtml);
    const generateFormUrl =
      findFirstFormActionUrl(confirmationHtml, confirmUrl) ?? generateUrl;
    if (
      Object.keys(hiddenFields).length === 0 &&
      !extractCafXml(confirmationHtml) &&
      !findCafDownloadUrl(confirmationHtml, confirmUrl)
    ) {
      throw new Error(
        `El portal SII no entrego campos de confirmacion para generar CAF. ${extractFinalResponseHints(confirmationHtml)}`,
      );
    }

    const cafResponse = await this.portalHttpPost(
      generateFormUrl,
      {
        ...hiddenFields,
        ACEPTAR: 'Obtener',
      },
      confirmUrl,
      cert,
      cookieJar,
    );
    let cafXml = extractCafXml(cafResponse);
    const cafDownloadUrl = findCafDownloadUrl(cafResponse, generateFormUrl);
    if (!cafXml && cafDownloadUrl) {
      const downloadResponse = await this.portalHttpGet(
        cafDownloadUrl,
        generateUrl,
        cert,
        cookieJar,
      );
      cafXml = extractCafXml(downloadResponse);
    }
    const cafArchiveFormUrl = findFormActionUrl(
      cafResponse,
      generateUrl,
      /of_genera_archivo/i,
    );
    if (!cafXml && cafArchiveFormUrl) {
      const archiveResponse = await this.portalHttpPost(
        cafArchiveFormUrl,
        {
          ...extractInputValues(cafResponse),
          ACEPTAR: 'Obtener',
        },
        generateUrl,
        cert,
        cookieJar,
      );
      cafXml = extractCafXml(archiveResponse);
    }

    if (!cafXml) {
      if (detectTimbrajeDenial(cafResponse, confirmationHtml)) {
        progress(
          'El SII no autorizo un timbraje nuevo; intentando reobtencion CAF por HTTP',
        );
        try {
          const reobtainedCaf = await this.reobtainCafXmlViaHttp(
            request,
            cert,
            cookieJar,
            progress,
          );
          progress('CAF reobtenido correctamente desde el portal SII');
          return reobtainedCaf;
        } catch (error) {
          throw new SiiPortalManualActionError(
            `El SII no autorizo un timbraje nuevo e impidio reobtener automaticamente un CAF previamente autorizado para ${tipoDteDisplayName(
              request.tipoDTE,
            )}. Revise situaciones pendientes y los rangos disponibles en Reobtencion de Folios del ambiente ${request.context.environment}. Diagnostico: ${this.safeErrorMessage(error)}`,
          );
        }
      }

      const zeroAvailabilityCounters = detectZeroAvailabilityCounters(
        confirmationHtml,
        cafResponse,
      );
      const availabilityHint = zeroAvailabilityCounters
        ? ` El portal muestra Disponible 0 y Maximo Autorizado 0 para ${tipoDteDisplayName(
            request.tipoDTE,
          )}; esos contadores no son concluyentes y se intentara el fallback del navegador.`
        : '';

      throw new Error(
        `El portal SII no devolvio CAF XML despues de confirmar folios.${availabilityHint} ${extractFinalResponseHints(cafResponse)}. Confirmacion: ${extractFinalResponseHints(confirmationHtml)}`,
      );
    }

    return cafXml;
  }

  private async reobtainCafXmlViaHttp(
    request: CafAcquisitionRequest,
    cert: CertificateMaterial,
    cookieJar: Map<string, BrowserCookie>,
    progress: OperationProgress,
  ): Promise<string> {
    const baseUrl = this.portalBaseUrl(request.context.environment);
    const { body: rutBody, dv } = splitRut(request.context.rutEmisor);
    let currentUrl = new URL(
      '/cvc_cgi/dte/rf_reobtencion1_folios',
      baseUrl,
    ).toString();
    let html = await this.portalHttpGet(currentUrl, baseUrl, cert, cookieJar);

    for (let step = 0; step < 5; step += 1) {
      progress(`Reobtencion CAF por HTTP: paso ${step + 1}`);
      this.assertHttpPortalStep(
        html,
        'El portal SII rechazo la sesion durante la reobtencion de folios',
      );

      const cafXml = await this.extractCafFromHttpResponse(
        html,
        currentUrl,
        cert,
        cookieJar,
      );
      if (cafXml) return cafXml;

      const form = selectReobtencionForm(html, currentUrl, request.tipoDTE);
      if (!form) {
        throw new Error(
          `El portal no entrego un formulario utilizable de reobtencion. ${extractFinalResponseHints(
            html,
          )}`,
        );
      }

      const params = buildReobtencionParams(form, {
        rutBody,
        dv,
        tipoDTE: request.tipoDTE,
      });
      if (!params) {
        throw new Error(
          `El portal no ofrecio un rango reobtenible para ${tipoDteDisplayName(
            request.tipoDTE,
          )}. ${extractFinalResponseHints(html)}`,
        );
      }

      const referer = currentUrl;
      currentUrl = form.actionUrl;
      html =
        form.method === 'get'
          ? await this.portalHttpGet(
              appendQueryParams(currentUrl, params),
              referer,
              cert,
              cookieJar,
            )
          : await this.portalHttpPost(
              currentUrl,
              params,
              referer,
              cert,
              cookieJar,
            );
    }

    throw new Error(
      `La reobtencion alcanzo el limite de pasos sin recibir CAF XML. ${extractFinalResponseHints(
        html,
      )}`,
    );
  }

  private async extractCafFromHttpResponse(
    html: string,
    currentUrl: string,
    cert: CertificateMaterial,
    cookieJar: Map<string, BrowserCookie>,
  ): Promise<string | undefined> {
    const inlineCaf = extractCafXml(html);
    if (inlineCaf) return inlineCaf;

    const downloadUrl = findCafDownloadUrl(html, currentUrl);
    if (!downloadUrl) return undefined;

    const downloadResponse = await this.portalHttpGet(
      downloadUrl,
      currentUrl,
      cert,
      cookieJar,
    );
    return extractCafXml(downloadResponse);
  }

  private async queryAvailableFoliosViaHttp(
    request: FolioAvailabilityRequest,
    cert: CertificateMaterial,
    token: string,
  ): Promise<ExtractedFolioAvailability> {
    const loginCookies = await this.fetchCertificateLoginCookies(request, cert);
    const cookieJar = new Map(
      loginCookies.map((cookie) => [cookieKey(cookie), cookie]),
    );
    for (const domain of this.httpTokenCookieDomains(
      request.context.environment,
    )) {
      const cookie: BrowserCookie = {
        name: TOKEN_COOKIE_NAME,
        value: token,
        domain,
        path: '/',
        httpOnly: true,
        secure: true,
        sameSite: 'Lax',
      };
      cookieJar.set(cookieKey(cookie), cookie);
    }

    const baseUrl = this.portalBaseUrl(request.context.environment);
    const { body: rutBody, dv } = splitRut(request.context.rutEmisor);
    const startUrl = this.startUrl(request.context.environment);
    const firstStepUrl = new URL(
      '/cvc_cgi/dte/of_solicita_folios_dcto',
      baseUrl,
    ).toString();
    const confirmUrl = new URL(
      '/cvc_cgi/dte/of_confirma_folio',
      baseUrl,
    ).toString();

    await this.portalHttpGet(startUrl, baseUrl, cert, cookieJar);

    await this.portalHttpPost(
      firstStepUrl,
      {
        RUT_EMP: rutBody,
        DV_EMP: dv,
        ACEPTAR: 'Continuar',
      },
      startUrl,
      cert,
      cookieJar,
    );

    const confirmationHtml = await this.portalHttpPost(
      confirmUrl,
      {
        RUT_EMP: rutBody,
        DV_EMP: dv,
        FOLIO_INICIAL: '0',
        COD_DOCTO: String(request.tipoDTE),
        AFECTO_IVA: 'S',
        ANOTACION: 'N',
        CON_CREDITO: '',
        CON_AJUSTE: '',
        FACTOR: '',
        CANT_DOCTOS: '1',
        ACEPTAR: 'Solicitar',
      },
      firstStepUrl,
      cert,
      cookieJar,
    );
    this.assertHttpPortalStep(
      confirmationHtml,
      'El portal SII no entrego disponibilidad de folios',
    );

    const availability = extractFolioAvailability(confirmationHtml);
    if (!availability) {
      throw new Error(
        `El portal SII no devolvio cantidad de folios disponibles. ${extractFinalResponseHints(
          confirmationHtml,
        )}`,
      );
    }

    return availability;
  }

  private async portalHttpGet(
    url: string,
    referer: string,
    cert: CertificateMaterial,
    cookieJar: Map<string, BrowserCookie>,
  ): Promise<string> {
    const response = await axios
      .get<string>(url, {
        headers: {
          Cookie: cookieHeaderForUrl(cookieJar, url),
          Referer: referer,
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        httpsAgent: new HttpsAgent({
          cert: cert.certificatePem,
          key: cert.privateKeyPem,
        }),
        maxRedirects: 0,
        timeout: this.httpTimeoutMs(),
        validateStatus: () => true,
      })
      .catch((error: unknown) => {
        throw new Error(
          `Portal SII GET ${sanitizeUrl(url)} fallo: ${error instanceof Error ? error.message : String(error)}`,
        );
      });

    storeSetCookies(cookieJar, response.headers['set-cookie'], url);
    const responseText = String(response.data ?? '');

    if (response.status >= 400) {
      throw new Error(`Portal SII respondio HTTP ${response.status}`);
    }

    return responseText;
  }

  private async portalHttpPost(
    url: string,
    params: Record<string, string>,
    referer: string,
    cert: CertificateMaterial,
    cookieJar: Map<string, BrowserCookie>,
  ): Promise<string> {
    const response = await axios
      .post<string>(url, new URLSearchParams(params), {
        headers: {
          Cookie: cookieHeaderForUrl(cookieJar, url),
          'Content-Type': 'application/x-www-form-urlencoded',
          Referer: referer,
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        httpsAgent: new HttpsAgent({
          cert: cert.certificatePem,
          key: cert.privateKeyPem,
        }),
        maxRedirects: 0,
        timeout: this.httpTimeoutMs(),
        validateStatus: () => true,
      })
      .catch((error: unknown) => {
        throw new Error(
          `Portal SII POST ${sanitizeUrl(url)} fallo: ${error instanceof Error ? error.message : String(error)}`,
        );
      });

    storeSetCookies(cookieJar, response.headers['set-cookie'], url);
    const responseText = String(response.data ?? '');

    if (response.status >= 400) {
      throw new Error(`Portal SII respondio HTTP ${response.status}`);
    }

    return responseText;
  }

  private assertHttpPortalStep(responseText: string, message: string): void {
    const normalizedText = normalizeForMatch(
      responseText.replace(/<[^>]+>/g, ' '),
    );
    if (hasSessionFailureMarker(normalizedText)) {
      throw new SiiPortalSessionError(message);
    }
  }

  private async createBrowserContext(
    request: CafAcquisitionRequest,
    userDataDir: string,
    cert: CertificateMaterial,
  ): Promise<BrowserContext> {
    const executablePath = this.browserExecutablePath();

    return chromium.launchPersistentContext(userDataDir, {
      acceptDownloads: true,
      channel: executablePath ? undefined : this.browserChannel(),
      executablePath,
      headless: this.headless(),
      timeout: this.timeoutMs(),
      clientCertificates: this.browserClientCertificatesEnabled()
        ? this.certificateOrigins().map((origin) => ({
            origin,
            cert: Buffer.from(cert.certificatePem, 'utf8'),
            key: Buffer.from(cert.privateKeyPem, 'utf8'),
          }))
        : [],
    });
  }

  private async downloadCafXml(
    context: BrowserContext,
    request: CafAcquisitionRequest,
    progress: OperationProgress = () => undefined,
  ): Promise<string> {
    const page = await context.newPage();
    const responseXmlCandidates: string[] = [];

    page.on('response', (response) => {
      void this.captureCafResponse(response, responseXmlCandidates);
    });
    page.on('requestfailed', (failedRequest) => {
      if (!failedRequest.isNavigationRequest()) return;
      const failure = failedRequest.failure()?.errorText || 'error desconocido';
      progress(
        `Navegacion Playwright fallo en ${sanitizeUrl(failedRequest.url())}: ${safeDebugValue(failure, 200)}`,
      );
    });

    try {
      progress('Abriendo portal SII en Playwright');
      await page.goto(this.startUrl(request.context.environment), {
        waitUntil: 'commit',
        timeout: this.timeoutMs(),
      });
    } catch (error) {
      throw new Error(
        await this.portalDebugMessage(
          page,
          `No se pudo abrir el portal SII para solicitar CAF: ${this.safeErrorMessage(error)}`,
        ),
      );
    }
    await page
      .waitForLoadState('domcontentloaded', { timeout: shortTimeout() })
      .catch(() => undefined);
    await this.ensureAuthenticated(page);
    progress('Sesion del portal SII autenticada');

    await this.tryFillRut(page, request.context.rutEmisor);
    await this.tryClick(page, continueSelectors(), /continuar|ingresar/i);
    await this.waitAfterAction(page);

    await this.tryClick(
      page,
      folioMenuSelectors(),
      /solicitud de timbraje|timbraje electr/i,
    );
    await this.waitAfterAction(page);

    await this.tryFillRut(page, request.context.rutEmisor);
    await this.selectTipoDte(page, request.tipoDTE);
    await this.fillQuantity(page, request.quantity);
    progress(`Formulario CAF preparado para tipoDTE ${request.tipoDTE}`);

    const downloadPromise = page
      .waitForEvent('download', { timeout: this.timeoutMs() })
      .catch(() => undefined);

    await this.tryClick(
      page,
      requestSelectors(),
      /solicitar|numeraci|timbraje|continuar|enviar/i,
    );
    await this.waitAfterAction(page);
    progress('Solicitud CAF enviada al portal');

    await this.tryClick(
      page,
      confirmSelectors(),
      /confirmar|obtener|descargar|generar|aceptar/i,
    );
    await this.waitAfterAction(page);
    progress('Confirmacion CAF enviada; esperando descarga');

    const download = await downloadPromise;
    const downloadedXml = download
      ? await this.readDownloadIfCaf(download)
      : undefined;
    const pageXml = extractCafXml(await page.content());
    const responseXml = responseXmlCandidates.find((item) =>
      CAF_XML_PATTERN.test(item),
    );
    const cafXml = downloadedXml ?? pageXml ?? responseXml;

    if (!cafXml) {
      throw new Error(
        await this.portalDebugMessage(
          page,
          'No se pudo descargar CAF desde el portal SII. Revise autorizacion del certificado, selectores del portal o accion manual requerida.',
        ),
      );
    }

    progress('Respuesta CAF localizada en descarga o respuesta del portal');
    return cafXml;
  }

  private async captureCafResponse(
    response: { headers(): Record<string, string>; text(): Promise<string> },
    candidates: string[],
  ): Promise<void> {
    try {
      const contentType = response.headers()['content-type'] ?? '';
      if (!/xml|text|octet-stream/i.test(contentType)) return;

      const text = await response.text();
      const cafXml = extractCafXml(text);
      if (cafXml) candidates.push(cafXml);
    } catch {
      // Ignore body read errors; the download/page-content paths remain active.
    }
  }

  private async readDownloadIfCaf(download: {
    path(): Promise<string | null>;
  }): Promise<string | undefined> {
    const path = await download.path();
    if (!path) return undefined;

    const content = await readFile(path, 'utf8');
    return extractCafXml(content);
  }

  private async addTokenCookies(
    context: BrowserContext,
    environment: SiiEnvironment,
    token: string,
  ): Promise<void> {
    await context.addCookies(
      this.tokenCookieDomains(environment).map((domain) => ({
        name: TOKEN_COOKIE_NAME,
        value: token,
        domain,
        path: '/',
        httpOnly: true,
        secure: true,
        sameSite: 'Lax' as const,
      })),
    );
  }

  private async addCertificateLoginCookies(
    context: BrowserContext,
    request: CafAcquisitionRequest,
    cert: CertificateMaterial,
  ): Promise<void> {
    if (
      this.configService.get<string>('SII_PORTAL_CERT_LOGIN_ENABLED') ===
      'false'
    ) {
      return;
    }

    const cookies = await this.fetchCertificateLoginCookies(request, cert);
    if (cookies.length === 0) return;

    await context.addCookies(cookies);
  }

  private async fetchCertificateLoginCookies(
    request: { context: IssuerContext },
    cert: CertificateMaterial,
  ): Promise<BrowserCookie[]> {
    const jar = new Map<string, BrowserCookie>();
    let currentUrl = this.certificateLoginUrl(
      request.context.environment,
      cert,
    );
    const httpsAgent = new HttpsAgent({
      cert: cert.certificatePem,
      key: cert.privateKeyPem,
    });

    for (let attempt = 0; attempt < CERT_LOGIN_REDIRECT_LIMIT; attempt += 1) {
      const response = await axios.get<string>(currentUrl, {
        headers: {
          Cookie: cookieHeaderForUrl(jar, currentUrl),
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        httpsAgent,
        maxRedirects: 0,
        timeout: this.httpTimeoutMs(),
        validateStatus: () => true,
      });

      storeSetCookies(jar, response.headers['set-cookie'], currentUrl);

      if (!isRedirectStatus(response.status)) break;

      const location = firstHeaderValue(response.headers.location as unknown);
      if (!location) break;
      currentUrl = new URL(location, currentUrl).toString();
    }

    return Array.from(jar.values()).filter((cookie) =>
      domainMatchesSii(cookie.domain),
    );
  }

  private async tryFillRut(page: Page, rut: string): Promise<void> {
    const { body, dv } = splitRut(rut);

    const filledSplit = await this.fillFirstVisible(
      page,
      rutBodySelectors(),
      body,
    );
    const filledDv = await this.fillFirstVisible(page, rutDvSelectors(), dv);
    if (filledSplit || filledDv) return;

    await this.fillFirstVisible(page, rutSingleSelectors(), rut);
  }

  private async selectTipoDte(page: Page, tipoDTE: number): Promise<void> {
    const selectors = this.selectorList('SII_PORTAL_TIPO_DTE_SELECTOR', [
      'select[name*="TIPO"]',
      'select[name*="tipo"]',
      'select[name*="Tpo"]',
      'select',
    ]);

    for (const scope of this.scopes(page)) {
      for (const selector of selectors) {
        const locator = scope.locator(selector).first();
        if (!(await isUsable(locator))) continue;
        if (await this.trySelectDteOption(locator, tipoDTE)) return;
      }
    }

    const dtePattern = new RegExp(
      tipoDteLabels(tipoDTE).map(escapeRegExp).join('|'),
      'i',
    );
    for (const scope of this.scopes(page)) {
      const radio = scope
        .getByRole('radio', { name: dtePattern })
        .or(scope.locator(`input[type="radio"][value="${tipoDTE}"]`))
        .or(scope.locator(`input[type="checkbox"][value="${tipoDTE}"]`))
        .first();
      if (await isUsable(radio)) {
        await radio.click({ timeout: shortTimeout() });
        return;
      }

      const label = scope
        .locator('label')
        .filter({ hasText: dtePattern })
        .first();
      if (await isUsable(label)) {
        await label.click({ timeout: shortTimeout() });
        return;
      }
    }

    throw new Error(
      await this.portalDebugMessage(
        page,
        'No se encontro selector usable para tipoDTE en portal SII',
      ),
    );
  }

  private async trySelectDteOption(
    locator: Locator,
    tipoDTE: number,
  ): Promise<boolean> {
    try {
      await locator.selectOption(String(tipoDTE), {
        timeout: shortTimeout(),
      });
      return true;
    } catch {
      // Continue with label/text based selection.
    }

    for (const label of tipoDteLabels(tipoDTE)) {
      try {
        await locator.selectOption({ label }, { timeout: shortTimeout() });
        return true;
      } catch {
        // Continue with next label.
      }
    }

    const option = await this.findMatchingOption(locator, tipoDTE);
    if (!option) return false;

    await locator.selectOption(option, { timeout: shortTimeout() });
    return true;
  }

  private async findMatchingOption(
    locator: Locator,
    tipoDTE: number,
  ): Promise<{ value: string } | { index: number } | undefined> {
    const optionLocator = locator.locator('option');
    const count = Math.min(await optionLocator.count(), 100);
    const labels = tipoDteLabels(tipoDTE).map(normalizeForMatch);

    for (let index = 0; index < count; index += 1) {
      const option = optionLocator.nth(index);
      const value = await option.getAttribute('value').catch(() => undefined);
      const text = await option.innerText().catch(() => '');
      const normalizedValue = normalizeForMatch(value ?? '');
      const normalizedText = normalizeForMatch(text);
      const matches =
        normalizedValue === String(tipoDTE) ||
        normalizedText.includes(String(tipoDTE)) ||
        labels.some((label) => normalizedText.includes(label));

      if (!matches) continue;

      return value ? { value } : { index };
    }

    return undefined;
  }

  private async fillQuantity(page: Page, quantity: number): Promise<void> {
    const filled = await this.fillFirstVisible(
      page,
      this.selectorList('SII_PORTAL_QUANTITY_SELECTOR', [
        'input[name*="CANT"]',
        'input[name*="cant"]',
        'input[name*="FOLIO"]',
        'input[type="number"]',
      ]),
      String(quantity),
    );

    if (!filled) {
      throw new Error('No se encontro selector usable para cantidad de folios');
    }
  }

  private async fillFirstVisible(
    page: Page,
    selectors: string[],
    value: string,
  ): Promise<boolean> {
    for (const scope of this.scopes(page)) {
      for (const selector of selectors) {
        const locator = scope.locator(selector).first();
        if (!(await isUsable(locator))) continue;

        if (await this.tryReuseReadonlyValue(locator, value)) {
          return true;
        }

        await locator.fill(value, { timeout: shortTimeout() });
        return true;
      }
    }

    return false;
  }

  private async tryReuseReadonlyValue(
    locator: Locator,
    expectedValue: string,
  ): Promise<boolean> {
    const disabled = await locator
      .isDisabled({ timeout: shortTimeout() })
      .catch(() => false);
    if (disabled) return false;

    const editable = await locator
      .isEditable({ timeout: shortTimeout() })
      .catch(() => false);
    if (editable) return false;

    const currentValue = await this.readLocatorValue(locator);
    return (
      currentValue !== undefined &&
      normalizeFieldValue(currentValue) === normalizeFieldValue(expectedValue)
    );
  }

  private async readLocatorValue(
    locator: Locator,
  ): Promise<string | undefined> {
    const inputValue = await locator
      .inputValue({ timeout: shortTimeout() })
      .catch(() => undefined);
    if (inputValue !== undefined) return inputValue;

    const attributeValue = await locator
      .getAttribute('value')
      .catch(() => undefined);
    if (attributeValue !== undefined && attributeValue !== null) {
      return attributeValue;
    }

    const innerText = await locator
      .innerText({ timeout: shortTimeout() })
      .catch(() => undefined);
    return innerText?.trim() ? innerText : undefined;
  }

  private async tryClick(
    page: Page,
    selectors: string[],
    textPattern: RegExp,
  ): Promise<boolean> {
    for (const scope of this.scopes(page)) {
      for (const selector of selectors) {
        const locator = scope.locator(selector).first();
        if (!(await isUsable(locator))) continue;

        await locator.click({ timeout: shortTimeout() });
        return true;
      }
    }

    const href = await this.findFirstHref(page, selectors);
    if (href) {
      await page.goto(resolveUrl(href, page.url()), {
        waitUntil: 'domcontentloaded',
        timeout: this.timeoutMs(),
      });
      return true;
    }

    for (const scope of this.scopes(page)) {
      const button = scope
        .getByRole('button', { name: textPattern })
        .or(scope.getByRole('link', { name: textPattern }))
        .first();
      if (await isUsable(button)) {
        await button.click({ timeout: shortTimeout() });
        return true;
      }
    }

    return false;
  }

  private async findFirstHref(
    page: Page,
    selectors: string[],
  ): Promise<string | undefined> {
    for (const scope of this.scopes(page)) {
      for (const selector of selectors) {
        const locator = scope.locator(selector).first();
        if ((await locator.count()) === 0) continue;

        const href = await locator.getAttribute('href').catch(() => undefined);
        if (href) return href;
      }
    }

    return undefined;
  }

  private scopes(page: Page): LocatorScope[] {
    return [
      page,
      ...page.frames().filter((frame) => frame !== page.mainFrame()),
    ];
  }

  private async ensureAuthenticated(page: Page): Promise<void> {
    const pageText = await this.safePageText(page);
    const normalizedText = normalizeForMatch(pageText.join(' '));
    const currentUrl = page.url();

    if (
      /homer\.sii\.cl/i.test(currentUrl) ||
      hasSessionFailureMarker(normalizedText)
    ) {
      throw new SiiPortalSessionError(
        await this.portalDebugMessage(
          page,
          'Sesion SII invalida o expirada en portal SII',
        ),
      );
    }

    if (hasAuthenticatedPortalMarker(normalizedText)) return;
  }

  private async waitAfterAction(page: Page): Promise<void> {
    await page
      .waitForLoadState('domcontentloaded', { timeout: shortTimeout() })
      .catch(() => undefined);
    await page.waitForTimeout(500);
  }

  private manualActionRequiredResult(
    request: CafAcquisitionRequest,
    detail: string,
  ): CafAcquisitionResult {
    return {
      requestId: randomUUID(),
      status: 'manual_action_required',
      method: 'sii_portal_automation',
      context: request.context,
      tipoDTE: request.tipoDTE,
      quantityRequested: request.quantity,
      requestedAt: new Date(),
      detail,
      retryable: false,
    };
  }

  private manualAvailabilityActionRequiredResult(
    request: FolioAvailabilityRequest,
    detail: string,
  ): FolioAvailabilityResult {
    return {
      requestId: randomUUID(),
      status: 'manual_action_required',
      method: 'sii_portal_availability_scraping',
      context: request.context,
      tipoDTE: request.tipoDTE,
      quantityProbed: 1,
      requestedAt: new Date(),
      detail,
      retryable: false,
    };
  }

  private automationEnabled(): boolean {
    return (
      this.configService.get<string>('SII_PORTAL_CAF_AUTOMATION_ENABLED') ===
      'true'
    );
  }

  private httpScrapingEnabled(): boolean {
    return (
      this.configService.get<string>('SII_PORTAL_HTTP_SCRAPING_ENABLED') !==
      'false'
    );
  }

  private playwrightFallbackEnabled(): boolean {
    return (
      this.configService.get<string>(
        'SII_PORTAL_PLAYWRIGHT_FALLBACK_ENABLED',
      ) === 'true'
    );
  }

  private startUrl(environment: SiiEnvironment): string {
    const configured =
      environment === SiiEnvironment.Produccion
        ? this.configService.get<string>('SII_PORTAL_START_URL_PRODUCCION')
        : this.configService.get<string>('SII_PORTAL_START_URL_CERTIFICACION');
    if (configured) return configured;

    return environment === SiiEnvironment.Produccion
      ? 'https://palena.sii.cl/cvc_cgi/dte/of_solicita_folios'
      : 'https://maullin.sii.cl/cvc_cgi/dte/of_solicita_folios';
  }

  private portalBaseUrl(environment: SiiEnvironment): string {
    return environment === SiiEnvironment.Produccion
      ? 'https://palena.sii.cl'
      : 'https://maullin.sii.cl';
  }

  private certificateLoginUrl(
    environment: SiiEnvironment,
    cert: CertificateMaterial,
  ): string {
    const configured =
      environment === SiiEnvironment.Produccion
        ? this.configService.get<string>('SII_PORTAL_CERT_LOGIN_URL_PRODUCCION')
        : this.configService.get<string>(
            'SII_PORTAL_CERT_LOGIN_URL_CERTIFICACION',
          );
    if (configured) return configured;

    const targetUrl = this.startUrl(environment);
    const { body, dv } = splitRut(cert.rutFirmante);
    const loginUrl = new URL(
      environment === SiiEnvironment.Produccion
        ? 'https://hercules.sii.cl/cgi_AUT2000/CAutInicio.cgi'
        : 'https://herculesr.sii.cl/cgi_AUT2000/CAutInicio.cgi',
    );
    loginUrl.searchParams.set('rutcntr', cert.rutFirmante);
    loginUrl.searchParams.set('rut', body);
    loginUrl.searchParams.set('dv', dv);
    loginUrl.searchParams.set('referencia', targetUrl);
    return loginUrl.toString();
  }

  private certificateOrigins(): string[] {
    return this.selectorList(
      'SII_PORTAL_CLIENT_CERT_ORIGINS',
      DEFAULT_CERTIFICATE_ORIGINS,
    );
  }

  private tokenCookieDomains(environment: SiiEnvironment): string[] {
    const configured = this.selectorList('SII_PORTAL_TOKEN_COOKIE_DOMAINS', []);
    if (configured.length > 0) return configured;

    return environment === SiiEnvironment.Produccion
      ? [
          'palena.sii.cl',
          'zeus.sii.cl',
          'homer.sii.cl',
          'www2.sii.cl',
          'www4.sii.cl',
        ]
      : [
          'maullin.sii.cl',
          'zeusr.sii.cl',
          'homer.sii.cl',
          'www2.sii.cl',
          'www4.sii.cl',
        ];
  }

  private httpTokenCookieDomains(environment: SiiEnvironment): string[] {
    const configured = this.selectorList(
      'SII_PORTAL_HTTP_TOKEN_COOKIE_DOMAINS',
      [],
    );
    if (configured.length > 0) return configured;

    const portalHost =
      environment === SiiEnvironment.Produccion
        ? 'palena.sii.cl'
        : 'maullin.sii.cl';
    return this.tokenCookieDomains(environment).filter(
      (domain) => domain.replace(/^\./, '').toLowerCase() !== portalHost,
    );
  }

  private browserExecutablePath(): string | undefined {
    return this.configService.get<string>('SII_PORTAL_BROWSER_EXECUTABLE_PATH');
  }

  private browserChannel(): string | undefined {
    return this.configService.get<string>('SII_PORTAL_BROWSER_CHANNEL');
  }

  private browserRuntimeLabel(): string {
    if (this.browserExecutablePath()) return 'ejecutable-configurado';
    if (this.browserChannel()) return `channel-${this.browserChannel()}`;
    return 'chromium-playwright';
  }

  private browserClientCertificatesEnabled(): boolean {
    return (
      this.configService.get<string>(
        'SII_PORTAL_BROWSER_CLIENT_CERT_ENABLED',
      ) !== 'false'
    );
  }

  private headless(): boolean {
    return this.configService.get<string>('SII_PORTAL_HEADLESS') !== 'false';
  }

  private timeoutMs(): number {
    const configured = Number(
      this.configService.get<string | number>('SII_PORTAL_TIMEOUT_MS'),
    );
    return Number.isInteger(configured) && configured > 0 ? configured : 60000;
  }

  private httpTimeoutMs(): number {
    const configured = Number(
      this.configService.get<string | number>('SII_PORTAL_HTTP_TIMEOUT_MS'),
    );
    return Number.isInteger(configured) && configured > 0 ? configured : 30_000;
  }

  private operationTimeoutMs(): number {
    const configured = Number(
      this.configService.get<string | number>(
        'SII_PORTAL_OPERATION_TIMEOUT_MS',
      ),
    );
    return Number.isInteger(configured) && configured > 0
      ? configured
      : 180_000;
  }

  private async runWithOperationTimeout<T>(
    label: string,
    operation: (signal: AbortSignal, progress: OperationProgress) => Promise<T>,
  ): Promise<T> {
    const controller = new AbortController();
    const timeoutMs = this.operationTimeoutMs();
    this.activeOperationControllers.add(controller);
    let lastStage = 'Inicio de operacion';
    const progress: OperationProgress = (stage) => {
      lastStage = stage;
      this.reportOperationProgress(stage);
    };

    let timeout: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(() => {
        controller.abort();
        void this.closeActiveBrowserContexts();
        reject(
          new Error(
            `${label} excedio el timeout total de ${timeoutMs} ms. Ultima etapa: ${lastStage}. Se cerraron los recursos del navegador.`,
          ),
        );
      }, timeoutMs);
    });

    try {
      return await Promise.race([
        operation(controller.signal, progress),
        timeoutPromise,
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
      this.activeOperationControllers.delete(controller);
    }
  }

  private assertOperationActive(signal: AbortSignal): void {
    if (signal.aborted) {
      throw new Error(
        'Solicitud CAF cancelada por timeout o cierre del servicio.',
      );
    }
  }

  private async closeActiveBrowserContexts(): Promise<void> {
    const contexts = Array.from(this.activeBrowserContexts);
    this.activeBrowserContexts.clear();
    await Promise.allSettled(contexts.map((context) => context.close()));
  }

  private reportOperationProgress(stage: string): void {
    this.logger.log(stage);
    if (
      this.configService.get<string>('SII_PORTAL_PROGRESS_LOG_ENABLED') ===
      'true'
    ) {
      process.stdout.write(
        `[sii-portal-caf] ${new Date().toISOString()} ${stage}\n`,
      );
    }
  }

  private maxQuantity(): number {
    return MAX_CAF_ACQUISITION_QUANTITY;
  }

  private selectorList(key: string, fallback: string[]): string[] {
    const configured = this.configService.get<string>(key);
    if (!configured) return fallback;

    return configured
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  private safeErrorMessage(error: unknown): string {
    if (!(error instanceof Error)) return 'Error desconocido en portal SII';

    return redactSensitiveMessage(error.message);
  }

  private assertPortalCertificateMaterial(cert: CertificateMaterial): void {
    if (!cert.certificatePem.includes('BEGIN CERTIFICATE')) {
      throw new Error(
        'El material de firma no contiene un certificado PEM utilizable por el portal SII.',
      );
    }
    if (!/BEGIN (?:RSA )?PRIVATE KEY/.test(cert.privateKeyPem)) {
      throw new Error(
        'El material de firma no contiene una clave privada PEM utilizable por el portal SII.',
      );
    }
    if (cert.expiresAt.getTime() <= Date.now()) {
      throw new Error('El certificado cliente esta vencido.');
    }
  }

  private shouldRefreshSession(error: unknown, forceRefresh: boolean): boolean {
    return (
      !forceRefresh &&
      (error instanceof SiiPortalSessionError ||
        (error instanceof Error &&
          /sesion sii invalida|sesion.*expirada|session.*expired/i.test(
            normalizeForMatch(error.message),
          )))
    );
  }

  private async portalDebugMessage(
    page: Page,
    message: string,
  ): Promise<string> {
    if (this.configService.get<string>('SII_PORTAL_DEBUG_FORM') !== 'true') {
      return message;
    }

    const snapshot = await settleWithin(
      this.safePortalSnapshot(page),
      2_000,
    ).catch(() => undefined);
    if (!snapshot) return message;

    return `${message}. Estado portal: ${snapshot}`;
  }

  private async safePortalSnapshot(page: Page): Promise<string> {
    const title = await page.title().catch(() => '');
    const frames = page
      .frames()
      .map((frame) => sanitizeUrl(frame.url()))
      .filter(Boolean)
      .slice(0, 10);

    return JSON.stringify({
      url: sanitizeUrl(page.url()),
      title: safeDebugValue(title),
      frames,
      text: await this.safePageText(page),
      controls: await this.safeControls(page),
    });
  }

  private async safePageText(page: Page): Promise<string[]> {
    const output: string[] = [];

    for (const scope of this.scopes(page)) {
      const text = await scope
        .locator('body')
        .innerText({ timeout: shortTimeout() })
        .catch(() => '');
      const safeText = safeDebugValue(text.replace(/\s+/g, ' ').trim(), 500);
      if (safeText) output.push(safeText);
    }

    return output.slice(0, 5);
  }

  private async safeControls(page: Page): Promise<SafeControl[]> {
    const output: SafeControl[] = [];

    for (const scope of this.scopes(page)) {
      const controls = await scope
        .locator('input, select, button, textarea, a, label, area, form, img')
        .evaluateAll((elements) =>
          elements.slice(0, MAX_DEBUG_CONTROLS).map((element) => {
            const htmlElement = element as HTMLElement;
            const tag = element.tagName.toLowerCase();
            const readableText = ['a', 'area', 'button', 'label'].includes(tag)
              ? htmlElement.innerText?.replace(/\s+/g, ' ').trim().slice(0, 80)
              : undefined;

            return {
              tag,
              type: element.getAttribute('type') ?? undefined,
              name: element.getAttribute('name') ?? undefined,
              id: element.getAttribute('id') ?? undefined,
              ariaLabel: element.getAttribute('aria-label') ?? undefined,
              alt: element.getAttribute('alt') ?? undefined,
              href: element.getAttribute('href') ?? undefined,
              action: element.getAttribute('action') ?? undefined,
              useMap: element.getAttribute('usemap') ?? undefined,
              text: readableText,
            };
          }),
        )
        .catch(() => []);

      for (const control of controls) {
        output.push({
          frameUrl: sanitizeUrl(scope.url()),
          tag: safeDebugValue(control.tag),
          type: safeDebugValue(control.type),
          name: safeDebugValue(control.name),
          id: safeDebugValue(control.id),
          ariaLabel: safeDebugValue(control.ariaLabel),
          alt: safeDebugValue(control.alt),
          href: safeDebugAttribute(control.href),
          action: safeDebugAttribute(control.action),
          useMap: safeDebugValue(control.useMap),
          text: safeDebugValue(control.text),
        });
        if (output.length >= MAX_DEBUG_CONTROLS) return output;
      }
    }

    return output;
  }
}

interface SafeControl {
  frameUrl: string;
  tag?: string;
  type?: string;
  name?: string;
  id?: string;
  ariaLabel?: string;
  alt?: string;
  href?: string;
  action?: string;
  useMap?: string;
  text?: string;
}

function isRedirectStatus(status: number): boolean {
  return [301, 302, 303, 307, 308].includes(status);
}

function storeSetCookies(
  jar: Map<string, BrowserCookie>,
  setCookieHeader: string[] | string | undefined,
  currentUrl: string,
): void {
  const headers = Array.isArray(setCookieHeader)
    ? setCookieHeader
    : setCookieHeader
      ? [setCookieHeader]
      : [];

  for (const header of headers) {
    const cookie = parseSetCookie(header, currentUrl);
    if (!cookie) continue;
    jar.set(cookieKey(cookie), cookie);
  }
}

function firstHeaderValue(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (!Array.isArray(value)) return undefined;

  const header = value.find((item): item is string => typeof item === 'string');
  return header;
}

function parseSetCookie(
  header: string,
  currentUrl: string,
): BrowserCookie | undefined {
  const [nameValue, ...attributeParts] = header.split(';');
  const separatorIndex = nameValue.indexOf('=');
  if (separatorIndex <= 0) return undefined;

  const url = new URL(currentUrl);
  const cookie: BrowserCookie = {
    name: nameValue.slice(0, separatorIndex).trim(),
    value: nameValue.slice(separatorIndex + 1).trim(),
    domain: url.hostname,
    path: '/',
    httpOnly: false,
    secure: url.protocol === 'https:',
    sameSite: 'Lax',
  };

  if (!cookie.name) return undefined;
  if (cookie.name.toLowerCase() === 'path') return undefined;

  for (const rawAttribute of attributeParts) {
    const [rawName, ...rawValueParts] = rawAttribute.trim().split('=');
    const name = rawName.toLowerCase();
    const value = rawValueParts.join('=').trim();

    if (name === 'domain' && value) cookie.domain = value.toLowerCase();
    if (name === 'path' && value) cookie.path = value;
    if (name === 'secure') cookie.secure = true;
    if (name === 'httponly') cookie.httpOnly = true;
    if (name === 'samesite') cookie.sameSite = normalizeSameSite(value);
    if (name === 'max-age' && value === '0') return undefined;
  }

  return cookie;
}

function normalizeSameSite(value: string): 'Strict' | 'Lax' | 'None' {
  if (/^strict$/i.test(value)) return 'Strict';
  if (/^none$/i.test(value)) return 'None';
  return 'Lax';
}

function cookieKey(cookie: BrowserCookie): string {
  return `${cookie.domain}:${cookie.path}:${cookie.name}`;
}

function cookieHeaderForUrl(
  jar: Map<string, BrowserCookie>,
  currentUrl: string,
): string {
  const url = new URL(currentUrl);
  return Array.from(jar.values())
    .filter((cookie) => cookieMatchesHost(cookie, url.hostname))
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join('; ');
}

function cookieMatchesHost(cookie: BrowserCookie, host: string): boolean {
  const normalizedHost = host.toLowerCase();
  const normalizedDomain = cookie.domain.replace(/^\./, '').toLowerCase();
  return (
    normalizedHost === normalizedDomain ||
    normalizedHost.endsWith(`.${normalizedDomain}`)
  );
}

function domainMatchesSii(domain: string): boolean {
  const normalizedDomain = domain.replace(/^\./, '').toLowerCase();
  return normalizedDomain === 'sii.cl' || normalizedDomain.endsWith('.sii.cl');
}

function continueSelectors(): string[] {
  return [
    'input[type="submit"][value*="Continuar" i]',
    'input[type="button"][value*="Continuar" i]',
    'button:has-text("Continuar")',
  ];
}

function folioMenuSelectors(): string[] {
  return [
    'a[href*="of_genera_folio"]',
    'area[href*="of_genera_folio"]',
    'a:has-text("Solicitud de Timbraje")',
    'area[alt*="Solicitud" i]',
    'area[alt*="Timbraje" i]',
  ];
}

function requestSelectors(): string[] {
  return [
    'input[type="submit"][value*="Solicitar" i]',
    'input[type="button"][value*="Solicitar" i]',
    'button:has-text("Solicitar")',
  ];
}

function confirmSelectors(): string[] {
  return [
    'a:has-text("Descargar")',
    'a:has-text("Obtener")',
    'input[type="submit"][value*="Obtener" i]',
    'input[type="button"][value*="Obtener" i]',
    'input[type="submit"][value*="Confirmar" i]',
    'input[type="button"][value*="Confirmar" i]',
    'button:has-text("Obtener")',
    'button:has-text("Descargar")',
    'button:has-text("Confirmar")',
  ];
}

function rutBodySelectors(): string[] {
  return [
    'input[name="RUT_EMP"]',
    'input[name="RUT"]',
    'input[name*="RUT"][maxlength="8"]',
  ];
}

function rutDvSelectors(): string[] {
  return [
    'input[name="DV_EMP"]',
    'input[name="DV"]',
    'input[name*="DV"][maxlength="1"]',
  ];
}

function rutSingleSelectors(): string[] {
  return ['input[name*="RUT"]', 'input[id*="RUT"]', 'input[type="text"]'];
}

function tipoDteLabels(tipoDTE: number): string[] {
  const labels: Record<number, string[]> = {
    33: ['33', 'FACTURA ELECTRONICA'],
    39: ['39', 'BOLETA ELECTRONICA'],
    41: ['41', 'BOLETA EXENTA ELECTRONICA'],
    56: ['56', 'NOTA DE DEBITO ELECTRONICA'],
    61: ['61', 'NOTA DE CREDITO ELECTRONICA'],
  };

  return labels[tipoDTE] ?? [String(tipoDTE)];
}

function tipoDteDisplayName(tipoDTE: number): string {
  const labels = tipoDteLabels(tipoDTE);
  return labels[1] ? `${labels[1]} (${tipoDTE})` : `DTE ${tipoDTE}`;
}

async function isUsable(locator: {
  count(): Promise<number>;
  isVisible(options?: { timeout?: number }): Promise<boolean>;
}): Promise<boolean> {
  try {
    return (
      (await locator.count()) > 0 && (await locator.isVisible({ timeout: 500 }))
    );
  } catch {
    return false;
  }
}

function splitRut(rut: string): { body: string; dv: string } {
  const normalized = rut.replace(/\./g, '').toUpperCase();
  const [body, dv] = normalized.includes('-')
    ? normalized.split('-')
    : [normalized.slice(0, -1), normalized.slice(-1)];

  return { body, dv };
}

function normalizeFieldValue(value: string): string {
  return value.replace(/\./g, '').replace(/\s+/g, '').toUpperCase().trim();
}

function extractCafXml(value: string): string | undefined {
  return (
    value.match(CAF_XML_PATTERN)?.[0] ??
    decodeHtmlEntities(value).match(CAF_XML_PATTERN)?.[0]
  );
}

function findCafDownloadUrl(html: string, baseUrl: string): string | undefined {
  for (const match of html.matchAll(
    /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi,
  )) {
    const href = decodeHtmlEntities(match[1] ?? match[2] ?? match[3] ?? '');
    if (!/(caf|xml|folio|genera)/i.test(href)) continue;
    return new URL(href, baseUrl).toString();
  }

  return undefined;
}

function findFormActionUrl(
  html: string,
  baseUrl: string,
  actionPattern: RegExp,
): string | undefined {
  for (const match of html.matchAll(/<form\b[^>]*>/gi)) {
    const action = extractHtmlAttribute(match[0], 'action');
    if (!action || !actionPattern.test(action)) continue;
    return new URL(action, baseUrl).toString();
  }

  return undefined;
}

function findFirstFormActionUrl(
  html: string,
  baseUrl: string,
): string | undefined {
  for (const match of html.matchAll(/<form\b[^>]*>/gi)) {
    const action = extractHtmlAttribute(match[0], 'action');
    if (!action) continue;
    return new URL(action, baseUrl).toString();
  }

  return undefined;
}

function extractFinalResponseHints(html: string): string {
  const forms = Array.from(html.matchAll(/<form\b[^>]*>/gi))
    .map((match) => extractHtmlAttribute(match[0], 'action'))
    .filter((value): value is string => Boolean(value))
    .map((value) => safeDebugAttribute(value))
    .slice(0, 5);
  const hrefs = Array.from(
    html.matchAll(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi),
  )
    .map((match) => decodeHtmlEntities(match[1] ?? match[2] ?? match[3] ?? ''))
    .map((value) => safeDebugAttribute(value))
    .filter((value): value is string => Boolean(value))
    .slice(0, 10);
  const inputs = Array.from(html.matchAll(/<input\b([^>]*)>/gi))
    .map((match) => extractHtmlAttribute(match[1], 'name'))
    .filter((value): value is string => Boolean(value))
    .slice(0, 20);
  return `Hints: ${JSON.stringify({
    forms,
    hrefs,
    inputs,
    markers: extractSafePortalMarkers(html),
  })}`;
}

function extractSafePortalMarkers(html: string): string[] {
  const normalized = normalizePortalTextForMatch(html);
  const markers: string[] = [];
  if (/NO SE AUTORIZA TIMBRAJE/.test(normalized)) {
    markers.push('TIMBRAJE_NO_AUTORIZADO');
  }
  if (/SITUACIONES PENDIENTES/.test(normalized)) {
    markers.push('SITUACIONES_PENDIENTES_O_FOLIOS_SUFICIENTES');
  }
  if (/DISPONIBLE\s*:?[\s]+0\b/.test(normalized)) {
    markers.push('DISPONIBLE_0');
  }
  if (/MAXIMO AUTORIZADO\s*:?[\s]+0\b/.test(normalized)) {
    markers.push('MAXIMO_AUTORIZADO_0');
  }
  if (hasSessionFailureMarker(normalized)) {
    markers.push('SESION_INVALIDA_O_EXPIRADA');
  }
  if (/NO (?:EXISTEN|HAY)[^.]*(?:RANGOS?|FOLIOS?)/.test(normalized)) {
    markers.push('SIN_RANGOS_REOBTENIBLES');
  }
  return markers;
}

function detectTimbrajeDenial(...htmlOrMessages: string[]): boolean {
  const normalized = normalizePortalTextForMatch(htmlOrMessages.join(' '));
  return (
    /NO SE AUTORIZA TIMBRAJE/.test(normalized) ||
    /RESTRINGEN EL TIMBRAJE ELECTRONICO/.test(normalized)
  );
}

function selectReobtencionForm(
  html: string,
  baseUrl: string,
  tipoDTE: number,
): ReobtencionForm | undefined {
  const forms: ReobtencionForm[] = [];
  for (const match of html.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi)) {
    const attributes = match[1] ?? '';
    const body = match[2] ?? '';
    const action = extractHtmlAttribute(attributes, 'action') ?? baseUrl;
    const method =
      extractHtmlAttribute(attributes, 'method')?.toLowerCase() === 'get'
        ? 'get'
        : 'post';
    forms.push({
      actionUrl: new URL(action, baseUrl).toString(),
      method,
      html: `${match[0]}`,
    });
  }

  const requestedLabels = tipoDteLabels(tipoDTE).map(normalizeForMatch);
  return forms
    .map((form) => {
      const normalized = normalizePortalTextForMatch(form.html);
      let score = /rf_reobtencion[123]_folios/i.test(form.actionUrl) ? 100 : 0;
      if (requestedLabels.some((label) => normalized.includes(label)))
        score += 20;
      if (/<input\b/i.test(form.html)) score += 5;
      return { form, score };
    })
    .sort((left, right) => right.score - left.score)[0]?.form;
}

function buildReobtencionParams(
  form: ReobtencionForm,
  context: ReobtencionContext,
): Record<string, string> | undefined {
  const normalized = normalizePortalTextForMatch(form.html);
  if (/NO (?:EXISTEN|HAY)[^.]*(?:RANGOS?|FOLIOS?)/.test(normalized)) {
    return undefined;
  }

  const params: Record<string, string> = {};
  const radioCandidates: Array<{
    name: string;
    value: string;
    context: string;
  }> = [];
  const submitCandidates: Array<{ name: string; value: string }> = [];

  for (const match of form.html.matchAll(/<input\b([^>]*)>/gi)) {
    const attributes = match[1] ?? '';
    const name = extractHtmlAttribute(attributes, 'name');
    if (!name || /\bdisabled\b/i.test(attributes)) continue;

    const type = (
      extractHtmlAttribute(attributes, 'type') ?? 'text'
    ).toLowerCase();
    const value = decodeHtmlEntities(
      extractHtmlAttribute(attributes, 'value') ?? '',
    );
    if (type === 'radio') {
      const start = Math.max(0, (match.index ?? 0) - 250);
      const end = Math.min(form.html.length, (match.index ?? 0) + 500);
      radioCandidates.push({
        name,
        value,
        context: normalizePortalTextForMatch(form.html.slice(start, end)),
      });
      continue;
    }
    if (type === 'checkbox' && !/\bchecked\b/i.test(attributes)) continue;
    if (type === 'submit' || type === 'button' || type === 'image') {
      submitCandidates.push({ name, value });
      continue;
    }
    if (type !== 'file') params[name] = value;
  }

  let documentTypeControlFound = false;
  let requestedDocumentTypeAvailable = false;
  for (const match of form.html.matchAll(
    /<select\b([^>]*)>([\s\S]*?)<\/select>/gi,
  )) {
    const name = extractHtmlAttribute(match[1] ?? '', 'name');
    if (!name) continue;
    const options = extractSelectOptions(match[2] ?? '');
    if (options.length === 0) continue;

    const isDocumentType =
      /(?:COD|TIPO).*(?:DOCTO|DTE)|(?:DOCTO|DTE).*(?:COD|TIPO)/i.test(name) ||
      options.some(
        (option) =>
          option.value === String(context.tipoDTE) ||
          tipoDteLabels(context.tipoDTE).some((label) =>
            normalizeForMatch(option.label).includes(normalizeForMatch(label)),
          ),
      );
    if (isDocumentType) {
      documentTypeControlFound = true;
      const selected = options.find(
        (option) =>
          option.value === String(context.tipoDTE) ||
          tipoDteLabels(context.tipoDTE).some((label) =>
            normalizeForMatch(option.label).includes(normalizeForMatch(label)),
          ),
      );
      if (!selected) continue;
      requestedDocumentTypeAvailable = true;
      params[name] = selected.value;
      continue;
    }

    const selected =
      options.find((option) => option.selected) ??
      options.find((option) => option.value.length > 0);
    if (selected) params[name] = selected.value;
  }

  if (documentTypeControlFound && !requestedDocumentTypeAvailable) {
    return undefined;
  }

  for (const name of Object.keys(params)) {
    if (/^RUT(?:_EMP)?$/i.test(name)) params[name] = context.rutBody;
    if (/^DV(?:_EMP)?$/i.test(name)) params[name] = context.dv;
    if (/(?:COD|TIPO).*(?:DOCTO|DTE)|(?:DOCTO|DTE).*(?:COD|TIPO)/i.test(name)) {
      params[name] = String(context.tipoDTE);
    }
  }
  if ('RUT_EMP' in params) params.RUT_EMP = context.rutBody;
  if ('DV_EMP' in params) params.DV_EMP = context.dv;

  if (radioCandidates.length > 0) {
    const requestedLabels = tipoDteLabels(context.tipoDTE).map(
      normalizeForMatch,
    );
    const radio =
      radioCandidates.find((candidate) =>
        requestedLabels.some((label) => candidate.context.includes(label)),
      ) ?? radioCandidates[0];
    params[radio.name] = radio.value;
  }

  const submit =
    submitCandidates.find((candidate) =>
      /REOBTENER|OBTENER|DESCARGAR|CONTINUAR|SOLICITAR/i.test(candidate.value),
    ) ?? submitCandidates[0];
  if (submit) params[submit.name] = submit.value;

  return Object.keys(params).length > 0 ? params : undefined;
}

function extractSelectOptions(
  html: string,
): Array<{ value: string; label: string; selected: boolean }> {
  return Array.from(
    html.matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/gi),
  ).map((match) => ({
    value: decodeHtmlEntities(
      extractHtmlAttribute(match[1] ?? '', 'value') ?? '',
    ),
    label: decodeHtmlEntities(match[2] ?? '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
    selected: /\bselected\b/i.test(match[1] ?? ''),
  }));
}

function appendQueryParams(
  url: string,
  params: Record<string, string>,
): string {
  const parsed = new URL(url);
  for (const [name, value] of Object.entries(params)) {
    parsed.searchParams.set(name, value);
  }
  return parsed.toString();
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
      String.fromCharCode(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCharCode(Number.parseInt(code, 10)),
    )
    .replace(/&amp;/gi, '&');
}

function extractInputValues(html: string): Record<string, string> {
  const output: Record<string, string> = {};
  for (const match of html.matchAll(/<input\b([^>]*)>/gi)) {
    const attributes = match[1];
    const name = extractHtmlAttribute(attributes, 'name');
    if (!name) continue;
    output[name] = extractHtmlAttribute(attributes, 'value') ?? '';
  }

  return output;
}

function extractHtmlAttribute(
  attributes: string,
  attributeName: string,
): string | undefined {
  const pattern = new RegExp(
    `${attributeName}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`,
    'i',
  );
  const match = attributes.match(pattern);
  return match?.[1] ?? match?.[2] ?? match?.[3];
}

function shortTimeout(): number {
  return 3000;
}

function normalizeForMatch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function sanitizeUrl(value: string): string {
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`;
  } catch {
    return safeDebugValue(value) ?? '';
  }
}

function resolveUrl(value: string, baseUrl: string): string {
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return value;
  }
}

function safeDebugValue(
  value: string | undefined | null,
  maxLength = 120,
): string | undefined {
  if (!value) return undefined;

  return redactSensitiveMessage(value)
    .replace(/\b\d{1,2}\.?\d{3}\.?\d{3}-[\dkK]\b/g, '[RUT]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[EMAIL]')
    .slice(0, maxLength);
}

function safeDebugAttribute(
  value: string | undefined | null,
): string | undefined {
  if (!value) return undefined;

  const withoutQuery = value.replace(/[?#].*$/, '');
  if (/^https?:\/\//i.test(withoutQuery)) {
    return sanitizeUrl(withoutQuery);
  }

  return safeDebugValue(withoutQuery);
}

function hasAuthenticatedPortalMarker(normalizedText: string): boolean {
  return /CERRAR SESION|PAGINA SEGURA|SOLICITUD DE TIMBRAJE/.test(
    normalizedText,
  );
}

function hasSessionFailureMarker(normalizedText: string): boolean {
  return /INGRESE SU RUT|CLAVE TRIBUTARIA|NO AUTORIZADO|SESION EXPIRADA|NO SE ENCUENTRA AUTENTICADO|ACCESO A SERVIDOR POR CERTIFICADO/.test(
    normalizedText,
  );
}

function detectZeroAvailabilityCounters(...htmlOrMessages: string[]): boolean {
  const text = normalizePortalTextForMatch(htmlOrMessages.join(' '));
  return (
    /\bDISPONIBLE\s+0\b/.test(text) &&
    /\b(?:MAXIMO|M.{0,4}XIMO)\s+AUTORIZADO\s+0\b/.test(text)
  );
}

function extractFolioAvailability(
  html: string,
): ExtractedFolioAvailability | undefined {
  const text = normalizePortalTextForMatch(html);
  const availableFolios = extractPortalIntegerAfter(text, /\bDISPONIBLE\b/);
  const maxAuthorizedFolios = extractPortalIntegerAfter(
    text,
    /\b(?:MAXIMO|M.{0,4}XIMO)\s+AUTORIZADO\b/,
  );

  if (availableFolios === undefined || maxAuthorizedFolios === undefined) {
    return undefined;
  }

  return {
    quantityRequested: extractPortalIntegerAfter(
      text,
      /\bCANTIDAD\s+SOLICITADA\b/,
    ),
    availableFolios,
    maxAuthorizedFolios,
  };
}

function extractPortalIntegerAfter(
  text: string,
  label: RegExp,
): number | undefined {
  const source = label.source.replace(/^\^/, '').replace(/\$$/, '');
  const flags = label.flags.includes('i') ? label.flags : `${label.flags}i`;
  const pattern = new RegExp(`${source}\\s*:?\\s*([0-9][0-9.]*)`, flags);
  const match = text.match(pattern);
  if (!match?.[1]) return undefined;

  const value = Number(match[1].replace(/\./g, ''));
  return Number.isInteger(value) ? value : undefined;
}

function normalizePortalTextForMatch(value: string): string {
  return normalizeForMatch(
    decodeHtmlEntities(value)
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' '),
  );
}

function redactSensitiveMessage(message: string): string {
  const sanitized = sanitizePublicPayload(message);
  return sanitized
    .replace(/<AUTORIZACION\b[\s\S]*?<\/AUTORIZACION>/gi, '[REDACTED]')
    .replace(/<CAF\b[\s\S]*?<\/CAF>/gi, '[REDACTED]')
    .replace(
      /\b(cookie|token|password|passphrase|pfx|p12)\b\s*[:=]\s*[^;<\s]+/gi,
      '[REDACTED]',
    )
    .replace(
      /cookie|token|password|passphrase|private key|pfx|p12|RSASK/gi,
      '[REDACTED]',
    );
}

function settleWithin<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`Diagnostico del portal excedio ${timeoutMs} ms`)),
      timeoutMs,
    );

    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

class SiiPortalSessionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SiiPortalSessionError';
  }
}

class SiiPortalManualActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SiiPortalManualActionError';
  }
}
