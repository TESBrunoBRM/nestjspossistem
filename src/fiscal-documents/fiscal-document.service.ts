import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { XMLParser } from 'fast-xml-parser';
import forge from 'node-forge';
import {
  BoletaSiiClient,
  buildDdXml,
  buildDteXml,
  buildEnvioDteXml,
  buildEnvioBoletaXml,
  buildTedXml,
  formatSiiTimestamp,
  isBoletaTipoDTE,
  DteSiiClient,
  signDteDocument,
  signEnvelope,
  signTed,
  toPublicSendResult,
  toPublicDteStatusQueryResult,
  toPublicPollingResult,
  toPublicCafStatus,
  validateDteDocument,
  pollOnce,
  parseSendStatus,
  resolveBoletaAuthScope,
  buildPrintedSampleArtifact,
  validateEdgeFiscalProvision,
  toPublicEdgeFiscalProvision,
  splitRut,
  TipoDTE,
  type CafMaterial,
  type DteDocument,
  type EnvioDTECaratula,
  type FolioProvider,
  type SendResult,
  type SendStatus,
  type SigningProvider,
} from 'sii-engine';
import { FiscalContextResolver } from '../fiscal/fiscal-context.resolver';
import { FISCAL_SIGNING_PROVIDER } from '../fiscal/fiscal-provider.tokens';
import { IssuerContextDto } from '../fiscal/dto/issuer-context.dto';
import { FiscalTokenProvider } from '../fiscal/fiscal-token.provider';
import { sanitizePublicPayload } from '../common/security/sensitive-redaction.util';
import { EmitBoletaDto } from './dto/emit-boleta.dto';
import { EmitDteDto } from './dto/emit-dte.dto';
import { FISCAL_FOLIO_PROVIDER } from './fiscal-documents.tokens';
import { FiscalDocumentRepository } from './fiscal-document.repository';
import { CreateEdgeProvisionDto } from './dto/create-edge-provision.dto';

@Injectable()
export class FiscalDocumentService {
  private readonly boletaClient = new BoletaSiiClient({
    userAgent: 'Mozilla/4.0 (compatible; PROG 1.0; Windows NT 5.0)',
  });
  private readonly dteClient = new DteSiiClient({
    userAgent: 'Mozilla/4.0 (compatible; PROG 1.0; Windows NT 5.0)',
  });
  private readonly inFlight = new Set<string>();
  private readonly logger = new Logger(FiscalDocumentService.name);

  constructor(
    private readonly contextResolver: FiscalContextResolver,
    @Inject(FISCAL_SIGNING_PROVIDER)
    private readonly signingProvider: SigningProvider,
    private readonly tokenProvider: FiscalTokenProvider,
    @Inject(FISCAL_FOLIO_PROVIDER)
    private readonly folios: FolioProvider,
    private readonly repository: FiscalDocumentRepository,
  ) {}

  async emitirBoleta(dto: EmitBoletaDto) {
    const context = await this.contextResolver.resolve(dto.context);
    const input = dto.document as unknown as DteDocument;

    if (!isBoletaTipoDTE(Number(input.idDoc?.tipoDTE))) {
      throw new BadRequestException(
        'El endpoint de boleta solo acepta DTE tipo 39 o 41.',
      );
    }

    if (
      input.emisor?.rutEmisor &&
      input.emisor.rutEmisor !== context.rutEmisor
    ) {
      throw new BadRequestException(
        `El RUT emisor del documento (${input.emisor.rutEmisor}) no coincide con el contexto configurado (${context.rutEmisor})`,
      );
    }

    const cert = await this.signingProvider.getSigningMaterial(context);
    const idempotencyKey = `emit-${context.rutEmisor}-${input.idDoc.tipoDTE}-${input.idDoc.folio ?? JSON.stringify(input)}`;

    if (this.inFlight.has(idempotencyKey)) {
      throw new BadRequestException('Esta emision ya se encuentra en curso.');
    }

    this.inFlight.add(idempotencyKey);

    try {
      const assignment =
        typeof input.idDoc.folio === 'number' && input.idDoc.folio > 0
          ? await this.folios.reserveFolio(
              context,
              input.idDoc.tipoDTE,
              input.idDoc.folio,
            )
          : await this.folios.getNextFolio(context, input.idDoc.tipoDTE);

      const document: DteDocument = {
        ...input,
        idDoc: {
          ...input.idDoc,
          folio: assignment.folio,
        },
        emisor: {
          ...input.emisor,
          rutEmisor: context.rutEmisor,
          rznSoc: assignment.caf.da.razonSocial,
        },
        receptor: input.receptor ?? {
          rutRecep: '66666666-6',
          rznSocRecep: 'SIN INFORMACION',
        },
      };

      validateDteDocument(document, context, assignment.caf);

      const signatureTimestamp = formatSiiTimestamp();
      const frmt = signTed(document, assignment.caf, signatureTimestamp);
      if (
        !verifyTedSignature(document, assignment.caf, frmt, signatureTimestamp)
      ) {
        throw new BadRequestException(
          'No se pudo verificar localmente la firma del TED antes del envio al SII.',
        );
      }
      const tedXml = buildTedXml(
        document,
        assignment.caf,
        frmt,
        signatureTimestamp,
      )
        .replace(/(<\/DD>\s*)<FRMA\b/, '$1<FRMT')
        .replace(/<\/FRMA>\s*<\/TED>/, '</FRMT>\n</TED>');
      const dteXml = normalizeBoletaDteXml(
        buildDteXml(document, tedXml),
        signatureTimestamp,
      );
      const signedDte = signDteDocument(dteXml, document, cert);
      assertEmbeddedTedSignature(
        signedDte,
        assignment.caf,
        'documento DTE firmado',
      );

      const caratula: EnvioDTECaratula = {
        rutEmisor: context.rutEmisor,
        rutEnvia: cert.rutFirmante,
        fechaResolucion: context.fechaResolucion,
        nroResolucion: context.nroResolucion,
        fechaFirmaEnvio: signatureTimestamp,
      };

      const envelope = buildEnvioBoletaXml(
        [{ document, tedXml, signedXml: signedDte }],
        caratula,
      );
      const signedEnvelope = signEnvelope(
        ensureEnvioBoletaSetDte(envelope),
        cert,
        "//*[@ID='SetDoc']",
      );
      assertEmbeddedTedSignature(
        signedEnvelope,
        assignment.caf,
        'sobre firmado EnvioBOLETA',
      );
      const token =
        resolveBoletaAuthScope(context.environment) === 'boleta_rest'
          ? await this.tokenProvider.getBoletaToken(
              context,
              this.signingProvider,
            )
          : await this.tokenProvider.getToken(context, this.signingProvider);
      const result = await this.sendBoletaToSii(
        signedEnvelope,
        context,
        token.token,
        cert.rutFirmante,
      );

      const internalId = randomUUID();

      // Save document to in-memory repository
      this.repository.create({
        internalId,
        tenantId: context.tenantId,
        rutEmisor: context.rutEmisor,
        tipoDTE: document.idDoc.tipoDTE,
        folio: assignment.folio,
        trackId: result.trackId,
        status: result.status,
        attempts: 0,
        document,
        tedXml,
        signedDteXml: signedDte,
        signedEnvelopeXml: signedEnvelope,
        nextPollAt: new Date(Date.now() + 60000), // Next recommended poll after 60s
      });

      return {
        internalId,
        folio: assignment.folio,
        ...toPublicSendResult(result),
      };
    } finally {
      this.inFlight.delete(idempotencyKey);
    }
  }

  async emitirDte(dto: EmitDteDto, expectedTipoDTE: number) {
    const context = await this.contextResolver.resolve(dto.context);
    const input = dto.document as unknown as DteDocument;

    this.assertDteType(input, expectedTipoDTE);
    this.assertDocumentRutMatchesContext(input, context.rutEmisor);
    this.assertDteBusinessRules(input);
    this.assertReferencesForNotes(input);

    const cert = await this.signingProvider.getSigningMaterial(context);
    const idempotencyKey = `emit-${context.rutEmisor}-${input.idDoc.tipoDTE}-${input.idDoc.folio ?? JSON.stringify(input)}`;

    if (this.inFlight.has(idempotencyKey)) {
      throw new BadRequestException('Esta emision ya se encuentra en curso.');
    }

    this.inFlight.add(idempotencyKey);

    try {
      const assignment =
        typeof input.idDoc.folio === 'number' && input.idDoc.folio > 0
          ? await this.folios.reserveFolio(
              context,
              input.idDoc.tipoDTE,
              input.idDoc.folio,
            )
          : await this.folios.getNextFolio(context, input.idDoc.tipoDTE);

      const document: DteDocument = {
        ...input,
        idDoc: {
          ...input.idDoc,
          folio: assignment.folio,
        },
        emisor: {
          ...input.emisor,
          rutEmisor: context.rutEmisor,
          rznSoc: assignment.caf.da.razonSocial,
        },
      };

      validateDteDocument(document, context, assignment.caf);
      this.assertDteBusinessRules(document);
      this.assertReferencesForNotes(document);

      const signatureTimestamp = formatSiiTimestamp();
      const frmt = signTed(document, assignment.caf, signatureTimestamp);
      if (
        !verifyTedSignature(document, assignment.caf, frmt, signatureTimestamp)
      ) {
        throw new BadRequestException(
          'No se pudo verificar localmente la firma del TED antes del envio al SII.',
        );
      }

      const tedXml = buildTedXml(
        document,
        assignment.caf,
        frmt,
        signatureTimestamp,
      );
      const dteXml = normalizeDteXml(
        buildDteXml(document, tedXml),
        signatureTimestamp,
      );
      const signedDte = signDteDocument(dteXml, document, cert);
      assertEmbeddedTedSignature(
        signedDte,
        assignment.caf,
        'documento DTE firmado',
      );

      const caratula: EnvioDTECaratula = {
        rutEmisor: context.rutEmisor,
        rutEnvia: cert.rutFirmante,
        fechaResolucion: context.fechaResolucion,
        nroResolucion: context.nroResolucion,
        fechaFirmaEnvio: signatureTimestamp,
      };

      const envelope = buildEnvioDteXml(
        [{ document, tedXml, signedXml: signedDte }],
        caratula,
      );
      const signedEnvelope = signEnvelope(
        ensureEnvioDteSetDte(envelope),
        cert,
        "//*[@ID='SetDoc']",
      );
      assertEmbeddedTedSignature(
        signedEnvelope,
        assignment.caf,
        'sobre firmado EnvioDTE',
      );

      const token = await this.tokenProvider.getToken(
        context,
        this.signingProvider,
      );
      const result = await this.dteClient.send(
        signedEnvelope,
        context,
        token.token,
        cert.rutFirmante,
      );

      const internalId = randomUUID();
      this.repository.create({
        internalId,
        tenantId: context.tenantId,
        rutEmisor: context.rutEmisor,
        tipoDTE: document.idDoc.tipoDTE,
        folio: assignment.folio,
        trackId: result.trackId,
        status: result.status,
        attempts: 0,
        document,
        tedXml,
        signedDteXml: signedDte,
        signedEnvelopeXml: signedEnvelope,
        nextPollAt: new Date(Date.now() + 60000),
      });

      return {
        internalId,
        folio: assignment.folio,
        ...toPublicSendResult(result),
      };
    } finally {
      this.inFlight.delete(idempotencyKey);
    }
  }

  async getFactura33Readiness(dto: IssuerContextDto) {
    const context = await this.contextResolver.resolve(dto);
    const checks: Array<{
      name: string;
      ok: boolean;
      detail?: string;
    }> = [];

    let certificateAvailable = false;
    try {
      await this.signingProvider.getSigningMaterial(context);
      certificateAvailable = true;
      checks.push({ name: 'certificate', ok: true });
    } catch (error) {
      checks.push({
        name: 'certificate',
        ok: false,
        detail: publicErrorDetail(error),
      });
    }

    let tokenAvailable = false;
    if (certificateAvailable) {
      try {
        await this.tokenProvider.getToken(context, this.signingProvider);
        tokenAvailable = true;
        checks.push({ name: 'siiAuth', ok: true });
      } catch (error) {
        checks.push({
          name: 'siiAuth',
          ok: false,
          detail: publicErrorDetail(error),
        });
      }
    } else {
      checks.push({
        name: 'siiAuth',
        ok: false,
        detail:
          'No se verifica autenticacion SII porque no hay certificado disponible.',
      });
    }

    const cafStatuses = await this.folios.getStatus(
      context,
      TipoDTE.FacturaElectronica,
    );
    const publicCafs = cafStatuses.map((status) => toPublicCafStatus(status));
    const hasUsableCaf = publicCafs.some((status) => {
      const remaining = Number(status.remaining ?? 0);
      return (
        Number.isFinite(remaining) &&
        remaining > 0 &&
        ['active', 'expiring_soon'].includes(String(status.status))
      );
    });
    checks.push({
      name: 'caf33',
      ok: hasUsableCaf,
      detail: hasUsableCaf
        ? undefined
        : 'No hay CAF 33 activo con folios disponibles para este emisor.',
    });

    const ready = certificateAvailable && tokenAvailable && hasUsableCaf;
    return sanitizePublicPayload({
      ready,
      tipoDTE: TipoDTE.FacturaElectronica,
      rutEmisor: context.rutEmisor,
      environment: context.environment,
      checks,
      cafs: publicCafs,
      nextAction: ready
        ? 'Factura 33 lista para emision.'
        : 'Importar/obtener CAF 33 autorizado por SII antes de emitir factura.',
    });
  }

  async getSendStatus(
    idOrTrackId: string,
    dto: IssuerContextDto,
    forceBoleta = false,
  ) {
    const context = await this.contextResolver.resolve(dto);

    let record = this.repository.findById(idOrTrackId);
    if (!record) {
      record = this.repository.findByTrackId(idOrTrackId);
    }

    const trackIdToQuery = record?.trackId || idOrTrackId;
    const attempt = record ? record.attempts : 0;
    const isBoleta =
      forceBoleta || Boolean(record && isBoletaTipoDTE(record.tipoDTE));
    const token =
      isBoleta && resolveBoletaAuthScope(context.environment) === 'boleta_rest'
        ? await this.tokenProvider.getBoletaToken(context, this.signingProvider)
        : await this.tokenProvider.getToken(context, this.signingProvider);
    const client = isBoleta ? this.boletaClient : this.dteClient;
    const pollResult = await pollOnce(
      trackIdToQuery,
      { context, token: token.token },
      client,
      attempt,
    );

    if (record) {
      this.repository.update(record.internalId, {
        status: pollResult.normalizedStatus,
        attempts: record.attempts + 1,
        nextPollAt: new Date(Date.now() + pollResult.nextPollAfter),
      });
    }

    return toPublicPollingResult(pollResult);
  }

  async getBoletaStatus(idOrTrackId: string, dto: IssuerContextDto) {
    return this.getSendStatus(idOrTrackId, dto, true);
  }

  async getDteStatus(internalId: string, dto: IssuerContextDto) {
    const context = await this.contextResolver.resolve(dto);
    const record = this.repository.findById(internalId);
    if (!record) {
      throw new NotFoundException('Documento no encontrado.');
    }
    if (isBoletaTipoDTE(record.tipoDTE)) {
      throw new BadRequestException(
        'La consulta de estado DTE no aplica a boletas; use estado de envio por trackId.',
      );
    }

    const token = await this.tokenProvider.getToken(
      context,
      this.signingProvider,
    );
    const cert = await this.signingProvider.getSigningMaterial(context);
    const rutConsultante = splitRut(cert.rutFirmante);
    const rutReceptor = splitRut(record.document.receptor.rutRecep);
    const result = await this.dteClient.queryDteStatus(
      {
        rutConsultante: rutConsultante.rut,
        dvConsultante: rutConsultante.dv,
        tipoDTE: record.tipoDTE,
        folio: record.folio,
        fechaEmision: record.document.idDoc.fechaEmision,
        montoTotal: record.document.totales.mntTotal,
        rutReceptor: rutReceptor.rut,
        dvReceptor: rutReceptor.dv,
        token: token.token,
      },
      context,
      token.token,
    );

    return toPublicDteStatusQueryResult(result);
  }

  getPrintedSample(internalId: string) {
    const record = this.repository.findById(internalId);
    if (!record) {
      throw new NotFoundException('Documento no encontrado.');
    }

    return buildPrintedSampleArtifact(record.document, record.tedXml);
  }

  async generateEdgeProvision(dto: CreateEdgeProvisionDto) {
    const context = await this.contextResolver.resolve(dto.context);
    const provision = {
      tenantId: context.tenantId || 'default-tenant',
      merchantId: context.merchantId,
      branchId: context.branchId || 'default-branch',
      terminalId: 'default-terminal',
      environment: context.environment,
      rutEmisor: context.rutEmisor,
      tipoDTE: dto.tipoDTE,
      folioStart: dto.folioStart,
      folioEnd: dto.folioEnd,
      issuedAt: new Date().toISOString(),
      expiresAt: dto.expiresAt,
      policyVersion: 'edge-v1',
      maxDocuments: dto.maxDocuments,
      revoked: false,
    };

    const validation = validateEdgeFiscalProvision(provision);
    if (!validation.valid) {
      throw new BadRequestException({
        message: 'La provision edge solicitada no es valida.',
        details: validation.issues,
      });
    }

    return toPublicEdgeFiscalProvision(provision);
  }

  private async sendBoletaToSii(
    signedEnvelope: string,
    context: Awaited<ReturnType<FiscalContextResolver['resolve']>>,
    token: string,
    rutFirmante: string,
  ) {
    try {
      return await this.boletaClient.send(
        signedEnvelope,
        context,
        token,
        rutFirmante,
      );
    } catch (error) {
      const uploadReception = parseSiiUploadReceptionError(error);
      if (uploadReception) return uploadReception;

      const diagnostic = describeRawSiiResponse(error);
      if (diagnostic) {
        this.logger.warn(
          `Respuesta SII no reconocida al enviar boleta: ${diagnostic}`,
        );
      }

      throw error;
    }
  }

  private assertDteType(document: DteDocument, expectedTipoDTE: number): void {
    const tipoDTE = Number(document.idDoc?.tipoDTE);
    if (tipoDTE !== expectedTipoDTE) {
      throw new BadRequestException(
        `El endpoint solicitado solo acepta DTE ${expectedTipoDTE}.`,
      );
    }

    if (isBoletaTipoDTE(tipoDTE)) {
      throw new BadRequestException(
        'Las boletas deben emitirse por el endpoint dedicado /documents/boletas.',
      );
    }

    const supported = [
      TipoDTE.FacturaElectronica,
      TipoDTE.FacturaNoAfectaExentaElectronica,
      TipoDTE.FacturaCompraElectronica,
      TipoDTE.GuiaDespachoElectronica,
      TipoDTE.NotaDebito,
      TipoDTE.NotaCredito,
    ].includes(tipoDTE);
    if (!supported) {
      throw new BadRequestException(
        `DTE ${tipoDTE} aun no esta soportado por sii-engine en este host.`,
      );
    }
  }

  private assertDocumentRutMatchesContext(
    document: DteDocument,
    rutEmisor: string,
  ): void {
    if (document.emisor?.rutEmisor && document.emisor.rutEmisor !== rutEmisor) {
      throw new BadRequestException(
        `El RUT emisor del documento (${document.emisor.rutEmisor}) no coincide con el contexto configurado (${rutEmisor})`,
      );
    }
  }

  private assertReferencesForNotes(document: DteDocument): void {
    const tipoDTE = Number(document.idDoc?.tipoDTE);
    if (
      tipoDTE !== Number(TipoDTE.NotaCredito) &&
      tipoDTE !== Number(TipoDTE.NotaDebito)
    ) {
      return;
    }

    if (!document.referencias?.length) {
      throw new BadRequestException(
        'Las notas de credito/debito requieren al menos una referencia al DTE origen.',
      );
    }

    for (const referencia of document.referencias) {
      if (!referencia.codRef || ![1, 2, 3].includes(referencia.codRef)) {
        throw new BadRequestException(
          'Cada referencia de nota debe incluir codRef 1, 2 o 3.',
        );
      }
      if (!referencia.razonRef?.trim()) {
        throw new BadRequestException(
          'Cada referencia de nota debe incluir razonRef.',
        );
      }
      if (!referencia.indGlobal && !referencia.folioRef) {
        throw new BadRequestException(
          'Cada referencia no global debe incluir folioRef.',
        );
      }
    }
  }

  private assertDteBusinessRules(document: DteDocument): void {
    const tipoDTE = Number(document.idDoc?.tipoDTE);

    if (
      tipoDTE === Number(TipoDTE.FacturaNoAfectaExentaElectronica) &&
      (document.totales?.iva ?? 0) > 0
    ) {
      throw new BadRequestException(
        'La factura exenta DTE 34 no debe informar IVA mayor a cero.',
      );
    }

    if (
      tipoDTE === Number(TipoDTE.GuiaDespachoElectronica) &&
      !document.idDoc?.indTraslado
    ) {
      throw new BadRequestException(
        'La guia de despacho DTE 52 requiere indTraslado.',
      );
    }
  }
}

const siiUploadResponseParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  trimValues: true,
});

function parseSiiUploadReceptionError(error: unknown): SendResult | undefined {
  const rawResponse = getRawSiiResponse(error);
  if (!rawResponse) return undefined;

  if (rawResponse.includes('RECEPCIONDTE')) {
    return parseSiiUploadReceptionXml(rawResponse);
  }

  return parseSiiUploadReceptionHtml(rawResponse);
}

function ensureEnvioBoletaSetDte(envelopeXml: string): string {
  const withVersion = envelopeXml.replace(
    /<Caratula>/,
    '<Caratula version="1.0">',
  );

  if (withVersion.includes('<SetDTE')) return withVersion;

  return withVersion
    .replace(/(<EnvioBOLETA\b[^>]*>)/, '$1\n<SetDTE ID="SetDoc">')
    .replace(/<\/EnvioBOLETA>\s*$/, '</SetDTE>\n</EnvioBOLETA>');
}

function ensureEnvioDteSetDte(envelopeXml: string): string {
  if (envelopeXml.includes('<SetDTE')) return envelopeXml;

  return envelopeXml
    .replace(/(<EnvioDTE\b[^>]*>)/, '$1\n<SetDTE ID="SetDoc">')
    .replace(/<\/EnvioDTE>\s*$/, '</SetDTE>\n</EnvioDTE>');
}

function normalizeBoletaDteXml(
  dteXml: string,
  signatureTimestamp: string,
): string {
  const withServiceIndicator = dteXml.includes('<IndServicio>')
    ? dteXml
    : dteXml.replace(
        /(<FchEmis>[^<]+<\/FchEmis>)/,
        '$1\n<IndServicio>3</IndServicio>',
      );

  const withBoletaEmisorTags = withServiceIndicator
    .replace(/<RznSoc>/g, '<RznSocEmisor>')
    .replace(/<\/RznSoc>/g, '</RznSocEmisor>')
    .replace(/<GiroEmis>/g, '<GiroEmisor>')
    .replace(/<\/GiroEmis>/g, '</GiroEmisor>')
    .replace(/\s*<Acteco>[^<]*<\/Acteco>/g, '');

  if (withBoletaEmisorTags.includes('<TmstFirma>')) {
    return withBoletaEmisorTags;
  }

  return withBoletaEmisorTags.replace(
    /(\s*<\/Documento>)/,
    `\n<TmstFirma>${signatureTimestamp}</TmstFirma>$1`,
  );
}

function normalizeDteXml(dteXml: string, signatureTimestamp: string): string {
  if (dteXml.includes('<TmstFirma>')) {
    return dteXml;
  }

  return dteXml.replace(
    /(\s*<\/Documento>)/,
    `\n<TmstFirma>${signatureTimestamp}</TmstFirma>$1`,
  );
}

function parseSiiUploadReceptionXml(
  rawResponse: string,
): SendResult | undefined {
  let parsed: unknown;
  try {
    parsed = siiUploadResponseParser.parse(rawResponse);
  } catch {
    return undefined;
  }

  if (!isRecord(parsed)) return undefined;

  const reception = findRecordByLocalName(parsed, 'RECEPCIONDTE');
  if (!reception) return undefined;

  const statusRaw = readXmlValue(reception, 'STATUS');
  const trackId = readXmlValue(reception, 'TRACKID');
  const detail =
    readXmlValue(reception, 'GLOSA') ||
    readXmlValue(reception, 'DETAIL') ||
    readXmlValue(reception, 'DETALLE') ||
    readXmlValue(reception, 'ERROR') ||
    readXmlValue(reception, 'MESSAGE');

  if (!trackId && statusRaw === '0') return undefined;

  return {
    trackId,
    status: mapSiiUploadStatus(statusRaw),
    detail: detail || undefined,
    rawResponse,
  };
}

function parseSiiUploadReceptionHtml(
  rawResponse: string,
): SendResult | undefined {
  if (!rawResponse.includes('RESULTADO DEL UPLOAD')) return undefined;

  const text = normalizeHtmlText(rawResponse);
  const statusRaw =
    readHtmlInputValue(rawResponse, ['STATUS', 'ESTADO']) ||
    readTextField(text, ['STATUS', 'ESTADO']);
  const trackId =
    readHtmlInputValue(rawResponse, ['TRACKID', 'TRACK_ID']) ||
    readTextField(text, ['TRACK\\s*ID', 'TRACKID', 'TRACK_ID']);

  if (!trackId && statusRaw === '0') return undefined;
  if (!trackId && !statusRaw) return undefined;

  return {
    trackId,
    status: mapSiiUploadStatus(statusRaw),
    detail: statusRaw === '0' ? 'Upload OK' : extractSafeHtmlHint(rawResponse),
    rawResponse,
  };
}

function getRawSiiResponse(error: unknown): string | undefined {
  if (!isRecord(error)) return undefined;

  const rawResponse = error.rawResponse;
  if (typeof rawResponse === 'string') return rawResponse;

  const cause = error.cause;
  if (!isRecord(cause)) return undefined;

  const response = cause.response;
  if (!isRecord(response)) return undefined;

  const data = response.data;
  return typeof data === 'string' ? data : undefined;
}

function describeRawSiiResponse(error: unknown): string | undefined {
  const rawResponse = getRawSiiResponse(error);
  if (!rawResponse) return undefined;

  const rootMatch = rawResponse.match(/<([A-Za-z_][\w:.-]*)[\s>]/);
  const root = rootMatch?.[1] ? toLocalXmlName(rootMatch[1]) : 'UNKNOWN';
  const kind = root === 'HTML' ? 'html' : root === 'UNKNOWN' ? 'text' : 'xml';
  const hint = root === 'HTML' ? extractSafeHtmlHint(rawResponse) : undefined;
  const diagnostic = `kind=${kind};root=${root};length=${rawResponse.length}${
    hint ? `;hint=${hint}` : ''
  }`;

  return sanitizePublicPayload(diagnostic);
}

function publicErrorDetail(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return sanitizePublicPayload(message || 'Error desconocido');
}

function extractSafeHtmlHint(html: string): string | undefined {
  const title = matchTagText(html, 'title');
  const bodyText = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const hint =
    title && !title.includes('RESULTADO DEL UPLOAD') ? title : bodyText;
  if (!hint) return undefined;

  return hint
    .replace(/[<>{}[\]"'`\\]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);
}

function matchTagText(html: string, tagName: string): string | undefined {
  const match = html.match(
    new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i'),
  );
  return match?.[1]?.replace(/\s+/g, ' ').trim() || undefined;
}

function normalizeHtmlText(html: string): string {
  return decodeHtmlEntities(html)
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function readHtmlInputValue(html: string, names: string[]): string {
  for (const name of names) {
    const nameThenValue = html.match(
      new RegExp(`name=["']${name}["'][^>]*value=["']([^"']+)["']`, 'i'),
    );
    if (nameThenValue?.[1]) return nameThenValue[1].trim();

    const valueThenName = html.match(
      new RegExp(`value=["']([^"']+)["'][^>]*name=["']${name}["']`, 'i'),
    );
    if (valueThenName?.[1]) return valueThenName[1].trim();
  }

  return '';
}

function readTextField(text: string, labels: string[]): string {
  for (const label of labels) {
    const match = text.match(new RegExp(`${label}\\s*[:=]?\\s*([\\w-]+)`, 'i'));
    if (match?.[1]) return match[1].trim();
  }

  return '';
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function assertEmbeddedTedSignature(
  xml: string,
  caf: CafMaterial,
  label: string,
): void {
  const ddXml = extractXmlBlock(xml, 'DD');
  const frmt = extractXmlValue(xml, 'FRMT') ?? extractTedFrmaValue(xml);

  if (!ddXml || !frmt) {
    throw new BadRequestException(
      `No se pudo extraer DD/FRMT del ${label} para validar el TED.`,
    );
  }

  if (!verifyTedSignatureForDd(ddXml, caf, frmt)) {
    throw new BadRequestException(
      `La firma TED embebida en el ${label} no coincide con el DD serializado.`,
    );
  }
}

function verifyTedSignature(
  document: DteDocument,
  caf: CafMaterial,
  signatureBase64: string,
  signatureTimestamp: string,
): boolean {
  return verifyTedSignatureForDd(
    buildDdXml(document, caf, signatureTimestamp),
    caf,
    signatureBase64,
  );
}

function verifyTedSignatureForDd(
  ddXml: string,
  caf: CafMaterial,
  signatureBase64: string,
): boolean {
  try {
    const publicKey = forge.pki.setRsaPublicKey(
      new forge.jsbn.BigInteger(
        forge.util.bytesToHex(forge.util.decode64(caf.da.rsaPk.modulus)),
        16,
      ),
      new forge.jsbn.BigInteger(
        forge.util.bytesToHex(forge.util.decode64(caf.da.rsaPk.exponent)),
        16,
      ),
    );
    const md = forge.md.sha1.create();
    md.update(normalizeDdXmlForTedVerification(ddXml), 'utf8');
    return publicKey.verify(
      md.digest().bytes(),
      forge.util.decode64(signatureBase64),
    );
  } catch {
    return false;
  }
}

function normalizeDdXmlForTedVerification(ddXml: string): string {
  return ddXml
    .trim()
    .replace(/^<DD\b[^>]*>/, '<DD>')
    .replace(/\s+xmlns(?::[A-Za-z0-9_-]+)?="[^"]*"/g, '');
}

function extractXmlBlock(xml: string, tagName: string): string | undefined {
  const startTag = `<${tagName}`;
  const endTag = `</${tagName}>`;
  const startIndex = xml.indexOf(startTag);
  const endIndex = xml.indexOf(endTag);

  if (startIndex === -1 || endIndex === -1) return undefined;
  return xml.slice(startIndex, endIndex + endTag.length);
}

function extractXmlValue(xml: string, tagName: string): string | undefined {
  const match = xml.match(
    new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)</${tagName}>`, 'i'),
  );
  const value = match?.[1]?.trim();
  return value ? value : undefined;
}

function extractTedFrmaValue(xml: string): string | undefined {
  const match = xml.match(
    /<\/DD>\s*<FRMA\b[^>]*>([\s\S]*?)<\/FRMA>\s*<\/TED>/i,
  );
  const value = match?.[1]?.trim();
  return value ? value : undefined;
}

function findRecordByLocalName(
  record: Record<string, unknown>,
  localName: string,
): Record<string, unknown> | undefined {
  for (const [key, value] of Object.entries(record)) {
    if (toLocalXmlName(key) === localName && isRecord(value)) {
      return value;
    }
  }

  return undefined;
}

function readXmlValue(
  record: Record<string, unknown>,
  localName: string,
): string {
  for (const [key, value] of Object.entries(record)) {
    if (toLocalXmlName(key) !== localName) continue;
    return stringifyXmlValue(value);
  }

  return '';
}

function mapSiiUploadStatus(rawStatus: string): SendStatus {
  const normalized = rawStatus.trim().toUpperCase();

  const uploadStatusMap: Record<string, SendStatus> = {
    '0': 'EPR',
    '1': 'RCH',
    '2': 'RCH',
    '3': 'RCH',
    '5': 'RCH',
    '6': 'RCH',
    '7': 'RSC',
    '8': 'RCT',
    '9': 'RCH',
  };

  if (uploadStatusMap[normalized]) return uploadStatusMap[normalized];

  const parsed = parseSendStatus(normalized);
  if (parsed !== 'UNKNOWN') return parsed;
  return normalized ? 'RCH' : 'UNKNOWN';
}

function stringifyXmlValue(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value.trim();
  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return String(value).trim();
  }

  if (Array.isArray(value)) {
    return value.map(stringifyXmlValue).filter(Boolean).join('; ');
  }

  return Object.values(value as Record<string, unknown>)
    .map(stringifyXmlValue)
    .filter(Boolean)
    .join('; ');
}

function toLocalXmlName(name: string): string {
  return name.split(':').pop()?.toUpperCase() ?? name.toUpperCase();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
