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
});

function createAdapter(tokens = ['token-1']): {
  adapter: SiiPortalFoliosAdapter;
  signingProvider: SigningProvider;
  tokenProvider: jest.Mocked<
    Pick<FiscalTokenProvider, 'getToken' | 'invalidate'>
  >;
} {
  let tokenIndex = 0;
  const configService = {
    get: jest.fn((key: string) => {
      if (key === 'SII_PORTAL_CAF_AUTOMATION_ENABLED') return 'true';
      if (key === 'SII_PORTAL_CERT_LOGIN_ENABLED') return 'false';
      if (key === 'SII_PORTAL_HTTP_SCRAPING_ENABLED') return 'false';
      return undefined;
    }),
  } as unknown as ConfigService;
  const tokenProvider = {
    getToken: jest.fn(
      async (
        context: IssuerContext,
        _signingProvider: SigningProvider,
        _forceRefresh?: boolean,
      ) => {
        const token = tokens[Math.min(tokenIndex, tokens.length - 1)];
        tokenIndex += 1;

        return {
          environment: context.environment,
          obtainedAt: new Date('2026-05-26T12:00:00.000Z'),
          token,
        };
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
} {
  return adapter as unknown as {
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

function cafRequest(): CafAcquisitionRequest {
  return {
    context: issuerContext,
    method: 'sii_portal_automation',
    quantity: 1,
    tipoDTE: TipoDTE.BoletaElectronica,
  };
}

function cafXml(rutEmisor: string, start: number, end: number): string {
  return `<?xml version="1.0" encoding="ISO-8859-1"?>
<AUTORIZACION>
  <CAF version="1.0">
    <DA>
      <RE>${rutEmisor}</RE>
      <RS>EMISOR TEST</RS>
      <TD>39</TD>
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
