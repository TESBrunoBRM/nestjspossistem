import type { EnvioDTECaratula } from "../types/transport.types.js";
import type { DteFirmado } from "../types/dte.types.js";
import type { CertificateMaterial } from "../types/signing.types.js";

function esc(value: unknown): string {
  if (value === undefined || value === null) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function buildSubTotDTE(dtes: DteFirmado[]): string {
  const counts = new Map<number, number>();
  for (const dte of dtes) {
    const tpo = dte.document.idDoc.tipoDTE;
    counts.set(tpo, (counts.get(tpo) ?? 0) + 1);
  }

  let xml = "";
  for (const [tpo, nro] of counts.entries()) {
    xml += `<SubTotDTE>
<TpoDTE>${tpo}</TpoDTE>
<NroDTE>${nro}</NroDTE>
</SubTotDTE>\n`;
  }
  return xml.trim();
}

function toEmbeddedDteXml(signedXml: string): string {
  const dteStart = signedXml.indexOf("<DTE");
  return dteStart === -1 ? signedXml : signedXml.substring(dteStart);
}

function buildCaratulaEnvioDte(caratula: EnvioDTECaratula, dtes: DteFirmado[]): string {
  return `<Caratula version="1.0">
<RutEmisor>${esc(caratula.rutEmisor)}</RutEmisor>
<RutEnvia>${esc(caratula.rutEnvia)}</RutEnvia>
<RutReceptor>60803000-K</RutReceptor>
<FchResol>${esc(caratula.fechaResolucion)}</FchResol>
<NroResol>${caratula.nroResolucion}</NroResol>
<TmstFirmaEnv>${esc(caratula.fechaFirmaEnvio)}</TmstFirmaEnv>
${buildSubTotDTE(dtes)}
</Caratula>`;
}

function buildCaratulaEnvioBoleta(caratula: EnvioDTECaratula, dtes: DteFirmado[]): string {
  return `<Caratula>
<RutEmisor>${esc(caratula.rutEmisor)}</RutEmisor>
<RutEnvia>${esc(caratula.rutEnvia)}</RutEnvia>
<RutReceptor>60803000-K</RutReceptor>
<FchResol>${esc(caratula.fechaResolucion)}</FchResol>
<NroResol>${caratula.nroResolucion}</NroResol>
<TmstFirmaEnv>${esc(caratula.fechaFirmaEnvio)}</TmstFirmaEnv>
${buildSubTotDTE(dtes)}
</Caratula>`;
}

export function buildEnvioDteXml(
  dtes: DteFirmado[],
  caratula: EnvioDTECaratula
): string {
  const dtesXml = dtes
    .map((dte) => toEmbeddedDteXml(dte.signedXml))
    .join("\n");

  return `<?xml version="1.0" encoding="ISO-8859-1"?>
<EnvioDTE xmlns="http://www.sii.cl/SiiDte"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.sii.cl/SiiDte EnvioDTE_v10.xsd"
  version="1.0">
${buildCaratulaEnvioDte(caratula, dtes)}
${dtesXml}
</EnvioDTE>`;
}

export function buildEnvioBoletaXml(
  dtes: DteFirmado[],
  caratula: EnvioDTECaratula
): string {
  const dtesXml = dtes
    .map((dte) => toEmbeddedDteXml(dte.signedXml))
    .join("\n");

  return `<?xml version="1.0" encoding="ISO-8859-1"?>
<EnvioBOLETA xmlns="http://www.sii.cl/SiiDte"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.sii.cl/SiiDte EnvioBOLETA_v11.xsd"
  version="1.0">
${buildCaratulaEnvioBoleta(caratula, dtes)}
${dtesXml}
</EnvioBOLETA>`;
}

export function buildResumenVentasDiariasXml(
  rutEmisor: string,
  rutEnvia: string,
  fecha: string,
  nroResolucion: number,
  fechaResolucion: string,
  secEnvio: number,
  totales: RvdTotales[]
): string {
  const totalesXml = totales
    .map(
      (t) => `<Totales>
<TpoDoc>${t.tipoDTE}</TpoDoc>
<NroDte>${t.cantidad}</NroDte>
<MntExento>${t.montoExento ?? 0}</MntExento>
<MntIVA>${t.montoIVA ?? 0}</MntIVA>
<MntTotal>${t.montoTotal}</MntTotal>
</Totales>`
    )
    .join("\n");

  return `<?xml version="1.0" encoding="ISO-8859-1"?>
<ConsumoFolios xmlns="http://www.sii.cl/SiiDte"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.sii.cl/SiiDte ConsumoFolio_v10.xsd"
  version="1.0">
<Caratula>
<RutEmisor>${esc(rutEmisor)}</RutEmisor>
<RutEnvia>${esc(rutEnvia)}</RutEnvia>
<FchResol>${esc(fechaResolucion)}</FchResol>
<NroResol>${nroResolucion}</NroResol>
<FchInicio>${fecha}</FchInicio>
<FchFinal>${fecha}</FchFinal>
<SecEnvio>${secEnvio}</SecEnvio>
<TmstFirmaEnv>${new Date().toISOString().replace(/\.\d{3}Z$/, "")}</TmstFirmaEnv>
</Caratula>
<Resumen>
${totalesXml}
</Resumen>
</ConsumoFolios>`;
}

export interface RvdTotales {
  tipoDTE: number;
  cantidad: number;
  montoTotal: number;
  montoExento?: number;
  montoIVA?: number;
}

export function buildRespuestaDteXml(
  rutEmisor: string,
  rutReceptor: string,
  nmvRecep: string,
  tipoDTE: number,
  folio: number,
  fechaEmision: string,
  montoTotal: number,
  estado: "ACD" | "RCD" | "ERM" | "ACS",
  glosa?: string
): string {
  return `<?xml version="1.0" encoding="ISO-8859-1"?>
<RespuestaDTE xmlns="http://www.sii.cl/SiiDte"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.sii.cl/SiiDte RespuestaEnvioDTE_v10.xsd"
  version="1.0">
<Resultado>
<Caratula>
<RutResponde>${esc(rutReceptor)}</RutResponde>
<RutRecibe>${esc(rutEmisor)}</RutRecibe>
<NmbContacto>${esc(nmvRecep)}</NmbContacto>
<TmstFirmaResp>${new Date().toISOString().replace(/\.\d{3}Z$/, "")}</TmstFirmaResp>
</Caratula>
<RecepcionDTE>
<TpoDTE>${tipoDTE}</TpoDTE>
<Folio>${folio}</Folio>
<FchEmis>${esc(fechaEmision)}</FchEmis>
<RUTEmisor>${esc(rutEmisor)}</RUTEmisor>
<RUTReceptor>${esc(rutReceptor)}</RUTReceptor>
<MntTotal>${montoTotal}</MntTotal>
<EstadoRecepDTE>${estado}</EstadoRecepDTE>
${glosa ? `<RecepDTEGlosa>${esc(glosa)}</RecepDTEGlosa>` : ""}
</RecepcionDTE>
</Resultado>
</RespuestaDTE>`;
}
