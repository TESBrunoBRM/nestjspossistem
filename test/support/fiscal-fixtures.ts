import forge from 'node-forge';
import { TipoDTE } from 'sii-engine';

export function createTestPfx(
  password: string,
  rutFirmante: string,
): { pfxBuffer: Buffer; certificatePem: string; privateKeyPem: string } {
  const keys = forge.pki.rsa.generateKeyPair(1024);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date('2026-01-01T00:00:00.000Z');
  cert.validity.notAfter = new Date('2030-01-01T00:00:00.000Z');

  const attrs = [
    { type: '2.5.4.5', value: rutFirmante },
    { name: 'commonName', value: `Firmante ${rutFirmante}` },
    { name: 'countryName', value: 'CL' },
  ];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey);

  const p12Asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], password, {
    algorithm: '3des',
  });
  const p12Der = forge.asn1.toDer(p12Asn1).getBytes();

  return {
    pfxBuffer: Buffer.from(p12Der, 'binary'),
    certificatePem: forge.pki.certificateToPem(cert),
    privateKeyPem: forge.pki.privateKeyToPem(keys.privateKey),
  };
}

export function createTestPfxWithoutRut(
  password: string,
  commonName = 'Firmante sin RUT explicito',
): { pfxBuffer: Buffer; certificatePem: string; privateKeyPem: string } {
  const keys = forge.pki.rsa.generateKeyPair(1024);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '02';
  cert.validity.notBefore = new Date('2026-01-01T00:00:00.000Z');
  cert.validity.notAfter = new Date('2030-01-01T00:00:00.000Z');

  const attrs = [
    { name: 'commonName', value: commonName },
    { name: 'organizationName', value: 'Empresa Test' },
    { name: 'countryName', value: 'CL' },
  ];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey);

  const p12Asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], password, {
    algorithm: '3des',
  });
  const p12Der = forge.asn1.toDer(p12Asn1).getBytes();

  return {
    pfxBuffer: Buffer.from(p12Der, 'binary'),
    certificatePem: forge.pki.certificateToPem(cert),
    privateKeyPem: forge.pki.privateKeyToPem(keys.privateKey),
  };
}

export function buildCafXml(
  rutEmisor: string,
  rangeStart: number,
  rangeEnd: number,
  tipoDTE: TipoDTE = TipoDTE.BoletaElectronica,
): string {
  const keys = forge.pki.rsa.generateKeyPair(512);
  const privateKeyAsn1 = forge.pki.privateKeyToAsn1(keys.privateKey);
  const privateKeyDer = forge.asn1.toDer(privateKeyAsn1).getBytes();
  const rsask = forge.util.encode64(privateKeyDer);

  const publicKeyAsn1 = forge.pki.publicKeyToAsn1(keys.publicKey);
  const publicKeyDer = forge.asn1.toDer(publicKeyAsn1).getBytes();
  const modulusHex = toEvenLengthHex(keys.publicKey.n.toString(16));
  const exponentHex = toEvenLengthHex(keys.publicKey.e.toString(16));
  const rsapkModulus = forge.util.encode64(forge.util.hexToBytes(modulusHex));
  const rsapkExponent = forge.util.encode64(forge.util.hexToBytes(exponentHex));
  const rsapubk = forge.util.encode64(publicKeyDer);

  return `<?xml version="1.0" encoding="ISO-8859-1"?>
<AUTORIZACION>
  <CAF version="1.0">
    <DA>
      <RE>${rutEmisor}</RE>
      <RS>EMISOR TEST</RS>
      <TD>${tipoDTE}</TD>
      <RNG><D>${rangeStart}</D><H>${rangeEnd}</H></RNG>
      <FA>2026-01-01</FA>
      <RSAPK>
        <M>${rsapkModulus}</M>
        <E>${rsapkExponent}</E>
      </RSAPK>
      <IDK>1</IDK>
    </DA>
    <FRMA algoritmo="SHA1withRSA">firma</FRMA>
  </CAF>
  <RSASK>${rsask}</RSASK>
  <RSAPUBK>${rsapubk}</RSAPUBK>
</AUTORIZACION>`;
}

function toEvenLengthHex(value: string): string {
  return value.length % 2 === 0 ? value : `0${value}`;
}
