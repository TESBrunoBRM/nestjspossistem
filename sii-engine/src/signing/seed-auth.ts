import axios from "axios";
import forge from "node-forge";
import { XMLParser } from "fast-xml-parser";
import type { CertificateMaterial, SigningProvider } from "../types/signing.types.js";
import type { SiiAuthToken } from "../types/transport.types.js";
import { SiiEnvironment } from "../types/transport.types.js";
import type { IssuerContext } from "../types/context.types.js";
import { SiiAuthError } from "../errors/sii-errors.js";

const SEED_ENDPOINTS: Record<SiiEnvironment, string> = {
  [SiiEnvironment.Certificacion]: "https://maullin.sii.cl/DTEWS/CrSeed.jws",
  [SiiEnvironment.Produccion]: "https://palena.sii.cl/DTEWS/CrSeed.jws",
};

const TOKEN_ENDPOINTS: Record<SiiEnvironment, string> = {
  [SiiEnvironment.Certificacion]: "https://maullin.sii.cl/DTEWS/GetTokenFromSeed.jws",
  [SiiEnvironment.Produccion]: "https://palena.sii.cl/DTEWS/GetTokenFromSeed.jws",
};

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  trimValues: true,
});

async function getSeed(environment: SiiEnvironment): Promise<string> {
  const url = SEED_ENDPOINTS[environment];
  const soapBody = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">
  <soapenv:Header/>
  <soapenv:Body>
    <getSeed/>
  </soapenv:Body>
</soapenv:Envelope>`;

  let response: string;
  try {
    const res = await axios.post(url, soapBody, {
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        SOAPAction: "",
      },
      timeout: 30000,
    });
    response = res.data as string;
  } catch (err) {
    throw new SiiAuthError("AUTH_SEED_FAILED", "Error de red al obtener la semilla SII", {
      cause: err as Error,
    });
  }

  const parsed = xmlParser.parse(response);
  const semilla =
    parsed?.["soapenv:Envelope"]?.["soapenv:Body"]?.["getSeedResponse"]?.["SemillaReturn"]?.["resp"]?.["SEMILLA"] ??
    parsed?.["Envelope"]?.["Body"]?.["getSeedResponse"]?.["SemillaReturn"]?.["resp"]?.["SEMILLA"];

  if (!semilla) {
    throw new SiiAuthError("AUTH_SEED_FAILED", "No se pudo extraer la semilla de la respuesta SII", {
      rawResponse: response,
    });
  }

  return String(semilla);
}

function signSeed(seed: string, cert: CertificateMaterial): string {
  const semillaXml = `<Semilla>${seed}</Semilla>`;
  const privateKey = forge.pki.privateKeyFromPem(cert.privateKeyPem) as forge.pki.rsa.PrivateKey;
  const md = forge.md.sha1.create();
  md.update(semillaXml, "utf8");
  const signature = privateKey.sign(md);
  return forge.util.encode64(signature);
}

function buildGetTokenSoapRequest(seed: string, frma: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
  <soapenv:Header/>
  <soapenv:Body>
    <getToken>
      <item>
        <Semilla>${seed}</Semilla>
        <FRMA algoritmo="SHA1withRSA">${frma}</FRMA>
      </item>
    </getToken>
  </soapenv:Body>
</soapenv:Envelope>`;
}

async function requestToken(
  environment: SiiEnvironment,
  seed: string,
  frma: string
): Promise<string> {
  const url = TOKEN_ENDPOINTS[environment];
  const soapBody = buildGetTokenSoapRequest(seed, frma);

  let response: string;
  try {
    const res = await axios.post(url, soapBody, {
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        SOAPAction: "",
      },
      timeout: 30000,
    });
    response = res.data as string;
  } catch (err) {
    throw new SiiAuthError("AUTH_TOKEN_FAILED", "Error de red al obtener el token SII", {
      cause: err as Error,
    });
  }

  const parsed = xmlParser.parse(response);
  const token =
    parsed?.["soapenv:Envelope"]?.["soapenv:Body"]?.["getTokenResponse"]?.["TokenReturn"]?.["resp"]?.["TOKEN"] ??
    parsed?.["Envelope"]?.["Body"]?.["getTokenResponse"]?.["TokenReturn"]?.["resp"]?.["TOKEN"];

  const estado =
    parsed?.["soapenv:Envelope"]?.["soapenv:Body"]?.["getTokenResponse"]?.["TokenReturn"]?.["resp"]?.["STATUS"] ??
    parsed?.["Envelope"]?.["Body"]?.["getTokenResponse"]?.["TokenReturn"]?.["resp"]?.["STATUS"];

  if (estado && String(estado) !== "00") {
    throw new SiiAuthError("AUTH_TOKEN_FAILED", `El SII rechazó la autenticación. Estado: ${estado}`, {
      rawResponse: response,
    });
  }

  if (!token) {
    throw new SiiAuthError("AUTH_TOKEN_FAILED", "No se pudo extraer el token de la respuesta SII", {
      rawResponse: response,
    });
  }

  return String(token);
}

export async function getAuthToken(
  environment: SiiEnvironment,
  cert: CertificateMaterial
): Promise<SiiAuthToken> {
  const seed = await getSeed(environment);
  const frma = signSeed(seed, cert);
  const token = await requestToken(environment, seed, frma);

  return {
    token,
    obtainedAt: new Date(),
    environment,
  };
}

export function isTokenValid(authToken: SiiAuthToken): boolean {
  const TOKEN_TTL_MINUTES = 50;
  const expiresAt = new Date(authToken.obtainedAt);
  expiresAt.setMinutes(expiresAt.getMinutes() + TOKEN_TTL_MINUTES);
  return new Date() < expiresAt;
}

export class SiiTokenManager {
  private cache: Map<string, SiiAuthToken> = new Map();
  private inFlightRequests: Map<string, Promise<SiiAuthToken>> = new Map();

  private getCacheKey(context: IssuerContext): string {
    return `${context.environment}:${context.rutEmisor}`;
  }

  async getToken(
    context: IssuerContext,
    signingProvider: SigningProvider,
    forceRefresh?: boolean
  ): Promise<SiiAuthToken> {
    const key = this.getCacheKey(context);

    if (!forceRefresh) {
      const cached = this.cache.get(key);
      if (cached && isTokenValid(cached)) {
        return cached;
      }
    }

    if (!forceRefresh && this.inFlightRequests.has(key)) {
      return this.inFlightRequests.get(key)!;
    }

    const promise = (async () => {
      try {
        const cert = await signingProvider.getSigningMaterial(context);
        const token = await getAuthToken(context.environment, cert);
        this.cache.set(key, token);
        return token;
      } finally {
        this.inFlightRequests.delete(key);
      }
    })();

    this.inFlightRequests.set(key, promise);
    return promise;
  }

  invalidate(context?: IssuerContext): void {
    if (context) {
      this.cache.delete(this.getCacheKey(context));
    } else {
      this.cache.clear();
    }
  }
}
