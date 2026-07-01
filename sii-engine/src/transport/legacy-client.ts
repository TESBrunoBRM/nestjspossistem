import axios from "axios";
import { randomBytes } from "crypto";
import { XMLParser } from "fast-xml-parser";
import type { SendResult, StatusQueryResult, DteStatusQueryResult } from "../types/transport.types.js";
import { SiiEnvironment } from "../types/transport.types.js";
import type { IssuerContext } from "../types/context.types.js";
import { SiiSendError, SiiError } from "../errors/sii-errors.js";
import { parseSendStatus, parseDteStatus } from "../states/index.js";

const UPLOAD_ENDPOINTS: Record<SiiEnvironment, string> = {
  [SiiEnvironment.Certificacion]: "https://maullin.sii.cl/cgi_dte/UPL/DTEUpload",
  [SiiEnvironment.Produccion]: "https://palena.sii.cl/cgi_dte/UPL/DTEUpload",
};

const STATUS_ENDPOINTS: Record<SiiEnvironment, string> = {
  [SiiEnvironment.Certificacion]: "https://maullin.sii.cl/DTEWS/QueryEstUp.jws",
  [SiiEnvironment.Produccion]: "https://palena.sii.cl/DTEWS/QueryEstUp.jws",
};

const DTE_STATUS_ENDPOINTS: Record<SiiEnvironment, string> = {
  [SiiEnvironment.Certificacion]: "https://maullin.sii.cl/DTEWS/QueryEstDte.jws",
  [SiiEnvironment.Produccion]: "https://palena.sii.cl/DTEWS/QueryEstDte.jws",
};

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseTagValue: false,
  trimValues: true,
});

export interface LegacySendOptions {
  rutSender: string;
  dvSender: string;
  rutCompany: string;
  dvCompany: string;
  token: string;
  environment: SiiEnvironment;
}

export async function sendDte(
  envioDteXml: string,
  options: LegacySendOptions
): Promise<SendResult> {
  const url = UPLOAD_ENDPOINTS[options.environment];
  const multipart = buildLegacyUploadMultipart(envioDteXml, options);

  let responseData: string;
  try {
    const headers: Record<string, string | number> = {
      Accept:
        "image/gif, image/x-xbitmap, image/jpeg, image/pjpeg, application/vnd.ms-powerpoint, application/ms-excel, application/msword, */*",
      "Accept-Language": "es-cl",
      "Cache-Control": "no-cache",
      Connection: "Keep-Alive",
      "Content-Length": multipart.body.length,
      "Content-Type": `multipart/form-data; boundary=${multipart.boundary}`,
      Cookie: `TOKEN=${options.token}`,
      Referer: "http://www.empresa.cl",
      "User-Agent":
        "Mozilla/4.0 (compatible; PROG 1.0; Windows NT 5.0; YComp 5.0.2.4)",
    };

    const res = await axios.post(url, multipart.body, {
      headers,
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      timeout: 60000,
    });
    responseData = res.data as string;
  } catch (err) {
    const rawResponse = getAxiosErrorResponseData(err);
    throw new SiiSendError("SEND_FAILED", "Error de red al enviar el DTE al SII", {
      cause: err as Error,
      rawResponse,
      detail: rawResponse ? "El SII devolvio una respuesta HTTP de error durante el upload" : undefined,
    });
  }

  return parseSendResponse(responseData);
}

function getAxiosErrorResponseData(err: unknown): string | undefined {
  if (!err || typeof err !== "object") return undefined;

  const response = (err as { response?: { data?: unknown } }).response;
  const data = response?.data;
  if (typeof data === "string") return data;
  if (Buffer.isBuffer(data)) return data.toString("latin1");
  if (data == null) return undefined;

  try {
    return JSON.stringify(data);
  } catch {
    return String(data);
  }
}

function buildLegacyUploadMultipart(
  envioDteXml: string,
  options: LegacySendOptions
): { boundary: string; body: Buffer } {
  const boundary = `---------------------------${randomBytes(12).toString("hex")}`;
  const textPart = (name: string, value: string): Buffer =>
    Buffer.from(
      `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="${name}"\r\n` +
        "Content-Type: text/plain; charset=US-ASCII\r\n" +
        "Content-Transfer-Encoding: 8Bit\r\n" +
        "\r\n" +
        `${value}\r\n`,
      "ascii"
    );
  const fileHeader = Buffer.from(
    `--${boundary}\r\n` +
      'Content-Disposition: form-data; name="archivo"; filename="EnvioDTE.xml"\r\n' +
      "Content-Type: application/octet-stream\r\n" +
      "Content-Transfer-Encoding: binary\r\n" +
      "\r\n",
    "ascii"
  );
  const fileFooter = Buffer.from(`\r\n--${boundary}--\r\n`, "ascii");

  return {
    boundary,
    body: Buffer.concat([
      textPart("rutSender", options.rutSender),
      textPart("dvSender", options.dvSender),
      textPart("rutCompany", options.rutCompany),
      textPart("dvCompany", options.dvCompany),
      fileHeader,
      Buffer.from(envioDteXml, "latin1"),
      fileFooter,
    ]),
  };
}

function parseSendResponse(rawResponse: string): SendResult {
  let parsed: Record<string, unknown>;
  try {
    parsed = xmlParser.parse(rawResponse) as Record<string, unknown>;
  } catch {
    throw new SiiSendError("SEND_FAILED", "No se pudo parsear la respuesta del SII al enviar", {
      rawResponse,
    });
  }

  const recepcion = parsed?.["RECEPCIONDTE"] as
    | Record<string, unknown>
    | undefined;
  if (recepcion) {
    const estado = String(recepcion["STATUS"] ?? "");
    const trackId = String(
      recepcion["TRACKID"] ?? recepcion["TRACK_ID"] ?? ""
    );

    if (estado !== "0" || !trackId) {
      throw new SiiSendError(
        "SEND_FAILED",
        `El SII rechazo el upload DTE con STATUS ${estado || "desconocido"}`,
        { rawResponse }
      );
    }

    return {
      trackId,
      status: "SOK",
      rawResponse,
    };
  }

  const respuesta = parsed?.["RESPUESTA"] as Record<string, unknown> | undefined;
  const resp = respuesta?.["RESP_HDR"] as Record<string, unknown> | undefined;

  if (!resp) {
    throw new SiiSendError("SEND_FAILED", "Respuesta inesperada del SII al enviar DTE", {
      rawResponse,
    });
  }

  const estado = String(resp["ESTADO"] ?? "");
  const trackId = String(resp["TRACKID"] ?? resp["TRACK_ID"] ?? "");

  if (estado === "RSC") {
    throw new SiiSendError("SEND_SCHEMA_REJECTED", "El sobre fue rechazado por el SII (error de schema)", {
      rawResponse,
    });
  }

  if (estado === "RCT") {
    throw new SiiSendError("SEND_CONTENT_REJECTED", "El sobre fue rechazado por el SII (error de contenido)", {
      rawResponse,
    });
  }

  return {
    trackId,
    status: parseSendStatus(estado),
    rawResponse,
  };
}

export interface StatusQueryOptions {
  rutEmpresa: string;
  dvEmpresa: string;
  trackId: string;
  token: string;
  environment: SiiEnvironment;
}

export async function querySendStatus(
  options: StatusQueryOptions
): Promise<StatusQueryResult> {
  const url = STATUS_ENDPOINTS[options.environment];
  const soapBody = buildSoapEnvelope("getEstUp", {
    RutCompania: options.rutEmpresa,
    DvCompania: options.dvEmpresa,
    TrackId: options.trackId,
    Token: options.token,
  });

  let responseData: string;
  try {
    const res = await axios.post(url, soapBody, {
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        SOAPAction: "",
      },
      timeout: 30000,
    });
    responseData = res.data as string;
  } catch (err) {
    throw new SiiError("QUERY_FAILED", "Error de red al consultar estado de envío", {
      cause: err as Error,
    });
  }

  return parseStatusResponse(options.trackId, responseData);
}

function parseStatusResponse(trackId: string, rawResponse: string): StatusQueryResult {
  const payload = extractSoapReturn(rawResponse, "getEstUpReturn");
  let parsed: Record<string, unknown>;
  try {
    parsed = xmlParser.parse(payload) as Record<string, unknown>;
  } catch {
    throw new SiiError("QUERY_FAILED", "No se pudo parsear la respuesta de estado del SII", {
      rawResponse,
    });
  }

  const respuesta =
    findRecordByLocalName(parsed, "RESPUESTA") ??
    findRecordByLocalName(parsed, "RESULTADO_ENVIO");
  const caratula = respuesta
    ? findRecordByLocalName(respuesta, "RESP_HDR")
    : undefined;
  const estadisticas = respuesta
    ? findRecordByLocalName(respuesta, "RESP_BODY")
    : undefined;

  if (!caratula) {
    throw new SiiError("QUERY_FAILED", "Respuesta de estado del SII sin RESP_HDR", {
      rawResponse,
    });
  }

  const estado = readXmlString(caratula, "ESTADO");
  const responseTrackId = readXmlString(caratula, "TRACKID") || trackId;

  return {
    trackId: responseTrackId,
    status: parseSendStatus(estado),
    detail:
      readXmlString(caratula, "GLOSA") ||
      readXmlString(caratula, "DETAIL"),
    estadisticas: estadisticas
      ? {
          aceptados: Number(readXmlString(estadisticas, "ACEPTADOS") || 0),
          rechazados: Number(readXmlString(estadisticas, "RECHAZADOS") || 0),
          reparos: Number(readXmlString(estadisticas, "REPAROS") || 0),
        }
      : undefined,
    rawResponse,
  };
}

export interface DteStatusQueryOptions {
  rutConsultante?: string;
  dvConsultante?: string;
  rutEmisor: string;
  dvEmisor: string;
  tipoDTE: number;
  folio: number;
  fechaEmision: string;
  montoTotal: number;
  rutReceptor: string;
  dvReceptor: string;
  token: string;
  environment: SiiEnvironment;
}

export async function queryDteStatus(
  options: DteStatusQueryOptions
): Promise<DteStatusQueryResult> {
  const url = DTE_STATUS_ENDPOINTS[options.environment];
  const soapBody = buildSoapEnvelope("getEstDte", {
    RutConsultante: options.rutConsultante ?? options.rutEmisor,
    DvConsultante: options.dvConsultante ?? options.dvEmisor,
    RutCompania: options.rutEmisor,
    DvCompania: options.dvEmisor,
    RutReceptor: options.rutReceptor,
    DvReceptor: options.dvReceptor,
    TipoDte: options.tipoDTE,
    FolioDte: options.folio,
    FechaEmisionDte: toSiiQueryDate(options.fechaEmision),
    MontoDte: options.montoTotal,
    Token: options.token,
  });

  let responseData: string;
  try {
    const res = await axios.post(url, soapBody, {
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        SOAPAction: "",
      },
      timeout: 30000,
    });
    responseData = res.data as string;
  } catch (err) {
    throw new SiiError("QUERY_FAILED", "Error de red al consultar estado del DTE", {
      cause: err as Error,
    });
  }

  return parseDteStatusResponse(options.tipoDTE, options.folio, options.rutEmisor, responseData);
}

function parseDteStatusResponse(
  tipoDTE: number,
  folio: number,
  rutEmisor: string,
  rawResponse: string
): DteStatusQueryResult {
  const payload = extractSoapReturn(rawResponse, "getEstDteReturn");
  let parsed: Record<string, unknown>;
  try {
    parsed = xmlParser.parse(payload) as Record<string, unknown>;
  } catch {
    throw new SiiError("QUERY_FAILED", "No se pudo parsear la respuesta de estado del DTE", {
      rawResponse,
    });
  }

  const respuesta = findRecordByLocalName(parsed, "RESPUESTA");
  const header = respuesta
    ? findRecordByLocalName(respuesta, "RESP_HDR")
    : undefined;
  if (!header) {
    throw new SiiError("QUERY_FAILED", "Respuesta de estado DTE sin RESP_HDR", {
      rawResponse,
    });
  }

  const estadoRaw = readXmlString(header, "ESTADO") || "UNKNOWN";
  const glosa =
    readXmlString(header, "GLOSA_ESTADO") ||
    readXmlString(header, "GLOSA_ERR") ||
    readXmlString(header, "GLOSA");

  return {
    tipoDTE,
    folio,
    rutEmisor,
    status: parseDteStatus(estadoRaw),
    glosa,
    rawResponse,
  };
}

function buildSoapEnvelope(
  operation: string,
  params: Record<string, string | number>
): string {
  const values = Object.entries(params)
    .map(
      ([name, value]) =>
        `<${name} xsi:type="xsd:string">${escapeXml(value)}</${name}>`
    )
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:def="http://DefaultNamespace" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <soapenv:Body>
    <def:${operation} soapenv:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">${values}</def:${operation}>
  </soapenv:Body>
</soapenv:Envelope>`;
}

function escapeXml(value: string | number): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function extractSoapReturn(rawResponse: string, returnName: string): string {
  let parsed: unknown;
  try {
    parsed = xmlParser.parse(rawResponse);
  } catch {
    return rawResponse;
  }

  const value = findValueByLocalName(parsed, returnName);
  const text =
    typeof value === "string"
      ? value
      : isRecord(value) && typeof value["#text"] === "string"
        ? value["#text"]
        : "";
  return text.trim()
    ? decodeXmlEntities(text.trim())
    : rawResponse;
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16))
    )
    .replace(/&#(\d+);/g, (_, decimal: string) =>
      String.fromCodePoint(Number.parseInt(decimal, 10))
    )
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function findRecordByLocalName(
  value: unknown,
  localName: string
): Record<string, unknown> | undefined {
  const found = findValueByLocalName(value, localName);
  return isRecord(found) ? found : undefined;
}

function findValueByLocalName(
  value: unknown,
  localName: string
): unknown {
  if (!isRecord(value)) return undefined;

  for (const [key, child] of Object.entries(value)) {
    if (key.split(":").pop() === localName) return child;
  }

  for (const child of Object.values(value)) {
    const found = findValueByLocalName(child, localName);
    if (found !== undefined) return found;
  }

  return undefined;
}

function readXmlString(
  record: Record<string, unknown>,
  localName: string
): string {
  const value = findValueByLocalName(record, localName);
  return value === undefined || value === null ? "" : String(value).trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toSiiQueryDate(value: string): string {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : value;
}

export class LegacySiiClient {
  constructor(_options?: Record<string, unknown>) {}

  async send(
    envioDteXml: string,
    context: IssuerContext,
    token: string,
    rutSender?: string,
    dvSender?: string
  ): Promise<SendResult> {
    const [rutEmisor, dvEmisor] = context.rutEmisor.split("-");
    const [rutS, dvS] = rutSender
      ? rutSender.includes("-")
        ? rutSender.split("-")
        : [rutSender, dvSender]
      : [rutEmisor, dvEmisor];
    return sendDte(envioDteXml, {
      rutSender: rutS ?? rutEmisor,
      dvSender: dvS ?? dvEmisor,
      rutCompany: rutEmisor,
      dvCompany: dvEmisor,
      token,
      environment: context.environment,
    });
  }

  async queryStatus(trackId: string, context: IssuerContext, token: string): Promise<StatusQueryResult> {
    const [rutEmisor, dvEmisor] = context.rutEmisor.split("-");
    return querySendStatus({
      rutEmpresa: rutEmisor,
      dvEmpresa: dvEmisor,
      trackId,
      token,
      environment: context.environment,
    });
  }

  async queryDteStatus(
    opts: Omit<DteStatusQueryOptions, "environment" | "rutEmisor" | "dvEmisor">,
    context: IssuerContext,
    token: string
  ): Promise<DteStatusQueryResult> {
    const [rutEmisor, dvEmisor] = context.rutEmisor.split("-");
    return queryDteStatus({
      ...opts,
      rutEmisor: rutEmisor,
      dvEmisor: dvEmisor,
      token,
      environment: context.environment,
    });
  }
}
