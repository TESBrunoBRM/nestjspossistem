import forge from 'node-forge';
import {
  buildDteXml,
  buildEnvioBoletaXml,
  buildTedXml,
  signDteDocument,
  signEnvelope,
  signTed,
  TipoDTE,
  type CafMaterial,
  type CertificateMaterial,
  type DteDocument,
} from 'sii-engine';
import {
  prepareBoletaRetryEnvelope,
  validateRetryArtifact,
} from '../../test/support/sii-retry-artifact';

describe('SII retry artifact preparation', () => {
  it('re-signs the same boleta folio and validates TED plus both XMLDSig signatures', () => {
    const document = createDocument();
    const caf = createCaf();
    const certificate = createCertificate();
    const oldTimestamp = '2026-07-12T01:05:38';
    const newTimestamp = '2026-07-12T16:30:00';
    const sourceEnvelope = createSignedEnvelope(
      document,
      caf,
      certificate,
      oldTimestamp,
    );

    const prepared = prepareBoletaRetryEnvelope({
      sourceEnvelope,
      certificate,
      tipoDTE: TipoDTE.BoletaElectronica,
      folio: 34,
      signatureTimestamp: newTimestamp,
    });

    expect(prepared.signedEnvelope).toContain('<Folio>34</Folio>');
    expect(prepared.signedEnvelope).toContain(
      `<TSTED>${oldTimestamp}</TSTED>`,
    );
    expect(prepared.signedEnvelope).toContain(
      `<TmstFirma>${newTimestamp}</TmstFirma>`,
    );
    expect(prepared.signedEnvelope).toContain(
      `<TmstFirmaEnv>${newTimestamp}</TmstFirmaEnv>`,
    );
    expect(prepared.signedEnvelope.match(/<TED\b[\s\S]*?<\/TED>/)?.[0]).toBe(
      sourceEnvelope.match(/<TED\b[\s\S]*?<\/TED>/)?.[0],
    );
    expect(
      validateRetryArtifact(prepared.signedEnvelope, {
        tipoDTE: TipoDTE.BoletaElectronica,
        folio: 34,
        caf,
        certificatePem: certificate.certificatePem,
      }),
    ).toMatchObject({
      tedSignatureValid: true,
      dteSignatureValid: true,
      envelopeSignatureValid: true,
    });
  });
});

function createSignedEnvelope(
  document: DteDocument,
  caf: CafMaterial,
  certificate: CertificateMaterial,
  timestamp: string,
): string {
  const frmt = signTed(document, caf, timestamp);
  const ted = buildTedXml(document, caf, frmt, timestamp);
  const unsignedDte = buildDteXml(document, ted).replace(
    /<\/Documento>/,
    `<TmstFirma>${timestamp}</TmstFirma></Documento>`,
  );
  const signedDte = signDteDocument(unsignedDte, document, certificate);
  const envelope = buildEnvioBoletaXml(
    [{ document, tedXml: ted, signedXml: signedDte }],
    {
      rutEmisor: document.emisor.rutEmisor,
      rutEnvia: certificate.rutFirmante,
      fechaResolucion: '2026-05-09',
      nroResolucion: 0,
      fechaFirmaEnvio: timestamp,
    },
  )
    .replace(/(<EnvioBOLETA\b[^>]*>)/, '$1<SetDTE ID="SetDoc">')
    .replace(/<\/EnvioBOLETA>$/, '</SetDTE></EnvioBOLETA>');
  return signEnvelope(envelope, certificate, "//*[@ID='SetDoc']");
}

function createDocument(): DteDocument {
  return {
    idDoc: {
      tipoDTE: TipoDTE.BoletaElectronica,
      folio: 34,
      fechaEmision: '2026-07-12',
    },
    emisor: {
      rutEmisor: '78086484-2',
      rznSoc: 'ZEAK STUDIOS SPA',
      giroEmis: 'VENTA AL POR MENOR',
      acteco: 521100,
      dirOrigen: 'AV. PROVIDENCIA 123',
      cmnaOrigen: 'PROVIDENCIA',
    },
    receptor: {
      rutRecep: '66666666-6',
      rznSocRecep: 'SIN INFORMACION',
    },
    detalles: [
      {
        nroLinDet: 1,
        nmbItem: 'Smoke 2026-07-12',
        qtyItem: 1,
        prcItem: 500,
        montoItem: 500,
      },
    ],
    totales: { mntTotal: 500 },
  };
}

function createCaf(): CafMaterial {
  const keys = forge.pki.rsa.generateKeyPair(512);
  const privateDer = forge.asn1
    .toDer(forge.pki.privateKeyToAsn1(keys.privateKey))
    .getBytes();
  const modulus = forge.util.encode64(
    forge.util.hexToBytes(evenHex(keys.publicKey.n.toString(16))),
  );
  const exponent = forge.util.encode64(
    forge.util.hexToBytes(evenHex(keys.publicKey.e.toString(16))),
  );
  return {
    da: {
      rutEmisor: '78086484-2',
      razonSocial: 'ZEAK STUDIOS SPA',
      tipoDTE: TipoDTE.BoletaElectronica,
      rangeStart: 34,
      rangeEnd: 34,
      fechaAutorizacion: '2026-07-11',
      rsaPk: { modulus, exponent },
      idk: '100',
    },
    frma: 'firma-caf-test',
    rsask: forge.util.encode64(privateDer),
    rsapubk: '',
    rawXml: '<AUTORIZACION/>',
  };
}

function createCertificate(): CertificateMaterial {
  const keys = forge.pki.rsa.generateKeyPair(1024);
  const certificate = forge.pki.createCertificate();
  certificate.publicKey = keys.publicKey;
  certificate.serialNumber = '01';
  certificate.validity.notBefore = new Date('2026-01-01T00:00:00Z');
  certificate.validity.notAfter = new Date('2030-01-01T00:00:00Z');
  const attributes = [
    { name: 'commonName', value: 'SII Retry Test' },
    { name: 'countryName', value: 'CL' },
  ];
  certificate.setSubject(attributes);
  certificate.setIssuer(attributes);
  certificate.sign(keys.privateKey, forge.md.sha256.create());
  return {
    privateKeyPem: forge.pki.privateKeyToPem(keys.privateKey),
    certificatePem: forge.pki.certificateToPem(certificate),
    rutFirmante: '19157386-2',
    nombre: 'SII Retry Test',
    expiresAt: certificate.validity.notAfter,
    fingerprintSha256: 'test-fingerprint',
  };
}

function evenHex(value: string): string {
  return value.length % 2 === 0 ? value : `0${value}`;
}
