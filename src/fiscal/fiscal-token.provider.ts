import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import axios from 'axios';
import { XMLParser } from 'fast-xml-parser';
import { SignedXml } from 'xml-crypto';
import {
  assertCertificateMatchesContext,
  CertificateMaterial,
  getCertificateBase64,
  getRsaModulusAndExponent,
  IssuerContext,
  SigningProvider,
  SiiAuthToken,
  SiiEnvironment,
  SiiTokenManager,
} from 'sii-engine';

const SEED_ENDPOINTS: Record<SiiEnvironment, string> = {
  [SiiEnvironment.Certificacion]: 'https://maullin.sii.cl/DTEWS/CrSeed.jws',
  [SiiEnvironment.Produccion]: 'https://palena.sii.cl/DTEWS/CrSeed.jws',
};

const TOKEN_ENDPOINTS: Record<SiiEnvironment, string> = {
  [SiiEnvironment.Certificacion]:
    'https://maullin.sii.cl/DTEWS/GetTokenFromSeed.jws',
  [SiiEnvironment.Produccion]:
    'https://palena.sii.cl/DTEWS/GetTokenFromSeed.jws',
};

const TOKEN_TTL_MS = 50 * 60 * 1000;
const AUTH_TIMEOUT_MS = 30_000;

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseTagValue: false,
  trimValues: true,
});

interface SoapResponse {
  data: string;
  statusCode: number;
}

@Injectable()
export class FiscalTokenProvider implements OnModuleInit {
  private readonly logger = new Logger(FiscalTokenProvider.name);
  private readonly compatCache = new Map<string, SiiAuthToken>();
  private tokenManager = new SiiTokenManager();

  onModuleInit() {
    this.tokenManager = new SiiTokenManager();
  }

  async getToken(
    context: IssuerContext,
    signingProvider: SigningProvider,
    forceRefresh = false,
  ): Promise<SiiAuthToken> {
    if (!shouldUseEngineTokenManager()) {
      return this.getCompatToken(context, signingProvider, forceRefresh);
    }

    try {
      return await this.tokenManager.getToken(
        context,
        signingProvider,
        forceRefresh,
      );
    } catch (error) {
      if (!shouldUseCompatAuth(error)) throw error;

      this.logger.warn(
        'SiiTokenManager no pudo parsear semilla/token SII; usando fallback compatible local',
      );
      return this.getCompatToken(context, signingProvider, forceRefresh);
    }
  }

  invalidate(context?: IssuerContext): void {
    this.tokenManager.invalidate(context);
    if (!context) {
      this.compatCache.clear();
      return;
    }

    const prefix = `${context.environment}:${context.rutEmisor}:`;
    for (const key of this.compatCache.keys()) {
      if (key.startsWith(prefix)) this.compatCache.delete(key);
    }
  }

  private async getCompatToken(
    context: IssuerContext,
    signingProvider: SigningProvider,
    forceRefresh: boolean,
  ): Promise<SiiAuthToken> {
    const cacheKey = this.compatCacheKey(context);
    const cached = this.compatCache.get(cacheKey);
    if (!forceRefresh && cached && isTokenValid(cached)) return cached;

    const cert = await signingProvider.getSigningMaterial(context);
    assertCertificateMatchesContext(cert, context);

    const seed = await requestSeed(context.environment);
    const signedSeedXml = signSeed(seed, cert);
    const token = await requestToken(context.environment, signedSeedXml);
    const authToken: SiiAuthToken = {
      environment: context.environment,
      obtainedAt: new Date(),
      token,
    };

    this.compatCache.set(cacheKey, authToken);
    return authToken;
  }

  private compatCacheKey(context: IssuerContext): string {
    return `${context.environment}:${context.rutEmisor}:${context.certificateRef ?? context.certificateFingerprint ?? 'default'}`;
  }
}

async function requestSeed(environment: SiiEnvironment): Promise<string> {
  const response = await postSoap(
    SEED_ENDPOINTS[environment],
    `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
  <soapenv:Header/>
  <soapenv:Body>
    <getSeed/>
  </soapenv:Body>
</soapenv:Envelope>`,
  );

  const seed = extractNestedXmlValue(response.data, 'SEMILLA');
  if (!seed) {
    throw new Error(
      `No se pudo extraer la semilla de la respuesta SII${httpStatusSuffix(response.statusCode)}`,
    );
  }

  return seed;
}

async function requestToken(
  environment: SiiEnvironment,
  signedSeedXml: string,
): Promise<string> {
  const response = await postSoap(
    TOKEN_ENDPOINTS[environment],
    `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:xsd="http://www.w3.org/2001/XMLSchema">
  <soapenv:Header/>
  <soapenv:Body>
    <ns1:getToken soapenv:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/" xmlns:ns1="http://DefaultNamespace">
      <pszXml xsi:type="xsd:string">${escapeXml(signedSeedXml)}</pszXml>
    </ns1:getToken>
  </soapenv:Body>
</soapenv:Envelope>`,
  );

  const status =
    extractNestedXmlValue(response.data, 'ESTADO') ??
    extractNestedXmlValue(response.data, 'STATUS');
  if (status && status !== '00') {
    const glosa = extractNestedXmlValue(response.data, 'GLOSA');
    throw new Error(
      `El SII rechazo la autenticacion. Estado: ${status}${glosa ? ` (${glosa})` : ''}`,
    );
  }

  const token = extractNestedXmlValue(response.data, 'TOKEN');
  if (!token) {
    throw new Error(
      `No se pudo extraer el token de la respuesta SII${httpStatusSuffix(response.statusCode)}`,
    );
  }

  return token;
}

async function postSoap(url: string, soapBody: string): Promise<SoapResponse> {
  const response = await axios.post<string>(url, soapBody, {
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      SOAPAction: '',
    },
    timeout: AUTH_TIMEOUT_MS,
    validateStatus: () => true,
  });

  return {
    data: response.data,
    statusCode: response.status,
  };
}

function signSeed(seed: string, cert: CertificateMaterial): string {
  const tokenXml = `<getToken><item><Semilla>${escapeXml(seed)}</Semilla></item></getToken>`;
  const keyInfoXml = buildKeyInfoXml(cert);
  const signature = new SignedXml({
    privateKey: cert.privateKeyPem,
    publicCert: cert.certificatePem,
    canonicalizationAlgorithm:
      'http://www.w3.org/TR/2001/REC-xml-c14n-20010315',
    signatureAlgorithm: 'http://www.w3.org/2000/09/xmldsig#rsa-sha1',
    getKeyInfoContent: () => keyInfoXml,
  });

  signature.addReference({
    xpath: "//*[local-name(.)='getToken']",
    digestAlgorithm: 'http://www.w3.org/2000/09/xmldsig#sha1',
    transforms: ['http://www.w3.org/2000/09/xmldsig#enveloped-signature'],
  });
  signature.computeSignature(tokenXml);

  return `<?xml version="1.0"?>${signature.getSignedXml()}`;
}

function buildKeyInfoXml(cert: CertificateMaterial): string {
  const certBase64 = getCertificateBase64(cert.certificatePem);
  const { modulus, exponent } = getRsaModulusAndExponent(cert.certificatePem);
  return `<KeyValue>
<RSAKeyValue>
<Modulus>${modulus}</Modulus>
<Exponent>${exponent}</Exponent>
</RSAKeyValue>
</KeyValue>
<X509Data>
<X509Certificate>${certBase64}</X509Certificate>
</X509Data>`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function extractNestedXmlValue(
  response: string,
  localName: string,
): string | undefined {
  const parsed = parseXml(response);
  const direct = findByLocalName(parsed, localName);
  const directValue = primitiveToString(direct);
  if (directValue !== undefined) return directValue;

  for (const nestedXml of collectNestedXmlStrings(parsed)) {
    const nested = parseXml(nestedXml);
    const nestedValue = findByLocalName(nested, localName);
    const value = primitiveToString(nestedValue);
    if (value !== undefined) return value;
  }

  return undefined;
}

function primitiveToString(value: unknown): string | undefined {
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return String(value);
  }

  return undefined;
}

function collectNestedXmlStrings(value: unknown): string[] {
  if (typeof value === 'string') {
    return value.includes('<') && value.includes('>') ? [value] : [];
  }

  if (!value || typeof value !== 'object') return [];

  if (Array.isArray(value)) {
    return value.flatMap((item) => collectNestedXmlStrings(item));
  }

  return Object.values(value).flatMap((item) => collectNestedXmlStrings(item));
}

function findByLocalName(value: unknown, localName: string): unknown {
  if (!value || typeof value !== 'object') return undefined;

  if (Array.isArray(value)) {
    for (const item of value) {
      const nested = findByLocalName(item, localName);
      if (nested !== undefined) return nested;
    }
    return undefined;
  }

  for (const [key, nested] of Object.entries(value)) {
    if (xmlLocalName(key) === localName) return nested;

    const found = findByLocalName(nested, localName);
    if (found !== undefined) return found;
  }

  return undefined;
}

function parseXml(value: string): unknown {
  return xmlParser.parse(value);
}

function xmlLocalName(key: string): string {
  return key.includes(':') ? key.split(':').at(-1)! : key;
}

function isTokenValid(authToken: SiiAuthToken): boolean {
  return Date.now() - authToken.obtainedAt.getTime() < TOKEN_TTL_MS;
}

function httpStatusSuffix(statusCode: number): string {
  return statusCode >= 400 ? ` (HTTP ${statusCode})` : '';
}

function shouldUseCompatAuth(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  return /semilla|seed|token/i.test(error.message);
}

function shouldUseEngineTokenManager(): boolean {
  return process.env.SII_AUTH_USE_ENGINE_MANAGER === 'true';
}
