import { describe, it, expect } from "vitest";
import { buildEnvioDteXml } from "../src/xml/envelope-builder.js";
import { TipoDTE, type DteFirmado } from "../src/types/dte.types.js";
import type { EnvioDTECaratula } from "../src/types/transport.types.js";

describe("envelope-builder", () => {
  it("should generate multiple SubTotDTE elements correctly", () => {
    const dtes: DteFirmado[] = [
      {
        document: { idDoc: { tipoDTE: TipoDTE.FacturaElectronica } } as any,
        signedXml: "<DTE>Factura 1</DTE>",
        tedXml: "",
      },
      {
        document: { idDoc: { tipoDTE: TipoDTE.FacturaElectronica } } as any,
        signedXml: "<DTE>Factura 2</DTE>",
        tedXml: "",
      },
      {
        document: { idDoc: { tipoDTE: TipoDTE.NotaCredito } } as any,
        signedXml: "<DTE>Nota 1</DTE>",
        tedXml: "",
      },
    ];

    const caratula: EnvioDTECaratula = {
      rutEmisor: "76212345-6",
      rutEnvia: "12345678-9",
      fechaResolucion: "2014-08-22",
      nroResolucion: 80,
      fechaFirmaEnvio: "2026-05-17T20:00:00",
    };

    const xml = buildEnvioDteXml(dtes, caratula);

    expect(xml).toContain("<SubTotDTE>\n<TpoDTE>33</TpoDTE>\n<NroDTE>2</NroDTE>\n</SubTotDTE>");
    expect(xml).toContain("<SubTotDTE>\n<TpoDTE>61</TpoDTE>\n<NroDTE>1</NroDTE>\n</SubTotDTE>");
    expect(xml).toContain("<DTE>Factura 1</DTE>");
    expect(xml).toContain("<DTE>Factura 2</DTE>");
    expect(xml).toContain("<DTE>Nota 1</DTE>");
  });
});
