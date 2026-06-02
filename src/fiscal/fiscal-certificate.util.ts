import forge from 'node-forge';
import {
  getCertificateFingerprintSha256,
  loadCertificateFromP12,
  loadCertificateFromPem,
  normalizeRut,
  type CertificateMaterial,
} from 'sii-engine';

export function loadCertificateMaterialFromP12(
  p12Buffer: Buffer,
  password: string,
  rutFirmante?: string,
): CertificateMaterial {
  try {
    return loadCertificateFromP12(p12Buffer, password);
  } catch (error) {
    if (!isMissingRutError(error) || !rutFirmante) throw error;
    return loadCertificateFromP12WithRutOverride(
      p12Buffer,
      password,
      rutFirmante,
    );
  }
}

export function loadCertificateMaterialFromPem(
  certificatePem: string,
  privateKeyPem: string,
): CertificateMaterial {
  return loadCertificateFromPem(certificatePem, privateKeyPem);
}

export function normalizeFingerprint(
  fingerprint?: string,
): string | undefined {
  return fingerprint?.replace(/[^a-fA-F0-9]/g, '').toLowerCase();
}

function isMissingRutError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.includes('RUT tributario') &&
    error.message.includes('atributos')
  );
}

function loadCertificateFromP12WithRutOverride(
  p12Buffer: Buffer,
  password: string,
  rutFirmante: string,
): CertificateMaterial {
  const normalizedRut = normalizeRut(rutFirmante);
  const p12Der = forge.util.createBuffer(p12Buffer.toString('binary'));
  const p12Asn1 = forge.asn1.fromDer(p12Der);
  const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, password);

  const certBags = Object.values(
    p12.getBags({ bagType: forge.pki.oids.certBag }),
  ).flat() as Array<{ cert?: forge.pki.Certificate }>;
  const keyBags = [
    ...Object.values(
      p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag }),
    ).flat(),
    ...Object.values(p12.getBags({ bagType: forge.pki.oids.keyBag })).flat(),
  ] as Array<{ key?: forge.pki.PrivateKey }>;

  if (certBags.length === 0 || keyBags.length === 0) {
    throw new Error('El PFX no contiene certificado y clave privada validos');
  }

  const pair = findMatchingP12Pair(certBags, keyBags);
  if (!pair) {
    throw new Error('El PFX no contiene un par certificado/clave coincidente');
  }

  const expiresAt = new Date(pair.cert.validity.notAfter);
  if (expiresAt < new Date()) {
    throw new Error(`El certificado expiro el ${expiresAt.toISOString()}`);
  }

  const certificatePem = forge.pki.certificateToPem(pair.cert);

  return {
    privateKeyPem: forge.pki.privateKeyToPem(pair.privateKey),
    certificatePem,
    rutFirmante: normalizedRut,
    nombre: extractCertificateName(pair.cert),
    expiresAt,
    fingerprintSha256: getCertificateFingerprintSha256(certificatePem),
  };
}

function findMatchingP12Pair(
  certBags: Array<{ cert?: forge.pki.Certificate }>,
  keyBags: Array<{ key?: forge.pki.PrivateKey }>,
):
  | { cert: forge.pki.Certificate; privateKey: forge.pki.PrivateKey }
  | undefined {
  for (const certBag of certBags) {
    if (!certBag.cert) continue;
    const publicKey = certBag.cert.publicKey as forge.pki.rsa.PublicKey;
    if (!publicKey.n) continue;
    const certModulus = publicKey.n.toString(16);

    for (const keyBag of keyBags) {
      if (!keyBag.key) continue;
      const privateKey = keyBag.key as forge.pki.rsa.PrivateKey;
      if (!privateKey.n) continue;

      if (privateKey.n.toString(16) === certModulus) {
        return { cert: certBag.cert, privateKey };
      }
    }
  }

  return undefined;
}

function extractCertificateName(cert: forge.pki.Certificate): string {
  const commonName = cert.subject.getField('CN')?.value;
  const organization = cert.subject.getField('O')?.value;
  return commonName ?? organization ?? 'Firmante fiscal';
}
