import type { DteDocument } from "../types/dte.types.js";
import { TipoDTE } from "../types/dte.types.js";
import type { IssuerContext } from "../types/context.types.js";
import type { CafData } from "../types/caf.types.js";
import { SiiError } from "../errors/sii-errors.js";

function esc(value: unknown): string {
  if (value === undefined || value === null) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function opt(tag: string, value: unknown): string {
  if (value === undefined || value === null || value === "") return "";
  return `<${tag}>${esc(value)}</${tag}>`;
}

function optNonZero(tag: string, value: unknown): string {
  if (Number(value) === 0) return "";
  return opt(tag, value);
}

function buildIdDoc(doc: DteDocument): string {
  const { idDoc } = doc;
  return `<IdDoc>
<TipoDTE>${idDoc.tipoDTE}</TipoDTE>
<Folio>${idDoc.folio}</Folio>
<FchEmis>${idDoc.fechaEmision}</FchEmis>
${opt("IndMntNeto", idDoc.indMntNeto)}
${opt("TipoDespacho", idDoc.tipoDespacho)}
${opt("IndTraslado", idDoc.indTraslado)}
${opt("FmaPago", idDoc.formaPago)}
${opt("FchVenc", idDoc.fechaVencimiento)}
${opt("MedioPago", idDoc.medioPago)}
${opt("TermPagoCdg", idDoc.termPagoCdg)}
${opt("TermPagoDias", idDoc.termPagoDias)}
${opt("TermPagoGlosa", idDoc.termPagoGlosa)}
</IdDoc>`
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function buildEmisor(doc: DteDocument): string {
  const { emisor } = doc;
  return `<Emisor>
<RUTEmisor>${esc(emisor.rutEmisor)}</RUTEmisor>
<RznSoc>${esc(emisor.rznSoc)}</RznSoc>
<GiroEmis>${esc(emisor.giroEmis)}</GiroEmis>
${opt("Telefono", emisor.telefono)}
${opt("CorreoEmisor", emisor.correoEmisor)}
<Acteco>${emisor.acteco}</Acteco>
${opt("CdgSIISucur", emisor.cdgSIISucur)}
<DirOrigen>${esc(emisor.dirOrigen)}</DirOrigen>
<CmnaOrigen>${esc(emisor.cmnaOrigen)}</CmnaOrigen>
${opt("CiudadOrigen", emisor.ciudadOrigen)}
</Emisor>`
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function buildReceptor(doc: DteDocument): string {
  const { receptor, idDoc } = doc;
  const isBoleta = idDoc.tipoDTE === TipoDTE.BoletaElectronica;

  if (isBoleta && !receptor.rutRecep) {
    return `<Receptor>
<RUTRecep>66666666-6</RUTRecep>
<RznSocRecep>SIN INFORMACION</RznSocRecep>
</Receptor>`;
  }

  return `<Receptor>
<RUTRecep>${esc(receptor.rutRecep)}</RUTRecep>
${opt("CdgIntRecep", undefined)}
<RznSocRecep>${esc(receptor.rznSocRecep)}</RznSocRecep>
${receptor.extranjero ? "<Extranjero>1</Extranjero>" : ""}
${opt("GiroRecep", receptor.giroRecep)}
${opt("Contacto", receptor.contacto)}
${opt("CorreoRecep", receptor.correoRecep)}
${opt("DirRecep", receptor.dirRecep)}
${opt("CmnaRecep", receptor.cmnaRecep)}
${opt("CiudadRecep", receptor.ciudadRecep)}
</Receptor>`
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function buildTotales(doc: DteDocument): string {
  const { totales } = doc;
  return `<Totales>
${opt("MntNeto", totales.mntNeto)}
${opt("MntExe", totales.mntExento)}
${opt("TasaIVA", totales.tasaIVA)}
${opt("IVA", totales.iva)}
${opt("IVANoRet", totales.ivaNoRet)}
${opt("IVAUsoComun", totales.ivaUsoComun)}
${opt("MntBruto", totales.mntBruto)}
<MntTotal>${totales.mntTotal}</MntTotal>
${opt("MntPagos", totales.mntPagos)}
</Totales>`
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function buildDetalle(detalle: DteDocument["detalles"][number]): string {
  return `<Detalle>
<NroLinDet>${detalle.nroLinDet}</NroLinDet>
${opt("TpoCodigo", detalle.tipoCodigo)}
${opt("VlrCodigo", detalle.codItem)}
${opt("IndExe", detalle.indExe)}
<NmbItem>${esc(detalle.nmbItem)}</NmbItem>
${opt("DscItem", detalle.dscItem)}
${opt("QtyItem", detalle.qtyItem)}
${opt("UnmdItem", detalle.unmdItem)}
${optNonZero("PrcItem", detalle.prcItem)}
${opt("DescuentoPct", detalle.descuentoPct)}
${opt("DescuentoMnt", detalle.descuentoMnt)}
${opt("RecargoPct", detalle.recargoPct)}
${opt("RecargoMnt", detalle.recargoMnt)}
<MontoItem>${detalle.montoItem}</MontoItem>
</Detalle>`
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function buildDscRcgGlobal(
  item: NonNullable<DteDocument["dscRcgGlobal"]>[number]
): string {
  return `<DscRcgGlobal>
<NroLinDR>${item.nroLinDR}</NroLinDR>
<TipoMov>${item.tipoMov}</TipoMov>
<GlosaDR>${esc(item.glosaDR)}</GlosaDR>
<TpoDR>${item.TpoDR}</TpoDR>
<ValDR>${item.ValDR}</ValDR>
</DscRcgGlobal>`;
}

function buildReferencia(
  ref: NonNullable<DteDocument["referencias"]>[number]
): string {
  return `<Referencia>
<NroLinRef>${ref.nroLinRef}</NroLinRef>
${opt("TpoDTERef", ref.tipoDTERef)}
${ref.indGlobal ? "<IndGlobal>1</IndGlobal>" : ""}
${opt("FolioRef", ref.folioRef)}
${opt("RUTOtr", ref.rutOtro)}
${opt("FchRef", ref.fechaRef)}
${opt("CodRef", ref.codRef)}
${opt("RazonRef", ref.razonRef)}
</Referencia>`
    .replace(/\n{2,}/g, "\n")
    .trim();
}

export function buildDocumentId(doc: DteDocument): string {
  return `F${doc.idDoc.folio}T${doc.idDoc.tipoDTE}`;
}

export function buildEncabezado(doc: DteDocument): string {
  return `<Encabezado>
${buildIdDoc(doc)}
${buildEmisor(doc)}
${buildReceptor(doc)}
${buildTotales(doc)}
</Encabezado>`;
}

export function buildDteInnerXml(doc: DteDocument, tedXml: string): string {
  const docId = buildDocumentId(doc);

  const detalles = doc.detalles.map(buildDetalle).join("\n");
  const descuentos = doc.dscRcgGlobal?.map(buildDscRcgGlobal).join("\n") ?? "";
  const referencias = doc.referencias?.map(buildReferencia).join("\n") ?? "";

  return `<Documento ID="${docId}">
${buildEncabezado(doc)}
${detalles}
${descuentos}
${referencias}
${tedXml}
</Documento>`;
}

export function buildDteXml(doc: DteDocument, tedXml: string): string {
  const inner = buildDteInnerXml(doc, tedXml);
  return `<?xml version="1.0" encoding="ISO-8859-1"?>
<DTE xmlns="http://www.sii.cl/SiiDte" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" version="1.0">
${inner}
</DTE>`;
}

export function validateDteDocument(doc: DteDocument, context?: IssuerContext, caf?: CafData): void {
  if (!doc.emisor.rutEmisor) {
    throw new SiiError("VALIDATION_ERROR", "RUT del emisor es requerido");
  }

  if (context && doc.emisor.rutEmisor !== context.rutEmisor) {
    throw new SiiError(
      "VALIDATION_ERROR",
      `El RUT del documento (${doc.emisor.rutEmisor}) no coincide con el RUT del contexto (${context.rutEmisor})`
    );
  }

  if (caf && doc.emisor.rutEmisor !== caf.da.rutEmisor) {
    throw new SiiError(
      "VALIDATION_ERROR",
      `El RUT del documento (${doc.emisor.rutEmisor}) no coincide con el RUT del CAF (${caf.da.rutEmisor})`
    );
  }

  if (caf && doc.idDoc.tipoDTE !== caf.da.tipoDTE) {
    throw new SiiError(
      "VALIDATION_ERROR",
      `El tipo DTE del documento (${doc.idDoc.tipoDTE}) no coincide con el tipo del CAF (${caf.da.tipoDTE})`
    );
  }

  if (doc.detalles.length === 0) {
    throw new SiiError("VALIDATION_ERROR", "El DTE debe tener al menos un ítem de detalle");
  }
  if (doc.totales.mntTotal === undefined || doc.totales.mntTotal === null) {
    throw new SiiError("VALIDATION_ERROR", "El monto total es requerido");
  }

  if (
    doc.idDoc.tipoDTE === TipoDTE.FacturaNoAfectaExentaElectronica &&
    (doc.totales.iva ?? 0) > 0
  ) {
    throw new SiiError(
      "VALIDATION_ERROR",
      "La factura exenta DTE 34 no debe informar IVA mayor a cero"
    );
  }

  if (
    doc.idDoc.tipoDTE === TipoDTE.GuiaDespachoElectronica &&
    !doc.idDoc.indTraslado
  ) {
    throw new SiiError(
      "VALIDATION_ERROR",
      "La guia de despacho DTE 52 requiere IndTraslado"
    );
  }
  const isBoleta = doc.idDoc.tipoDTE === TipoDTE.BoletaElectronica;
  const isNotaOrFactura = !isBoleta;

  if (isNotaOrFactura && !doc.receptor.rutRecep) {
    throw new SiiError(
      "VALIDATION_ERROR",
      `El tipo DTE ${doc.idDoc.tipoDTE} requiere identificación del receptor`
    );
  }

  const needsRef =
    doc.idDoc.tipoDTE === TipoDTE.NotaCredito ||
    doc.idDoc.tipoDTE === TipoDTE.NotaDebito;

  if (needsRef && (!doc.referencias || doc.referencias.length === 0)) {
    throw new SiiError(
      "VALIDATION_ERROR",
      "Las Notas de Crédito y Débito deben referenciar el DTE origen"
    );
  }
}
