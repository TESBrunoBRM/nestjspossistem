import axios from "axios";
import { XMLParser } from "fast-xml-parser";
import type { SendResult, StatusQueryResult } from "../types/transport.types.js";
import { SiiEnvironment } from "../types/transport.types.js";
import type { IssuerContext } from "../types/context.types.js";
import { SiiSendError, SiiError } from "../errors/sii-errors.js";
import { parseSendStatus } from "../states/index.js";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const FormDataLib = require("form-data") as typeof import("form-data");

const BOLETA_ENDPOINTS: Record<SiiEnvironment, string> = {
  [SiiEnvironment.Certificacion]: "https://maullin.sii.cl/cgi_dte/UPL/DTEUpload",
  [SiiEnvironment.Produccion]: "https://palena.sii.cl/cgi_dte/UPL/DTEUpload",
};

const BOLETA_STATUS_ENDPOINTS: Record<SiiEnvironment, string> = {
  [SiiEnvironment.Certificacion]: "https://maullin.sii.cl/cgi_dte/UPL/EDTEDeck.php",
  [SiiEnvironment.Produccion]: "https://palena.sii.cl/cgi_dte/UPL/EDTEDeck.php",
};

const RVD_ENDPOINTS: Record<SiiEnvironment, string> = {
  [SiiEnvironment.Certificacion]: "https://maullin.sii.cl/cgi_dte/UPL/DTEUpload",
  [SiiEnvironment.Produccion]: "https://palena.sii.cl/cgi_dte/UPL/DTEUpload",
};

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  trimValues: true,
});

export interface BoletaSendOptions {
  rutSender: string;
  dvSender: string;
  rutCompany: string;
  dvCompany: string;
  token: string;
  environment: SiiEnvironment;
}

export async function sendBoleta(
  envioBoleta: string,
  options: BoletaSendOptions
): Promise<SendResult> {
  const url = BOLETA_ENDPOINTS[options.environment];

  const form = new FormDataLib();
  form.append("rutSender", options.rutSender);
  form.append("dvSender", options.dvSender);
  form.append("rutCompany", options.rutCompany);
  form.append("dvCompany", options.dvCompany);
  form.append("archivo", Buffer.from(envioBoleta, "utf-8"), {
    filename: "EnvioBOLETA.xml",
    contentType: "text/xml",
  });

  let responseData: string;
  try {
    const res = await axios.post(url, form, {
      headers: {
        ...form.getHeaders(),
        Cookie: `TOKEN=${options.token}`,
      },
      timeout: 60000,
    });
    responseData = res.data as string;
  } catch (err) {
    throw new SiiSendError("SEND_FAILED", "Error de red al enviar la boleta al SII", {
      cause: err as Error,
    });
  }

  return parseBoletaResponse(responseData);
}

function parseBoletaResponse(rawResponse: string): SendResult {
  let parsed: Record<string, unknown>;
  try {
    parsed = xmlParser.parse(rawResponse) as Record<string, unknown>;
  } catch {
    throw new SiiSendError("SEND_FAILED", "No se pudo parsear la respuesta del SII al enviar boleta", {
      rawResponse,
    });
  }

  const respuesta = parsed?.["RESPUESTA"] as Record<string, unknown> | undefined;
  const resp = respuesta?.["RESP_HDR"] as Record<string, unknown> | undefined;

  if (!resp) {
    throw new SiiSendError("SEND_FAILED", "Respuesta inesperada del SII al enviar boleta", {
      rawResponse,
    });
  }

  const estado = String(resp["ESTADO"] ?? "");
  const trackId = String(resp["TRACKID"] ?? resp["TRACK_ID"] ?? "");

  return {
    trackId,
    status: parseSendStatus(estado),
    rawResponse,
  };
}

export interface BoletaStatusOptions {
  rutEmpresa: string;
  dvEmpresa: string;
  trackId: string;
  token: string;
  environment: SiiEnvironment;
}

export async function queryBoletaStatus(
  options: BoletaStatusOptions
): Promise<StatusQueryResult> {
  const url = BOLETA_STATUS_ENDPOINTS[options.environment];

  let responseData: string;
  try {
    const res = await axios.get(url, {
      params: {
        rutEmpresa: options.rutEmpresa,
        dvEmpresa: options.dvEmpresa,
        TrackId: options.trackId,
      },
      headers: {
        Cookie: `TOKEN=${options.token}`,
      },
      timeout: 30000,
    });
    responseData = res.data as string;
  } catch (err) {
    throw new SiiError("QUERY_FAILED", "Error de red al consultar estado de boleta", {
      cause: err as Error,
    });
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = xmlParser.parse(responseData) as Record<string, unknown>;
  } catch {
    throw new SiiError("QUERY_FAILED", "No se pudo parsear la respuesta de estado de boleta", {
      rawResponse: responseData,
    });
  }

  const respuesta = parsed?.["RESULTADO_ENVIO"] as Record<string, unknown> | undefined;
  const caratula = respuesta?.["RESP_HDR"] as Record<string, unknown> | undefined;
  const cuerpo = respuesta?.["RESP_BODY"] as Record<string, unknown> | undefined;
  const estado = String(caratula?.["ESTADO"] ?? "");

  return {
    trackId: options.trackId,
    status: parseSendStatus(estado),
    detail: String(caratula?.["DETAIL"] ?? ""),
    estadisticas: cuerpo
      ? {
          aceptados: Number(cuerpo["ACEPTADOS"] ?? 0),
          rechazados: Number(cuerpo["RECHAZADOS"] ?? 0),
          reparos: Number(cuerpo["REPAROS"] ?? 0),
        }
      : undefined,
    rawResponse: responseData,
  };
}

export interface RvdSendOptions {
  rutSender: string;
  dvSender: string;
  rutCompany: string;
  dvCompany: string;
  token: string;
  environment: SiiEnvironment;
}

export async function sendResumenVentasDiarias(
  rvdXml: string,
  options: RvdSendOptions
): Promise<SendResult> {
  const url = RVD_ENDPOINTS[options.environment];

  const form = new FormDataLib();
  form.append("rutSender", options.rutSender);
  form.append("dvSender", options.dvSender);
  form.append("rutCompany", options.rutCompany);
  form.append("dvCompany", options.dvCompany);
  form.append("archivo", Buffer.from(rvdXml, "utf-8"), {
    filename: "ConsumoFolios.xml",
    contentType: "text/xml",
  });

  let responseData: string;
  try {
    const res = await axios.post(url, form, {
      headers: {
        ...form.getHeaders(),
        Cookie: `TOKEN=${options.token}`,
      },
      timeout: 60000,
    });
    responseData = res.data as string;
  } catch (err) {
    throw new SiiSendError(
      "SEND_FAILED",
      "Error de red al enviar el Resumen de Ventas Diarias al SII",
      { cause: err as Error }
    );
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = xmlParser.parse(responseData) as Record<string, unknown>;
  } catch {
    throw new SiiSendError("SEND_FAILED", "No se pudo parsear la respuesta del SII al enviar RVD", {
      rawResponse: responseData,
    });
  }

  const respuesta = parsed?.["RESPUESTA"] as Record<string, unknown> | undefined;
  const resp = respuesta?.["RESP_HDR"] as Record<string, unknown> | undefined;
  const estado = String(resp?.["ESTADO"] ?? "");
  const trackId = String(resp?.["TRACKID"] ?? resp?.["TRACK_ID"] ?? "");

  return {
    trackId,
    status: parseSendStatus(estado),
    rawResponse: responseData,
  };
}

export class BoletaSiiClient {
  constructor(_options?: Record<string, unknown>) {}

  async send(
    envioBoleta: string,
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
    return sendBoleta(envioBoleta, {
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
    return queryBoletaStatus({
      rutEmpresa: rutEmisor,
      dvEmpresa: dvEmisor,
      trackId,
      token,
      environment: context.environment,
    });
  }

  async sendRvd(rvdXml: string, context: IssuerContext, token: string): Promise<SendResult> {
    const [rutEmisor, dvEmisor] = context.rutEmisor.split("-");
    return sendResumenVentasDiarias(rvdXml, {
      rutSender: rutEmisor,
      dvSender: dvEmisor,
      rutCompany: rutEmisor,
      dvCompany: dvEmisor,
      token,
      environment: context.environment,
    });
  }
}
