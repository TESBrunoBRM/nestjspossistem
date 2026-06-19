import forge from "node-forge";
import type { CertificateMaterial } from "../types/signing.types.js";
import { SiiCertError } from "../errors/sii-errors.js";

export function loadCertificateFromP12(
  p12Buffer: Buffer,
  password: string
): CertificateMaterial {
  let p12: forge.pkcs12.Pkcs12Pfx;
  try {
    const p12Der = forge.util.createBuffer(p12Buffer.toString("binary"));
    const p12Asn1 = forge.asn1.fromDer(p12Der);
    p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, password);
  } catch (err) {
    throw new SiiCertError(
      "CERT_LOAD_ERROR",
      "No se pudo cargar el certificado P12. Verifique el archivo y la contraseña.",
      { cause: err as Error }
    );
  }

  const certBags = Object.values(p12.getBags({ bagType: forge.pki.oids.certBag })).flat();
  const keyBags = Object.values(p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })).flat();

  if (certBags.length === 0) {
    throw new SiiCertError("CERT_LOAD_ERROR", "No se encontró ningún certificado en el archivo P12");
  }
  if (keyBags.length === 0) {
    throw new SiiCertError("CERT_LOAD_ERROR", "No se encontró ninguna clave privada en el archivo P12");
  }

  let matchedCert: forge.pki.Certificate | undefined;
  let matchedKey: forge.pki.PrivateKey | undefined;

  for (const keyBag of keyBags) {
    if (!keyBag?.key) continue;
    const privateKey = keyBag.key as forge.pki.rsa.PrivateKey;
    if (!privateKey.n) continue;
    const privateModulus = privateKey.n.toString(16);

    for (const certBag of certBags) {
      if (!certBag?.cert) continue;
      const cert = certBag.cert;
      const publicKey = cert.publicKey as forge.pki.rsa.PublicKey;
      if (!publicKey.n) continue;
      const publicModulus = publicKey.n.toString(16);

      if (privateModulus === publicModulus) {
        matchedCert = cert;
        matchedKey = privateKey;
        break;
      }
    }
    if (matchedCert) break;
  }

  if (!matchedCert || !matchedKey) {
    throw new SiiCertError(
      "CERT_LOAD_ERROR",
      "No se encontró un par clave-certificado válido (el Modulus RSA no coincide)."
    );
  }

  const cert = matchedCert;
  const privateKey = matchedKey;

  const expiresAt = new Date(cert.validity.notAfter);
  if (expiresAt < new Date()) {
    throw new SiiCertError(
      "CERT_EXPIRED",
      `El certificado expiró el ${expiresAt.toISOString()}`
    );
  }

  const privateKeyPem = forge.pki.privateKeyToPem(privateKey as forge.pki.rsa.PrivateKey);
  const certificatePem = forge.pki.certificateToPem(cert);

  const subjectRut = extractRutFromCert(cert);
  const subjectName = extractNameFromCert(cert);

  return {
    privateKeyPem,
    certificatePem,
    rutFirmante: subjectRut,
    nombre: subjectName,
    expiresAt,
    fingerprintSha256: getCertificateFingerprintSha256(certificatePem),
  };
}

export function loadCertificateFromPem(
  certificatePem: string,
  privateKeyPem: string
): CertificateMaterial {
  let cert: forge.pki.Certificate;
  try {
    cert = forge.pki.certificateFromPem(certificatePem);
  } catch (err) {
    throw new SiiCertError("CERT_LOAD_ERROR", "No se pudo parsear el certificado PEM", {
      cause: err as Error,
    });
  }

  try {
    forge.pki.privateKeyFromPem(privateKeyPem);
  } catch (err) {
    throw new SiiCertError("CERT_LOAD_ERROR", "No se pudo parsear la clave privada PEM", {
      cause: err as Error,
    });
  }

  const expiresAt = new Date(cert.validity.notAfter);
  if (expiresAt < new Date()) {
    throw new SiiCertError(
      "CERT_EXPIRED",
      `El certificado expiró el ${expiresAt.toISOString()}`
    );
  }

  const subjectRut = extractRutFromCert(cert);
  const subjectName = extractNameFromCert(cert);

  return {
    privateKeyPem,
    certificatePem,
    rutFirmante: subjectRut,
    nombre: subjectName,
    expiresAt,
    fingerprintSha256: getCertificateFingerprintSha256(certificatePem),
  };
}

export function getCertificateBase64(certificatePem: string): string {
  return certificatePem
    .replace("-----BEGIN CERTIFICATE-----", "")
    .replace("-----END CERTIFICATE-----", "")
    .replace(/\s/g, "");
}

export function getCertificateFingerprintSha256(certificatePem: string): string {
  const cert = forge.pki.certificateFromPem(certificatePem);
  const certAsn1 = forge.pki.certificateToAsn1(cert);
  const der = forge.asn1.toDer(certAsn1).getBytes();
  const md = forge.md.sha256.create();
  md.update(der);
  return md.digest().toHex();
}

export function assertCertificateMatchesContext(
  material: CertificateMaterial,
  context: { certificateFingerprint?: string }
): void {
  if (!context.certificateFingerprint) return;

  const actual = normalizeFingerprint(
    material.fingerprintSha256 ?? getCertificateFingerprintSha256(material.certificatePem)
  );
  const expected = normalizeFingerprint(context.certificateFingerprint);

  if (actual !== expected) {
    throw new SiiCertError(
      "CERT_INVALID",
      "El certificado no coincide con el fingerprint esperado"
    );
  }
}

export function getRsaModulusAndExponent(certificatePem: string): {
  modulus: string;
  exponent: string;
} {
  const cert = forge.pki.certificateFromPem(certificatePem);
  const publicKey = cert.publicKey as forge.pki.rsa.PublicKey;
  const modulus = forge.util.encode64(
    forge.util.hexToBytes(publicKey.n.toString(16))
  );
  const exponent = forge.util.encode64(
    forge.util.hexToBytes(publicKey.e.toString(16))
  );
  return { modulus, exponent };
}

function normalizeFingerprint(value: string): string {
  return value.replace(/[^a-fA-F0-9]/g, "").toLowerCase();
}

function extractRutFromCert(cert: forge.pki.Certificate): string {
  const attrs = cert.subject.attributes;
  for (const attr of attrs) {
    // 2.5.4.5 is serialNumber
    if (attr.name === "serialName" || attr.shortName === "SN" || attr.type === "2.5.4.5") {
      const val = String(attr.value ?? "").replace(/\./g, "");
      const match = val.match(/(\d+-[\dkK])/);
      if (match) return match[1];
    }
    if (attr.name === "commonName" || attr.shortName === "CN") {
      const val = String(attr.value ?? "").replace(/\./g, "");
      const match = val.match(/(\d+-[\dkK])/);
      if (match) return match[1];
    }
  }

  throw new SiiCertError(
    "CERT_LOAD_ERROR",
    "El certificado no contiene un RUT tributario explícito en sus atributos (requerido para firmar)."
  );
}

function extractNameFromCert(cert: forge.pki.Certificate): string {
  const cn = cert.subject.getField("CN");
  if (cn) return String(cn.value);
  const o = cert.subject.getField("O");
  if (o) return String(o.value);
  return "";
}

export function loadCafPrivateKey(rsaskBase64: string): forge.pki.rsa.PrivateKey {
  try {
    const der = forge.util.decode64(rsaskBase64);
    const asn1 = forge.asn1.fromDer(der);
    return forge.pki.privateKeyFromAsn1(asn1) as forge.pki.rsa.PrivateKey;
  } catch (err) {
    throw new SiiCertError("CERT_LOAD_ERROR", "No se pudo cargar la clave privada del CAF", {
      cause: err as Error,
    });
  }
}
