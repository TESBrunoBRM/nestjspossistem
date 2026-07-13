import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { BrowserContext } from 'playwright';
import {
  SiiEnvironment,
  TipoDTE,
  type CafAcquisitionRequest,
  type IssuerContext,
  type SigningProvider,
} from 'sii-engine';
import type { FiscalTokenProvider } from '../fiscal/fiscal-token.provider';
import { SiiPortalFoliosAdapter } from './sii-portal-folios.adapter';
import { TEST_CAF_AUTHORIZATION_DATE } from '../../test/support/fiscal-fixtures';

const issuerContext = {
  environment: SiiEnvironment.Certificacion,
  rutEmisor: '76123456-0',
  fechaResolucion: '2020-01-01',
  nroResolucion: 80,
  certificateRef: 'default',
};

describe('SiiPortalFoliosAdapter', () => {
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('obtains an SII token, seeds TOKEN cookies, and then downloads the CAF', async () => {
    const { adapter, tokenProvider, signingProvider } = createAdapter();
    const context = createMockBrowserContext();
    const downloadSpy = jest
      .spyOn(adapterInternals(adapter), 'downloadCafXml')
      .mockResolvedValue(cafXml('76123456-0', 1, 10));
    jest
      .spyOn(adapterInternals(adapter), 'createBrowserContext')
      .mockResolvedValue(context);

    const result = await adapter.requestCaf(cafRequest());

    expect(result.status).toBe('downloaded');
    expect(tokenProvider.getToken).toHaveBeenCalledWith(
      issuerContext,
      signingProvider,
      false,
    );
    expect(context.addCookies).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          domain: 'maullin.sii.cl',
          httpOnly: true,
          name: 'TOKEN',
          path: '/',
          sameSite: 'Lax',
          secure: true,
          value: 'token-1',
        }),
        expect.objectContaining({
          domain: 'zeusr.sii.cl',
          name: 'TOKEN',
          value: 'token-1',
        }),
      ]),
    );
    expect(tokenProvider.getToken.mock.invocationCallOrder[0]).toBeLessThan(
      downloadSpy.mock.invocationCallOrder[0],
    );
  });

  it('returns a failed result when the total CAF operation timeout expires', async () => {
    const { adapter } = createAdapter(['token-1'], {
      SII_PORTAL_OPERATION_TIMEOUT_MS: '25',
    });
    const internals = adapter as unknown as {
      downloadCafXmlWithSession: (
        request: CafAcquisitionRequest,
        signal: AbortSignal,
      ) => Promise<string>;
    };
    jest
      .spyOn(internals, 'downloadCafXmlWithSession')
      .mockImplementation(() => new Promise<string>(() => undefined));

    const result = await adapter.requestCaf(cafRequest());

    expect(result).toMatchObject({
      status: 'failed',
      retryable: true,
    });
    expect(result.detail).toContain('excedio el timeout total de 25 ms');
    expect(result.detail).toContain('Ultima etapa: Inicio de operacion');
  });

  it('fails before portal navigation when custody does not provide valid PEM material', async () => {
    const { adapter, signingProvider } = createAdapter();
    jest.mocked(signingProvider.getSigningMaterial).mockResolvedValue({
      certificatePem: 'invalid-certificate',
      privateKeyPem: 'invalid-private-key',
      rutFirmante: '12345678-5',
      nombre: 'Certificado invalido',
      expiresAt: new Date('2099-01-01T00:00:00.000Z'),
    });

    const result = await adapter.requestCaf(cafRequest());

    expect(result).toMatchObject({ status: 'failed', retryable: true });
    expect(result.detail).toContain(
      'no contiene un certificado PEM utilizable',
    );
  });

  it('uses production TOKEN cookie domains when the issuer context is production', async () => {
    const { adapter } = createAdapter();
    const context = createMockBrowserContext();

    await adapterInternals(adapter).addTokenCookies(
      context,
      SiiEnvironment.Produccion,
      'token-prod',
    );

    expect(context.addCookies).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ domain: 'palena.sii.cl' }),
        expect.objectContaining({ domain: 'zeus.sii.cl' }),
        expect.objectContaining({ domain: 'homer.sii.cl' }),
        expect.objectContaining({ domain: 'www2.sii.cl' }),
        expect.objectContaining({ domain: 'www4.sii.cl' }),
      ]),
    );
  });

  it('enables browser client certificates by default', () => {
    const { adapter } = createAdapter();

    expect(adapterInternals(adapter).browserClientCertificatesEnabled()).toBe(
      true,
    );
  });

  it('allows browser client certificates to be disabled explicitly', () => {
    const { adapter } = createAdapter(['token-1'], {
      SII_PORTAL_BROWSER_CLIENT_CERT_ENABLED: 'false',
    });

    expect(adapterInternals(adapter).browserClientCertificatesEnabled()).toBe(
      false,
    );
  });

  it('uses Playwright-managed Chromium in headless mode by default', () => {
    const { adapter } = createAdapter();

    expect(adapterInternals(adapter).browserExecutablePath()).toBeUndefined();
    expect(adapterInternals(adapter).headless()).toBe(true);
  });

  it('uses a custom browser executable only when explicitly configured', () => {
    const { adapter } = createAdapter(['token-1'], {
      SII_PORTAL_BROWSER_EXECUTABLE_PATH: '/opt/chromium/chrome',
      SII_PORTAL_HEADLESS: 'false',
    });

    expect(adapterInternals(adapter).browserExecutablePath()).toBe(
      '/opt/chromium/chrome',
    );
    expect(adapterInternals(adapter).headless()).toBe(false);
  });

  it('refreshes the token once when the portal session is invalid', async () => {
    const { adapter, tokenProvider, signingProvider } = createAdapter([
      'token-stale',
      'token-fresh',
    ]);
    const staleContext = createMockBrowserContext();
    const freshContext = createMockBrowserContext();
    jest
      .spyOn(adapterInternals(adapter), 'createBrowserContext')
      .mockResolvedValueOnce(staleContext)
      .mockResolvedValueOnce(freshContext);
    jest
      .spyOn(adapterInternals(adapter), 'downloadCafXml')
      .mockRejectedValueOnce(
        new Error('Sesion SII invalida o expirada en portal SII'),
      )
      .mockResolvedValueOnce(cafXml('76123456-0', 11, 20));

    const result = await adapter.requestCaf(cafRequest());

    expect(result.status).toBe('downloaded');
    expect(tokenProvider.invalidate).toHaveBeenCalledWith(issuerContext);
    expect(tokenProvider.getToken).toHaveBeenNthCalledWith(
      1,
      issuerContext,
      signingProvider,
      false,
    );
    expect(tokenProvider.getToken).toHaveBeenNthCalledWith(
      2,
      issuerContext,
      signingProvider,
      true,
    );
    expect(staleContext.close).toHaveBeenCalled();
    expect(freshContext.addCookies).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ name: 'TOKEN', value: 'token-fresh' }),
      ]),
    );
  });

  it('redacts portal errors before returning or logging them', async () => {
    const { adapter } = createAdapter();
    const context = createMockBrowserContext();
    jest
      .spyOn(adapterInternals(adapter), 'createBrowserContext')
      .mockResolvedValue(context);
    jest
      .spyOn(adapterInternals(adapter), 'downloadCafXml')
      .mockRejectedValue(
        new Error(
          'TOKEN=abc; cookie=session password=secret PFX=file <CAF>secret</CAF> -----BEGIN PRIVATE KEY-----x-----END PRIVATE KEY----- RSASK',
        ),
      );

    const result = await adapter.requestCaf(cafRequest());
    const serializedResult = JSON.stringify(result);
    const serializedLogs = JSON.stringify(warnSpy.mock.calls);

    expect(result.status).toBe('failed');
    expect(serializedResult).not.toMatch(
      /TOKEN|cookie|password|PFX|<CAF|PRIVATE KEY|RSASK|session|secret/i,
    );
    expect(serializedLogs).not.toMatch(
      /TOKEN|cookie|password|PFX|<CAF|PRIVATE KEY|RSASK|session|secret/i,
    );
  });

  it('does not treat visual 0/0 counters as a definitive no-folios response', async () => {
    const { adapter } = createAdapter();
    const context = createMockBrowserContext();
    jest
      .spyOn(adapterInternals(adapter), 'createBrowserContext')
      .mockResolvedValue(context);
    jest
      .spyOn(adapterInternals(adapter), 'downloadCafXml')
      .mockRejectedValue(
        new Error(
          'Solicitud de Timbraje Electronico para FACTURA ELECTRONICA: Cantidad Solicitada 1 Disponible 0 Maximo Autorizado 0',
        ),
      );

    const result = await adapter.requestCaf(
      cafRequest(TipoDTE.FacturaElectronica),
    );

    expect(result).toMatchObject({
      status: 'failed',
      tipoDTE: TipoDTE.FacturaElectronica,
      retryable: true,
    });
    expect(result.detail).toContain('Disponible 0');
    expect(JSON.stringify(result)).not.toMatch(
      /rawResponse|rawXml|RSASK|<CAF|PRIVATE KEY|privateKey|token|password|cookie/i,
    );
  });

  it('downloads and validates a CAF 33 when factura electronica is requested', async () => {
    const { adapter } = createAdapter();
    const context = createMockBrowserContext();
    jest
      .spyOn(adapterInternals(adapter), 'createBrowserContext')
      .mockResolvedValue(context);
    jest
      .spyOn(adapterInternals(adapter), 'downloadCafXml')
      .mockResolvedValue(
        cafXml('76123456-0', 100, 110, TipoDTE.FacturaElectronica),
      );

    const result = await adapter.requestCaf(
      cafRequest(TipoDTE.FacturaElectronica),
    );

    expect(result).toMatchObject({
      status: 'downloaded',
      tipoDTE: TipoDTE.FacturaElectronica,
      caf: {
        da: expect.objectContaining({
          tipoDTE: TipoDTE.FacturaElectronica,
          rangeStart: 100,
          rangeEnd: 110,
        }),
      },
      retryable: false,
    });
  });

  it('fails safely when SII returns a CAF for a different DTE than requested', async () => {
    const { adapter } = createAdapter();
    const context = createMockBrowserContext();
    jest
      .spyOn(adapterInternals(adapter), 'createBrowserContext')
      .mockResolvedValue(context);
    jest
      .spyOn(adapterInternals(adapter), 'downloadCafXml')
      .mockResolvedValue(cafXml('76123456-0', 200, 210));

    const result = await adapter.requestCaf(
      cafRequest(TipoDTE.FacturaElectronica),
    );

    expect(result).toMatchObject({
      status: 'failed',
      tipoDTE: TipoDTE.FacturaElectronica,
      retryable: true,
    });
    expect(result.detail).toContain('CAF tipo 39');
    expect(JSON.stringify(result)).not.toMatch(
      /rawResponse|rawXml|RSASK|<CAF|PRIVATE KEY|privateKey|token|password|cookie/i,
    );
  });

  it('falls back to playwright when HTTP scraping only reports visual 0/0 counters', async () => {
    const { adapter } = createAdapter(['token-1'], {
      SII_PORTAL_CAF_AUTOMATION_ENABLED: 'true',
      SII_PORTAL_CERT_LOGIN_ENABLED: 'false',
      SII_PORTAL_HTTP_SCRAPING_ENABLED: 'true',
      SII_PORTAL_PLAYWRIGHT_FALLBACK_ENABLED: 'true',
    });
    const createBrowserContextSpy = jest.spyOn(
      adapterInternals(adapter),
      'createBrowserContext',
    );
    const context = createMockBrowserContext();
    createBrowserContextSpy.mockResolvedValue(context);
    jest
      .spyOn(adapterInternals(adapter), 'downloadCafXmlViaHttp')
      .mockRejectedValue(
        new Error(
          'Solicitud de Timbraje Electronico para FACTURA ELECTRONICA: Cantidad Solicitada 1 Disponible 0 Maximo Autorizado 0',
        ),
      );
    jest
      .spyOn(adapterInternals(adapter), 'downloadCafXml')
      .mockResolvedValue(
        cafXml('76123456-0', 100, 110, TipoDTE.FacturaElectronica),
      );

    const result = await adapter.requestCaf(
      cafRequest(TipoDTE.FacturaElectronica),
    );

    expect(result).toMatchObject({
      status: 'downloaded',
      tipoDTE: TipoDTE.FacturaElectronica,
      retryable: false,
    });
    expect(createBrowserContextSpy).toHaveBeenCalledTimes(1);
    expect(context.close).toHaveBeenCalled();
  });

  it('reobtains an authorized CAF 33 over HTTP when SII denies a new timbraje', async () => {
    const { adapter } = createAdapter(['token-1'], {
      SII_PORTAL_CAF_AUTOMATION_ENABLED: 'true',
      SII_PORTAL_CERT_LOGIN_ENABLED: 'false',
      SII_PORTAL_HTTP_SCRAPING_ENABLED: 'true',
      SII_PORTAL_PLAYWRIGHT_FALLBACK_ENABLED: 'true',
    });
    const internals = adapterInternals(adapter);
    const createBrowserContextSpy = jest.spyOn(
      internals,
      'createBrowserContext',
    );
    jest.spyOn(internals, 'fetchCertificateLoginCookies').mockResolvedValue([]);
    jest
      .spyOn(internals, 'portalHttpGet')
      .mockResolvedValueOnce('<html>portal timbraje</html>')
      .mockResolvedValueOnce(`
        <form method="post" action="/cvc_cgi/dte/rf_reobtencion2_folios">
          <input type="hidden" name="RUT_EMP" value="76123456">
          <input type="hidden" name="DV_EMP" value="0">
          <input type="submit" name="ACEPTAR" value="Continuar">
        </form>`);
    const postSpy = jest
      .spyOn(internals, 'portalHttpPost')
      .mockResolvedValueOnce('<html>rut aceptado</html>')
      .mockResolvedValueOnce(
        `
        <form action="/cvc_cgi/dte/of_genera_folio">
          <input name="RUT_EMP" value="76123456">
          <input name="DV_EMP" value="0">
          <input name="COD_DOCTO" value="33">
        </form>`,
      )
      .mockResolvedValueOnce(
        'NO SE AUTORIZA TIMBRAJE ELECTRONICO. Situaciones pendientes o folios suficientes.',
      )
      .mockResolvedValueOnce(
        `
        <form method="post" action="/cvc_cgi/dte/rf_reobtencion3_folios">
          <select name="COD_DOCTO">
            <option value="33">FACTURA ELECTRONICA</option>
          </select>
          <input type="radio" name="RANGO" value="15">
          <input type="submit" name="ACEPTAR" value="Reobtener">
        </form>`,
      )
      .mockResolvedValueOnce(
        cafXml('76123456-0', 15, 15, TipoDTE.FacturaElectronica),
      );

    const result = await adapter.requestCaf(
      cafRequest(TipoDTE.FacturaElectronica),
    );

    expect(result).toMatchObject({
      status: 'downloaded',
      tipoDTE: TipoDTE.FacturaElectronica,
      caf: { da: expect.objectContaining({ rangeStart: 15, rangeEnd: 15 }) },
      retryable: false,
    });
    expect(postSpy).toHaveBeenCalledWith(
      expect.stringContaining('rf_reobtencion3_folios'),
      expect.objectContaining({
        COD_DOCTO: '33',
        RANGO: '15',
        ACEPTAR: 'Reobtener',
      }),
      expect.any(String),
      expect.anything(),
      expect.anything(),
    );
    expect(createBrowserContextSpy).not.toHaveBeenCalled();
  });

  it('does not open Playwright or leak portal identities after an explicit SII denial', async () => {
    const { adapter } = createAdapter(['token-1'], {
      SII_PORTAL_CAF_AUTOMATION_ENABLED: 'true',
      SII_PORTAL_CERT_LOGIN_ENABLED: 'false',
      SII_PORTAL_HTTP_SCRAPING_ENABLED: 'true',
      SII_PORTAL_PLAYWRIGHT_FALLBACK_ENABLED: 'true',
    });
    const internals = adapterInternals(adapter);
    const createBrowserContextSpy = jest.spyOn(
      internals,
      'createBrowserContext',
    );
    jest.spyOn(internals, 'fetchCertificateLoginCookies').mockResolvedValue([]);
    jest
      .spyOn(internals, 'portalHttpGet')
      .mockResolvedValueOnce('<html>portal timbraje</html>')
      .mockResolvedValueOnce(
        '<html>REOBTENCION DE FOLIOS: no hay rangos reobtenibles.</html>',
      );
    jest
      .spyOn(internals, 'portalHttpPost')
      .mockResolvedValueOnce('<html>rut aceptado</html>')
      .mockResolvedValueOnce(
        `
        <form action="/cvc_cgi/dte/of_genera_folio">
          <input name="COD_DOCTO" value="33">
        </form>`,
      )
      .mockResolvedValueOnce(
        'NO SE AUTORIZA TIMBRAJE ELECTRONICO para EMPRESA SENSIBLE. Mandatario PERSONA SENSIBLE.',
      );

    const result = await adapter.requestCaf(
      cafRequest(TipoDTE.FacturaElectronica),
    );

    expect(result).toMatchObject({
      status: 'manual_action_required',
      tipoDTE: TipoDTE.FacturaElectronica,
      retryable: false,
    });
    expect(result.detail).toContain('Reobtencion de Folios');
    expect(JSON.stringify(result)).not.toMatch(
      /EMPRESA SENSIBLE|PERSONA SENSIBLE/,
    );
    expect(createBrowserContextSpy).not.toHaveBeenCalled();
  });

  it('queries available CAF 33 folios without generating a CAF', async () => {
    const { adapter } = createAdapter(['token-1'], {
      SII_PORTAL_CAF_AUTOMATION_ENABLED: 'true',
      SII_PORTAL_CERT_LOGIN_ENABLED: 'false',
      SII_PORTAL_HTTP_SCRAPING_ENABLED: 'true',
      SII_PORTAL_PLAYWRIGHT_FALLBACK_ENABLED: 'true',
    });
    const internals = adapterInternals(adapter);
    jest.spyOn(internals, 'fetchCertificateLoginCookies').mockResolvedValue([]);
    jest.spyOn(internals, 'portalHttpGet').mockResolvedValue('<html>ok</html>');
    const postSpy = jest
      .spyOn(internals, 'portalHttpPost')
      .mockResolvedValueOnce('<html>rut ok</html>')
      .mockResolvedValueOnce(
        'Solicitud de Timbraje Electronico para FACTURA ELECTRONICA: Cantidad Solicitada 1 Disponible 3.846 Maximo Autorizado 5.000',
      );

    const result = await adapter.queryAvailableFolios({
      context: issuerContext,
      tipoDTE: TipoDTE.FacturaElectronica,
    });

    expect(result).toMatchObject({
      status: 'available',
      method: 'sii_portal_availability_scraping',
      tipoDTE: TipoDTE.FacturaElectronica,
      quantityProbed: 1,
      availableFolios: 3846,
      maxAuthorizedFolios: 5000,
      retryable: false,
    });
    expect(postSpy).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(postSpy.mock.calls)).not.toContain('of_genera_folio');
  });

  it('reports visual 0/0 counters without blocking a direct CAF 33 request', async () => {
    const { adapter } = createAdapter(['token-1'], {
      SII_PORTAL_CAF_AUTOMATION_ENABLED: 'true',
      SII_PORTAL_CERT_LOGIN_ENABLED: 'false',
      SII_PORTAL_HTTP_SCRAPING_ENABLED: 'true',
      SII_PORTAL_PLAYWRIGHT_FALLBACK_ENABLED: 'true',
    });
    const internals = adapterInternals(adapter);
    jest.spyOn(internals, 'fetchCertificateLoginCookies').mockResolvedValue([]);
    jest.spyOn(internals, 'portalHttpGet').mockResolvedValue('<html>ok</html>');
    jest
      .spyOn(internals, 'portalHttpPost')
      .mockResolvedValueOnce('<html>rut ok</html>')
      .mockResolvedValueOnce(
        'Solicitud de Timbraje Electronico para FACTURA ELECTRONICA: Cantidad Solicitada 1 Disponible 0 Maximo Autorizado 0',
      );

    const result = await adapter.queryAvailableFolios({
      context: issuerContext,
      tipoDTE: TipoDTE.FacturaElectronica,
    });

    expect(result).toMatchObject({
      status: 'available',
      tipoDTE: TipoDTE.FacturaElectronica,
      quantityProbed: 1,
      availableFolios: 0,
      maxAuthorizedFolios: 0,
      retryable: false,
    });
    expect(result.detail).toContain('Disponible 0');
    expect(result.detail).toContain('no son concluyentes');
    expect(JSON.stringify(result)).not.toMatch(
      /rawResponse|rawXml|RSASK|<CAF|PRIVATE KEY|privateKey|token|password|cookie/i,
    );
  });

  it('follows the intermediate generation form when the portal first asks for the initial folio', async () => {
    const { adapter } = createAdapter(['token-1'], {
      SII_PORTAL_CAF_AUTOMATION_ENABLED: 'true',
      SII_PORTAL_CERT_LOGIN_ENABLED: 'false',
      SII_PORTAL_HTTP_SCRAPING_ENABLED: 'true',
      SII_PORTAL_PLAYWRIGHT_FALLBACK_ENABLED: 'false',
    });
    const internals = adapterInternals(adapter);
    jest.spyOn(internals, 'fetchCertificateLoginCookies').mockResolvedValue([]);
    jest.spyOn(internals, 'portalHttpGet').mockResolvedValue('<html>ok</html>');
    const postSpy = jest
      .spyOn(internals, 'portalHttpPost')
      .mockResolvedValueOnce('<html>rut ok</html>')
      .mockResolvedValueOnce(`
        <html>
          <body>
            <form action="/cvc_cgi/dte/of_confirma_folio" method="post">
              <input type="hidden" name="COD_DOCTO" value="61">
              <input type="hidden" name="CANT_DOCTOS" value="1">
              <input type="hidden" name="FOLIO_INICIAL" value="">
            </form>
            Solicitud de Timbraje Electronico para NOTA DE CREDITO ELECTRONICA
            Cantidad Solicitada 1 Disponible 0 Maximo Autorizado 0
            Ingrese Folio Inicial
            Timbraje Anterior: No registra timbraje anterior.
          </body>
        </html>
      `)
      .mockResolvedValueOnce(`
        <html>
          <body>
            <form action="/cvc_cgi/dte/of_genera_folio" method="post">
              <input type="hidden" name="COD_DOCTO" value="61">
              <input type="hidden" name="CANT_DOCTOS" value="1">
              <input type="hidden" name="FOLIO_INI" value="1">
              <input type="hidden" name="FOLIO_FIN" value="1">
            </form>
            Solicitud de Timbraje Electronico para NOTA DE CREDITO ELECTRONICA
            Cantidad Solicitada 1 Disponible 0 Maximo Autorizado 0
            Folio Inicial 1 Folio Final 1
          </body>
        </html>
      `)
      .mockResolvedValueOnce(cafXml('76123456-0', 1, 1, TipoDTE.NotaCredito));

    const result = await adapter.requestCaf(cafRequest(TipoDTE.NotaCredito));

    expect(result).toMatchObject({
      status: 'downloaded',
      tipoDTE: TipoDTE.NotaCredito,
    });
    expect(postSpy).toHaveBeenCalledTimes(4);
    expect(postSpy.mock.calls[2][0]).toContain(
      '/cvc_cgi/dte/of_confirma_folio',
    );
    expect(postSpy.mock.calls[2][1]).toMatchObject({
      ACEPTAR: 'Solicitar',
      FOLIO_INICIAL: '1',
      FOLIO_INI: '1',
    });
    expect(postSpy.mock.calls[3][0]).toContain(
      '/cvc_cgi/dte/of_genera_folio',
    );
    expect(postSpy.mock.calls[3][1]).toMatchObject({
      ACEPTAR: 'Obtener',
      FOLIO_INI: '1',
      FOLIO_FIN: '1',
    });
  });

  it('reuses readonly fields when they already contain the expected value', async () => {
    const { adapter } = createAdapter();
    const readonlyLocator = {
      count: jest.fn().mockResolvedValue(1),
      isVisible: jest.fn().mockResolvedValue(true),
      isDisabled: jest.fn().mockResolvedValue(false),
      isEditable: jest.fn().mockResolvedValue(false),
      inputValue: jest.fn().mockResolvedValue('76123456'),
      getAttribute: jest.fn().mockResolvedValue('76123456'),
      innerText: jest.fn().mockResolvedValue('76123456'),
      fill: jest.fn(),
    };
    const page = {
      frames: jest.fn().mockReturnValue([]),
      locator: jest.fn(() => ({
        first: () => readonlyLocator,
      })),
    };

    const result = await adapterInternals(adapter).fillFirstVisible(
      page as never,
      ['input[name="RUT_EMP"]'],
      '76123456',
    );

    expect(result).toBe(true);
    expect(readonlyLocator.fill).not.toHaveBeenCalled();
  });
});

function createAdapter(
  tokens = ['token-1'],
  configOverrides?: Record<string, string | undefined>,
): {
  adapter: SiiPortalFoliosAdapter;
  signingProvider: SigningProvider;
  tokenProvider: jest.Mocked<
    Pick<FiscalTokenProvider, 'getToken' | 'invalidate'>
  >;
} {
  let tokenIndex = 0;
  const configService = {
    get: jest.fn((key: string) => {
      if (configOverrides && key in configOverrides) {
        return configOverrides[key];
      }
      if (key === 'SII_PORTAL_CAF_AUTOMATION_ENABLED') return 'true';
      if (key === 'SII_PORTAL_CERT_LOGIN_ENABLED') return 'false';
      if (key === 'SII_PORTAL_HTTP_SCRAPING_ENABLED') return 'false';
      return undefined;
    }),
  } as unknown as ConfigService;
  const tokenProvider = {
    getToken: jest.fn(
      (
        context: IssuerContext,
        _signingProvider: SigningProvider,
        _forceRefresh?: boolean,
      ) => {
        const token = tokens[Math.min(tokenIndex, tokens.length - 1)];
        tokenIndex += 1;

        return Promise.resolve({
          environment: context.environment,
          obtainedAt: new Date('2026-05-26T12:00:00.000Z'),
          token,
        });
      },
    ),
    invalidate: jest.fn(),
  };
  const signingProvider: SigningProvider = {
    getSigningMaterial: jest.fn().mockResolvedValue({
      certificatePem:
        '-----BEGIN CERTIFICATE-----\ncertificate-pem\n-----END CERTIFICATE-----',
      privateKeyPem:
        '-----BEGIN PRIVATE KEY-----\nprivate-key-pem\n-----END PRIVATE KEY-----',
      rutFirmante: '12345678-5',
      nombre: 'Certificado de prueba',
      expiresAt: new Date('2099-01-01T00:00:00.000Z'),
    }),
  };

  return {
    adapter: new SiiPortalFoliosAdapter(
      configService,
      tokenProvider as unknown as FiscalTokenProvider,
      signingProvider,
    ),
    signingProvider,
    tokenProvider,
  };
}

function adapterInternals(adapter: SiiPortalFoliosAdapter): {
  browserClientCertificatesEnabled: () => boolean;
  browserExecutablePath: () => string | undefined;
  headless: () => boolean;
  addTokenCookies: (
    context: BrowserContext,
    environment: SiiEnvironment,
    token: string,
  ) => Promise<void>;
  createBrowserContext: (
    request: CafAcquisitionRequest,
    userDataDir: string,
  ) => Promise<BrowserContext>;
  downloadCafXml: (
    context: BrowserContext,
    request: CafAcquisitionRequest,
  ) => Promise<string>;
  downloadCafXmlViaHttp: (
    request: CafAcquisitionRequest,
    cert: unknown,
    token: string,
  ) => Promise<string>;
  fetchCertificateLoginCookies: (
    request: unknown,
    cert: unknown,
  ) => Promise<unknown[]>;
  portalHttpGet: (
    url: string,
    referer: string,
    cert: unknown,
    cookieJar: unknown,
  ) => Promise<string>;
  portalHttpPost: (
    url: string,
    params: Record<string, string>,
    referer: string,
    cert: unknown,
    cookieJar: unknown,
  ) => Promise<string>;
  fillFirstVisible: (
    page: unknown,
    selectors: string[],
    value: string,
  ) => Promise<boolean>;
} {
  return adapter as unknown as {
    browserClientCertificatesEnabled: () => boolean;
    browserExecutablePath: () => string | undefined;
    headless: () => boolean;
    addTokenCookies: (
      context: BrowserContext,
      environment: SiiEnvironment,
      token: string,
    ) => Promise<void>;
    createBrowserContext: (
      request: CafAcquisitionRequest,
      userDataDir: string,
    ) => Promise<BrowserContext>;
    downloadCafXml: (
      context: BrowserContext,
      request: CafAcquisitionRequest,
    ) => Promise<string>;
    downloadCafXmlViaHttp: (
      request: CafAcquisitionRequest,
      cert: unknown,
      token: string,
    ) => Promise<string>;
    fetchCertificateLoginCookies: (
      request: unknown,
      cert: unknown,
    ) => Promise<unknown[]>;
    portalHttpGet: (
      url: string,
      referer: string,
      cert: unknown,
      cookieJar: unknown,
    ) => Promise<string>;
    portalHttpPost: (
      url: string,
      params: Record<string, string>,
      referer: string,
      cert: unknown,
      cookieJar: unknown,
    ) => Promise<string>;
    fillFirstVisible: (
      page: unknown,
      selectors: string[],
      value: string,
    ) => Promise<boolean>;
  };
}

function createMockBrowserContext(): BrowserContext & {
  addCookies: jest.Mock;
  close: jest.Mock;
} {
  return {
    addCookies: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined),
  } as unknown as BrowserContext & {
    addCookies: jest.Mock;
    close: jest.Mock;
  };
}

function cafRequest(
  tipoDTE = TipoDTE.BoletaElectronica,
): CafAcquisitionRequest {
  return {
    context: issuerContext,
    method: 'sii_portal_automation',
    quantity: 1,
    tipoDTE,
  };
}

function cafXml(
  rutEmisor: string,
  start: number,
  end: number,
  tipoDTE = TipoDTE.BoletaElectronica,
): string {
  return `<?xml version="1.0" encoding="ISO-8859-1"?>
<AUTORIZACION>
  <CAF version="1.0">
    <DA>
      <RE>${rutEmisor}</RE>
      <RS>EMISOR TEST</RS>
      <TD>${tipoDTE}</TD>
      <RNG><D>${start}</D><H>${end}</H></RNG>
      <FA>${TEST_CAF_AUTHORIZATION_DATE}</FA>
      <RSAPK><M>00</M><E>03</E></RSAPK>
      <IDK>1</IDK>
    </DA>
    <FRMA algoritmo="SHA1withRSA">firma</FRMA>
  </CAF>
  <RSASK>private-key</RSASK>
  <RSAPUBK>public-key</RSAPUBK>
</AUTORIZACION>`;
}
