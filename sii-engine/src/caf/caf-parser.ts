import { XMLParser } from "fast-xml-parser";
import type { CafData, CafDa, CafMaterial } from "../types/caf.types.js";
import { TipoDTE } from "../types/dte.types.js";
import { SiiCafError } from "../errors/sii-errors.js";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseAttributeValue: false,
  trimValues: true,
});

export function parseCaf(cafXml: string): CafMaterial {
  let parsed: Record<string, unknown>;
  try {
    parsed = parser.parse(cafXml) as Record<string, unknown>;
  } catch (err) {
    throw new SiiCafError("CAF_PARSE_ERROR", "Error al parsear el XML del CAF", {
      cause: err as Error,
    });
  }

  const autorizacion = parsed["AUTORIZACION"] as Record<string, unknown> | undefined;
  if (!autorizacion) {
    throw new SiiCafError("CAF_PARSE_ERROR", "El XML del CAF no contiene el elemento AUTORIZACION");
  }

  const caf = autorizacion["CAF"] as Record<string, unknown> | undefined;
  if (!caf) {
    throw new SiiCafError("CAF_PARSE_ERROR", "El XML del CAF no contiene el elemento CAF");
  }

  const da = caf["DA"] as Record<string, unknown> | undefined;
  if (!da) {
    throw new SiiCafError("CAF_PARSE_ERROR", "El XML del CAF no contiene el elemento DA");
  }

  const rng = da["RNG"] as Record<string, unknown> | undefined;
  if (!rng) {
    throw new SiiCafError("CAF_PARSE_ERROR", "El XML del CAF no contiene el elemento RNG");
  }

  const rsapk = da["RSAPK"] as Record<string, unknown> | undefined;
  if (!rsapk) {
    throw new SiiCafError("CAF_PARSE_ERROR", "El XML del CAF no contiene el elemento RSAPK");
  }

  const tipoDTERaw = Number(da["TD"]);
  if (!Object.values(TipoDTE).includes(tipoDTERaw as TipoDTE)) {
    throw new SiiCafError(
      "CAF_WRONG_TYPE",
      `TipoDTE ${tipoDTERaw} no está en el alcance soportado (33, 34, 39, 41, 46, 52, 56, 61)`
    );
  }

  const cafDa: CafDa = {
    rutEmisor: String(da["RE"] ?? ""),
    razonSocial: String(da["RS"] ?? ""),
    tipoDTE: tipoDTERaw as TipoDTE,
    rangeStart: Number(rng["D"] ?? 0),
    rangeEnd: Number(rng["H"] ?? 0),
    fechaAutorizacion: String(da["FA"] ?? ""),
    rsaPk: {
      modulus: String(rsapk["M"] ?? ""),
      exponent: String(rsapk["E"] ?? ""),
    },
    idk: String(da["IDK"] ?? ""),
  };

  if (cafDa.rangeStart <= 0 || cafDa.rangeEnd <= 0 || cafDa.rangeStart > cafDa.rangeEnd) {
    throw new SiiCafError(
      "CAF_INVALID_RANGE",
      `Rango de folios inválido: ${cafDa.rangeStart} - ${cafDa.rangeEnd}`
    );
  }

  const frma = String(caf["FRMA"] ?? "");
  const rsask = String(autorizacion["RSASK"] ?? "");
  const rsapubk = String(autorizacion["RSAPUBK"] ?? "");

  if (!rsask) {
    throw new SiiCafError("CAF_PARSE_ERROR", "El CAF no contiene la clave privada RSASK");
  }

  return {
    da: cafDa,
    frma,
    rsask,
    rsapubk,
    rawXml: cafXml,
  };
}

export function extractCafXmlSection(cafData: CafMaterial): string {
  const startIndex = cafData.rawXml.indexOf("<CAF");
  const endIndex = cafData.rawXml.indexOf("</CAF>") + "</CAF>".length;
  if (startIndex === -1 || endIndex === -1) {
    throw new SiiCafError("CAF_PARSE_ERROR", "No se pudo extraer la sección CAF del XML");
  }
  return cafData.rawXml.substring(startIndex, endIndex);
}

export function isCafExpired(cafData: CafData): boolean {
  const authDate = new Date(cafData.da.fechaAutorizacion);
  const sixMonthsLater = new Date(authDate);
  sixMonthsLater.setMonth(sixMonthsLater.getMonth() + 6);
  return new Date() > sixMonthsLater;
}

export function isCafExpiringSoon(cafData: CafData, daysThreshold: number = 7): boolean {
  const authDate = new Date(cafData.da.fechaAutorizacion);
  const sixMonthsLater = new Date(authDate);
  sixMonthsLater.setMonth(sixMonthsLater.getMonth() + 6);
  const thresholdDate = new Date();
  thresholdDate.setDate(thresholdDate.getDate() + daysThreshold);
  return thresholdDate > sixMonthsLater && !isCafExpired(cafData);
}
