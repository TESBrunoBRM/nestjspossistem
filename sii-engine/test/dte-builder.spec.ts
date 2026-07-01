import { describe, expect, it } from "vitest";
import { TipoDTE, type DteDocument } from "../src/index.js";
import { buildDteXml } from "../src/xml/dte-builder.js";

describe("DTE XML builder", () => {
  it("serializes exempt totals with the SII MntExe tag", () => {
    const xml = buildDteXml(createFacturaExenta(), "<TED>mock</TED>");

    expect(xml).toContain("<MntExe>1000</MntExe>");
    expect(xml).not.toContain("<MntExento>");
    expect(xml).not.toContain("<IVA>");
  });

  it("omits zero PrcItem values for non-valued guia despacho lines", () => {
    const xml = buildDteXml(createGuiaDespachoSinValor(), "<TED>mock</TED>");

    expect(xml).toContain("<TipoDTE>52</TipoDTE>");
    expect(xml).toContain("<IndTraslado>5</IndTraslado>");
    expect(xml).toContain("<MontoItem>0</MontoItem>");
    expect(xml).not.toContain("<PrcItem>0</PrcItem>");
  });
});

function createFacturaExenta(): DteDocument {
  return {
    idDoc: {
      tipoDTE: TipoDTE.FacturaNoAfectaExentaElectronica,
      folio: 1,
      fechaEmision: "2026-07-01",
      formaPago: 1,
    },
    emisor: {
      rutEmisor: "78086484-2",
      rznSoc: "ZEAK STUDIOS SPA",
      giroEmis: "SERVICIOS INFORMATICOS",
      acteco: 620200,
      dirOrigen: "AV. PROVIDENCIA 123",
      cmnaOrigen: "PROVIDENCIA",
    },
    receptor: {
      rutRecep: "60803000-K",
      rznSocRecep: "SERVICIO DE IMPUESTOS INTERNOS",
      giroRecep: "ADMINISTRACION PUBLICA",
      dirRecep: "TEATINOS 120",
      cmnaRecep: "SANTIAGO",
    },
    detalles: [
      {
        nroLinDet: 1,
        indExe: 1,
        nmbItem: "Servicio exento",
        qtyItem: 1,
        prcItem: 1000,
        montoItem: 1000,
      },
    ],
    totales: {
      mntExento: 1000,
      mntTotal: 1000,
    },
  };
}

function createGuiaDespachoSinValor(): DteDocument {
  return {
    idDoc: {
      tipoDTE: TipoDTE.GuiaDespachoElectronica,
      folio: 1,
      fechaEmision: "2026-07-01",
      tipoDespacho: 1,
      indTraslado: 5,
    },
    emisor: {
      rutEmisor: "78086484-2",
      rznSoc: "ZEAK STUDIOS SPA",
      giroEmis: "SERVICIOS INFORMATICOS",
      acteco: 620200,
      dirOrigen: "AV. PROVIDENCIA 123",
      cmnaOrigen: "PROVIDENCIA",
    },
    receptor: {
      rutRecep: "60803000-K",
      rznSocRecep: "SERVICIO DE IMPUESTOS INTERNOS",
      giroRecep: "ADMINISTRACION PUBLICA",
      dirRecep: "TEATINOS 120",
      cmnaRecep: "SANTIAGO",
    },
    detalles: [
      {
        nroLinDet: 1,
        nmbItem: "Traslado sin venta",
        qtyItem: 1,
        prcItem: 0,
        montoItem: 0,
      },
    ],
    totales: {
      mntTotal: 0,
    },
  };
}
