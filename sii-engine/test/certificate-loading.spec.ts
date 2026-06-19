import { describe, it, expect } from "vitest";
import forge from "node-forge";
import { loadCertificateFromP12 } from "../src/signing/certificate.js";
import { SiiCertError } from "../src/errors/sii-errors.js";

describe("certificate", () => {
  it("should throw an error if P12 has no RUT in certificate", () => {
    // Generate a test certificate without RUT
    const keys = forge.pki.rsa.generateKeyPair(1024);
    const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = "01";
    cert.validity.notBefore = new Date();
    cert.validity.notAfter = new Date();
    cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);

    // Set subject without RUT
    const attrs = [
      { name: "commonName", value: "Test Cert" },
      { name: "countryName", value: "CL" },
    ];
    cert.setSubject(attrs);
    cert.setIssuer(attrs);
    cert.sign(keys.privateKey);

    // Create P12
    const p12Asn1 = forge.pkcs12.toPkcs12Asn1(
      keys.privateKey,
      [cert],
      "password",
      { generateLocalKeyId: true, friendlyName: "test" }
    );
    const p12Der = forge.asn1.toDer(p12Asn1).getBytes();
    const p12Buffer = Buffer.from(p12Der, "binary");

    expect(() => loadCertificateFromP12(p12Buffer, "password")).toThrowError(SiiCertError);
    expect(() => loadCertificateFromP12(p12Buffer, "password")).toThrowError("El certificado no contiene un RUT tributario");
  });
});
