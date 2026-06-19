import type { DteDocument } from "../types/dte.types.js";
import type { CafMaterial } from "../types/caf.types.js";
import { TipoDTE } from "../types/dte.types.js";
import { extractCafXmlSection } from "../caf/caf-parser.js";

function esc(value: unknown): string {
  if (value === undefined || value === null) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatIso8601Local(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

function getReceptorRut(doc: DteDocument): string {
  if (doc.idDoc.tipoDTE === TipoDTE.BoletaElectronica) {
    return doc.receptor.rutRecep || "66666666-6";
  }
  return doc.receptor.rutRecep;
}

function getReceptorRazonSocial(doc: DteDocument): string {
  if (doc.idDoc.tipoDTE === TipoDTE.BoletaElectronica) {
    return doc.receptor.rznSocRecep || "SIN INFORMACION";
  }
  return doc.receptor.rznSocRecep;
}

function getPrimerItem(doc: DteDocument): string {
  const firstDetail = doc.detalles[0];
  if (!firstDetail) return "";
  const name = firstDetail.nmbItem;
  return name.length > 40 ? name.substring(0, 40) : name;
}

export function buildDdXml(
  doc: DteDocument,
  caf: CafMaterial,
  timestamp?: string
): string {
  const cafXmlSection = extractCafXmlSection(caf);
  const tsted = timestamp ?? formatIso8601Local();

  return `<DD>
<RE>${esc(doc.emisor.rutEmisor)}</RE>
<TD>${doc.idDoc.tipoDTE}</TD>
<F>${doc.idDoc.folio}</F>
<FE>${esc(doc.idDoc.fechaEmision)}</FE>
<RR>${esc(getReceptorRut(doc))}</RR>
<RSR>${esc(getReceptorRazonSocial(doc))}</RSR>
<MNT>${doc.totales.mntTotal}</MNT>
<IT1>${esc(getPrimerItem(doc))}</IT1>
${cafXmlSection}
<TSTED>${tsted}</TSTED>
</DD>`;
}

export function buildTedXml(doc: DteDocument, caf: CafMaterial, frma: string, timestamp?: string): string {
  const ddXml = buildDdXml(doc, caf, timestamp);
  return `<TED version="1.0">
${ddXml}
<FRMT algoritmo="SHA1withRSA">${frma}</FRMT>
</TED>`;
}
