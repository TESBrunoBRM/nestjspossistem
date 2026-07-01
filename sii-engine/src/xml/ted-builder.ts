import type { DteDocument } from "../types/dte.types.js";
import type { CafData, CafMaterial } from "../types/caf.types.js";
import { TipoDTE } from "../types/dte.types.js";

function escText(value: unknown): string {
  if (value === undefined || value === null) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\r/g, "&#xD;");
}

function escAttr(value: unknown): string {
  return escText(value)
    .replace(/"/g, "&quot;")
    .replace(/\n/g, "&#xA;")
    .replace(/\t/g, "&#x9;");
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
  caf: CafData,
  timestamp?: string
): string {
  const tsted = timestamp ?? formatIso8601Local();

  return `<DD><RE>${escText(doc.emisor.rutEmisor)}</RE>
<TD>${doc.idDoc.tipoDTE}</TD>
<F>${doc.idDoc.folio}</F>
<FE>${escText(doc.idDoc.fechaEmision)}</FE>
<RR>${escText(getReceptorRut(doc))}</RR>
<RSR>${escText(getReceptorRazonSocial(doc))}</RSR>
<MNT>${doc.totales.mntTotal}</MNT>
<IT1>${escText(getPrimerItem(doc))}</IT1>
${buildCafXmlSection(caf)}
<TSTED>${escText(tsted)}</TSTED></DD>`.replace(/\n/g, "");
}

export function buildCafXmlSection(caf: CafData): string {
  const da = caf.da;

  return `<CAF version="1.0"><DA><RE>${escText(da.rutEmisor)}</RE><RS>${escText(
    da.razonSocial
  )}</RS><TD>${da.tipoDTE}</TD><RNG><D>${da.rangeStart}</D><H>${da.rangeEnd}</H></RNG><FA>${escText(
    da.fechaAutorizacion
  )}</FA><RSAPK><M>${escText(da.rsaPk.modulus)}</M><E>${escText(
    da.rsaPk.exponent
  )}</E></RSAPK><IDK>${escText(da.idk)}</IDK></DA><FRMA algoritmo="${escAttr(
    "SHA1withRSA"
  )}">${escText(caf.frma)}</FRMA></CAF>`;
}

export function buildTedXml(doc: DteDocument, caf: CafMaterial, frma: string, timestamp?: string): string {
  const ddXml = buildDdXml(doc, caf, timestamp);
  return `<TED version="1.0">${ddXml}<FRMT algoritmo="SHA1withRSA">${escText(frma)}</FRMT></TED>`;
}
