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
      certificatePem: 'certificate-pem',
      privateKeyPem: 'private-key-pem',
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
      <FA>2026-01-01</FA>
      <RSAPK><M>00</M><E>03</E></RSAPK>
      <IDK>1</IDK>
    </DA>
    <FRMA algoritmo="SHA1withRSA">firma</FRMA>
  </CAF>
  <RSASK>private-key</RSASK>
  <RSAPUBK>public-key</RSAPUBK>
</AUTORIZACION>`;
}
