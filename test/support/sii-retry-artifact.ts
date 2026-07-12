import {
  signDteXmlById,
  signEnvelope,
  verifyTedSignatureForDd,
  verifyXmlSignature,
  type CafData,
  type CertificateMaterial,
  type TipoDTE,
} from 'sii-engine';

export interface RetryArtifactValidation {
  documentId: string;
  signatureTimestamp: string;
  tedSignatureValid: true;
  dteSignatureValid: true;
  envelopeSignatureValid: true;
  certificateFingerprintSha256: string;
}

export interface PrepareBoletaRetryInput {
  sourceEnvelope: string;
  certificate: CertificateMaterial;
  tipoDTE: TipoDTE;
  folio: number;
  signatureTimestamp: string;
}

export interface PreparedRetryEnvelope {
  signedEnvelope: string;
  signatureTimestamp: string;
  validation: RetryArtifactValidation;
}

export function prepareBoletaRetryEnvelope(
  input: PrepareBoletaRetryInput,
): PreparedRetryEnvelope {
  assertEnvelopeRoot(input.sourceEnvelope, 'EnvioBOLETA');
  validateRetryArtifact(input.sourceEnvelope, {
    tipoDTE: input.tipoDTE,
    folio: input.folio,
    certificatePem: input.certificate.certificatePem,
  });
  const originalDte = requiredXmlBlock(input.sourceEnvelope, 'DTE');
  const documentId = requiredDocumentId(originalDte);
  const unsignedDte = stripTrailingSignature(originalDte, 'DTE');
  const withDocumentTimestamp = replaceRequiredTagValue(
    unsignedDte,
    'TmstFirma',
    input.signatureTimestamp,
  );
  const signedDte = signDteXmlById(
    withDocumentTimestamp,
    documentId,
    input.certificate,
  );

  const unsignedEnvelope = stripTrailingSignature(
    input.sourceEnvelope,
    'EnvioBOLETA',
  );
  const withSignedDte = unsignedEnvelope.replace(originalDte, signedDte);
  if (withSignedDte === unsignedEnvelope) {
    throw new Error('No se pudo reemplazar el DTE dentro de EnvioBOLETA.');
  }
  const withEnvelopeTimestamp = replaceRequiredTagValue(
    withSignedDte,
    'TmstFirmaEnv',
    input.signatureTimestamp,
  );
  const signedEnvelope = signEnvelope(
    withEnvelopeTimestamp,
    input.certificate,
    "//*[@ID='SetDoc']",
  );
  const validation = validateRetryArtifact(signedEnvelope, {
    tipoDTE: input.tipoDTE,
    folio: input.folio,
    certificatePem: input.certificate.certificatePem,
  });

  return {
    signedEnvelope,
    signatureTimestamp: input.signatureTimestamp,
    validation,
  };
}

export function validateRetryArtifact(
  signedEnvelope: string,
  input: {
    tipoDTE: TipoDTE;
    folio: number;
    caf?: CafData;
    certificatePem?: string;
  },
): RetryArtifactValidation {
  const expectedRoot = Number(input.tipoDTE) === 39 ? 'EnvioBOLETA' : 'EnvioDTE';
  assertEnvelopeRoot(signedEnvelope, expectedRoot);
  assertXmlNumber(signedEnvelope, 'TipoDTE', Number(input.tipoDTE));
  assertXmlNumber(signedEnvelope, 'Folio', input.folio);

  const signedDte = requiredXmlBlock(signedEnvelope, 'DTE');
  const documentId = requiredDocumentId(signedDte);
  const ddXml = requiredXmlBlock(signedDte, 'DD');
  const frmt = requiredXmlValue(signedDte, 'FRMT');
  const caf = input.caf ?? parseEmbeddedCaf(ddXml);
  assertCafOwnsFolio(caf, input.tipoDTE, input.folio);

  if (!verifyTedSignatureForDd(ddXml, caf, frmt)) {
    throw new Error('La firma TED/FRMT no es valida para el CAF del folio.');
  }

  const dteSignature = verifyXmlSignature(
    signedDte,
    `#${documentId}`,
    input.certificatePem,
  );
  if (!dteSignature.valid) {
    throw new Error(
      `La XMLDSig del DTE no es valida (${dteSignature.reason ?? 'UNKNOWN'}).`,
    );
  }

  const envelopeSignature = verifyXmlSignature(
    signedEnvelope,
    '#SetDoc',
    input.certificatePem,
  );
  if (!envelopeSignature.valid) {
    throw new Error(
      `La XMLDSig del sobre no es valida (${envelopeSignature.reason ?? 'UNKNOWN'}).`,
    );
  }
  if (
    dteSignature.certificateFingerprintSha256 !==
    envelopeSignature.certificateFingerprintSha256
  ) {
    throw new Error('Las firmas DTE y Envio usan certificados diferentes.');
  }

  const tsted = requiredXmlValue(signedDte, 'TSTED');
  const tmstFirma = requiredXmlValue(signedDte, 'TmstFirma');
  const tmstFirmaEnv = requiredXmlValue(signedEnvelope, 'TmstFirmaEnv');
  if (tsted > tmstFirma || tmstFirma > tmstFirmaEnv) {
    throw new Error(
      'Los timestamps deben cumplir TSTED <= TmstFirma <= TmstFirmaEnv.',
    );
  }

  return {
    documentId,
    signatureTimestamp: tmstFirmaEnv,
    tedSignatureValid: true,
    dteSignatureValid: true,
    envelopeSignatureValid: true,
    certificateFingerprintSha256:
      envelopeSignature.certificateFingerprintSha256 ?? '',
  };
}

function parseEmbeddedCaf(ddXml: string): CafData {
  const cafXml = requiredXmlBlock(ddXml, 'CAF');
  const daXml = requiredXmlBlock(cafXml, 'DA');
  const rangeXml = requiredXmlBlock(daXml, 'RNG');
  const rsaXml = requiredXmlBlock(daXml, 'RSAPK');
  return {
    da: {
      rutEmisor: requiredXmlValue(daXml, 'RE'),
      razonSocial: requiredXmlValue(daXml, 'RS'),
      tipoDTE: Number(requiredXmlValue(daXml, 'TD')) as TipoDTE,
      rangeStart: Number(requiredXmlValue(rangeXml, 'D')),
      rangeEnd: Number(requiredXmlValue(rangeXml, 'H')),
      fechaAutorizacion: requiredXmlValue(daXml, 'FA'),
      rsaPk: {
        modulus: requiredXmlValue(rsaXml, 'M'),
        exponent: requiredXmlValue(rsaXml, 'E'),
      },
      idk: requiredXmlValue(daXml, 'IDK'),
    },
    frma: requiredXmlValue(cafXml, 'FRMA'),
    rsapubk: '',
  };
}

function assertCafOwnsFolio(
  caf: CafData,
  tipoDTE: TipoDTE,
  folio: number,
): void {
  if (
    Number(caf.da.tipoDTE) !== Number(tipoDTE) ||
    folio < caf.da.rangeStart ||
    folio > caf.da.rangeEnd
  ) {
    throw new Error(`El CAF no autoriza DTE ${tipoDTE}, folio ${folio}.`);
  }
}

function stripTrailingSignature(xml: string, root: string): string {
  const rootClosingTag = `</${root}>`;
  const rootClosingIndex = xml.lastIndexOf(rootClosingTag);
  if (rootClosingIndex < 0) {
    throw new Error(`Falta cierre ${rootClosingTag}.`);
  }
  const beforeRootClose = xml.slice(0, rootClosingIndex);
  const signatureStarts = [
    ...beforeRootClose.matchAll(
      /<(?:[A-Za-z_][\w.-]*:)?Signature\b/g,
    ),
  ];
  const signatureStart = signatureStarts.at(-1)?.index;
  if (signatureStart === undefined) {
    throw new Error(`No se encontro la XMLDSig final de ${root}.`);
  }
  const signatureTail = beforeRootClose.slice(signatureStart);
  if (
    !/<\/(?:[A-Za-z_][\w.-]*:)?Signature>\s*$/.test(signatureTail)
  ) {
    throw new Error(`La XMLDSig final de ${root} no esta al cierre del nodo.`);
  }
  return `${beforeRootClose.slice(0, signatureStart)}${xml.slice(rootClosingIndex)}`;
}

function replaceRequiredTagValue(
  xml: string,
  tagName: string,
  value: string,
): string {
  const pattern = new RegExp(
    `(<${tagName}\\b[^>]*>)[\\s\\S]*?(<\\/${tagName}>)`,
  );
  if (!pattern.test(xml)) throw new Error(`Falta ${tagName} en el artefacto.`);
  return xml.replace(pattern, `$1${value}$2`);
}

function requiredDocumentId(xml: string): string {
  const id = xml.match(/<Documento\b[^>]*\bID=["']([^"']+)["']/)?.[1];
  if (!id) throw new Error('El DTE no contiene Documento/ID.');
  return id;
}

function assertEnvelopeRoot(xml: string, root: string): void {
  if (!new RegExp(`<${root}\\b`, 'i').test(xml)) {
    throw new Error(`El artefacto no contiene ${root}.`);
  }
}

function assertXmlNumber(xml: string, tagName: string, expected: number): void {
  const value = Number(requiredXmlValue(xml, tagName));
  if (value !== expected) {
    throw new Error(`${tagName} esperado ${expected}; recibido ${value}.`);
  }
}

function requiredXmlBlock(xml: string, tagName: string): string {
  const match = xml.match(
    new RegExp(`<${tagName}\\b[^>]*>[\\s\\S]*?<\\/${tagName}>`, 'i'),
  )?.[0];
  if (!match) throw new Error(`Falta bloque ${tagName} en el artefacto.`);
  return match;
}

function requiredXmlValue(xml: string, tagName: string): string {
  const value = xml
    .match(new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i'))?.[1]
    ?.trim();
  if (!value) throw new Error(`Falta ${tagName} en el artefacto.`);
  return value;
}
