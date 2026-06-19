import forge from "node-forge";
import { SignedXml } from "xml-crypto";
import type { CertificateMaterial } from "../types/signing.types.js";
import type { CafMaterial } from "../types/caf.types.js";
import type { DteDocument } from "../types/dte.types.js";
import { SiiSignError } from "../errors/sii-errors.js";
import { buildDdXml } from "../xml/ted-builder.js";
import { getCertificateBase64, getRsaModulusAndExponent, loadCafPrivateKey } from "./certificate.js";
import { buildDocumentId } from "../xml/dte-builder.js";

export function signTed(
  doc: DteDocument,
  caf: CafMaterial,
  timestamp?: string
): string {
  const ddXml = buildDdXml(doc, caf, timestamp);

  let cafPrivateKey: forge.pki.rsa.PrivateKey;
  try {
    cafPrivateKey = loadCafPrivateKey(caf.rsask);
  } catch (err) {
    throw new SiiSignError("No se pudo cargar la clave privada del CAF para firmar el TED", {
      cause: err as Error,
    });
  }

  try {
    const md = forge.md.sha1.create();
    md.update(ddXml, "utf8");
    const signature = cafPrivateKey.sign(md);
    return forge.util.encode64(signature);
  } catch (err) {
    throw new SiiSignError("Error al firmar el TED con la clave del CAF", {
      cause: err as Error,
    });
  }
}

function buildKeyInfoXml(certPem: string): string {
  const certBase64 = getCertificateBase64(certPem);
  const { modulus, exponent } = getRsaModulusAndExponent(certPem);
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

export function signDteDocument(
  dteXml: string,
  doc: DteDocument,
  cert: CertificateMaterial
): string {
  const docId = buildDocumentId(doc);
  const keyInfoXml = buildKeyInfoXml(cert.certificatePem);

  try {
    const sig = new SignedXml({
      privateKey: cert.privateKeyPem,
      publicCert: cert.certificatePem,
      canonicalizationAlgorithm: "http://www.w3.org/TR/2001/REC-xml-c14n-20010315",
      signatureAlgorithm: "http://www.w3.org/2000/09/xmldsig#rsa-sha1",
      getKeyInfoContent: () => keyInfoXml,
    });

    sig.addReference({
      xpath: `//*[@ID='${docId}']`,
      digestAlgorithm: "http://www.w3.org/2000/09/xmldsig#sha1",
      transforms: [
        "http://www.w3.org/TR/2001/REC-xml-c14n-20010315",
      ],
    });

    sig.computeSignature(dteXml);
    return sig.getSignedXml();
  } catch (err) {
    throw new SiiSignError("Error al firmar el documento DTE con XMLDSig", {
      cause: err as Error,
    });
  }
}

export function signEnvelope(
  envelopeXml: string,
  cert: CertificateMaterial,
  referenceXpath?: string
): string {
  const keyInfoXml = buildKeyInfoXml(cert.certificatePem);

  try {
    const sig = new SignedXml({
      privateKey: cert.privateKeyPem,
      publicCert: cert.certificatePem,
      canonicalizationAlgorithm: "http://www.w3.org/TR/2001/REC-xml-c14n-20010315",
      signatureAlgorithm: "http://www.w3.org/2000/09/xmldsig#rsa-sha1",
      getKeyInfoContent: () => keyInfoXml,
    });

    sig.addReference({
      xpath: referenceXpath ?? "//*[local-name(.)='Caratula']",
      digestAlgorithm: "http://www.w3.org/2000/09/xmldsig#sha1",
      transforms: [
        "http://www.w3.org/TR/2001/REC-xml-c14n-20010315",
      ],
    });

    sig.computeSignature(envelopeXml);
    return sig.getSignedXml();
  } catch (err) {
    throw new SiiSignError("Error al firmar el sobre con XMLDSig", {
      cause: err as Error,
    });
  }
}
