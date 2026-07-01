import { describe, expect, it } from "vitest";
import forge from "node-forge";
import {
  TipoDTE,
  buildDdXml,
  buildTedXml,
  signTed,
  type CafMaterial,
  type DteDocument,
} from "../src/index.js";

describe("TED signing", () => {
  it("builds a compact DD and signs it with ISO-8859-1 bytes", () => {
    const { caf, publicKey } = createCaf("78086484-2", 21, 21, "CAFÉ ÑANDÚ SPA");
    const doc = createFactura({
      emisor: {
        rutEmisor: "78086484-2",
        rznSoc: "CAFÉ ÑANDÚ SPA",
        giroEmis: "SERVICIOS INFORMÁTICOS",
        acteco: 620200,
        dirOrigen: "Ñuñoa 123",
        cmnaOrigen: "ÑUÑOA",
      },
      receptor: {
        rutRecep: "60803000-K",
        rznSocRecep: "SERVICIO DE IMPUESTOS INTERNOS",
        giroRecep: "ADMINISTRACIÓN PÚBLICA",
        dirRecep: "Teatinos 120",
        cmnaRecep: "SANTIAGO",
      },
      detalles: [
        {
          nroLinDet: 1,
          nmbItem: "Café molido Ñuble",
          qtyItem: 1,
          prcItem: 1190,
          montoItem: 1190,
        },
      ],
    });
    const timestamp = "2026-06-25T19:58:00";

    const ddXml = buildDdXml(doc, caf, timestamp);
    const frmt = signTed(doc, caf, timestamp);
    const tedXml = buildTedXml(doc, caf, frmt, timestamp);

    expect(ddXml).not.toContain("\n");
    expect(tedXml).not.toContain("\n");
    expect(ddXml).toContain('<CAF version="1.0"><DA><RE>');
    expect(verifyFrmtWithLatin1(publicKey, ddXml, frmt)).toBe(true);
    expect(frmt).not.toBe(signTedUsingUtf8(ddXml, caf));
  });

  it("rejects TED content outside ISO-8859-1", () => {
    const { caf } = createCaf("78086484-2", 22, 22);
    const doc = createFactura({
      detalles: [
        {
          nroLinDet: 1,
          nmbItem: "Servicio 😄",
          qtyItem: 1,
          prcItem: 1190,
          montoItem: 1190,
        },
      ],
    });

    expect(() => signTed(doc, caf, "2026-06-25T19:58:00")).toThrow(
      /ISO-8859-1/
    );
  });
});

function createFactura(overrides?: Partial<DteDocument>): DteDocument {
  return {
    idDoc: {
      tipoDTE: TipoDTE.FacturaElectronica,
      folio: 21,
      fechaEmision: "2026-06-25",
      formaPago: 1,
      ...overrides?.idDoc,
    },
    emisor: {
      rutEmisor: "78086484-2",
      rznSoc: "PRUEBA CERTIFICACION SII",
      giroEmis: "SERVICIOS INFORMATICOS",
      acteco: 620200,
      dirOrigen: "AV. PROVIDENCIA 123",
      cmnaOrigen: "PROVIDENCIA",
      ...overrides?.emisor,
    },
    receptor: {
      rutRecep: "60803000-K",
      rznSocRecep: "SERVICIO DE IMPUESTOS INTERNOS",
      giroRecep: "ADMINISTRACION PUBLICA",
      dirRecep: "TEATINOS 120",
      cmnaRecep: "SANTIAGO",
      ...overrides?.receptor,
    },
    detalles: overrides?.detalles ?? [
      {
        nroLinDet: 1,
        nmbItem: "Smoke factura 33",
        qtyItem: 1,
        prcItem: 1190,
        montoItem: 1190,
      },
    ],
    totales: {
      mntNeto: 1000,
      tasaIVA: 19,
      iva: 190,
      mntTotal: 1190,
      ...overrides?.totales,
    },
    ...overrides,
  };
}

function createCaf(
  rutEmisor: string,
  start: number,
  end: number,
  razonSocial = "EMISOR TEST"
): { caf: CafMaterial; publicKey: forge.pki.rsa.PublicKey } {
  const keys = forge.pki.rsa.generateKeyPair(512);
  const privateKeyAsn1 = forge.pki.privateKeyToAsn1(keys.privateKey);
  const privateKeyDer = forge.asn1.toDer(privateKeyAsn1).getBytes();
  const publicKeyAsn1 = forge.pki.publicKeyToAsn1(keys.publicKey);
  const publicKeyDer = forge.asn1.toDer(publicKeyAsn1).getBytes();

  const modulusHex = toEvenLengthHex(keys.publicKey.n.toString(16));
  const exponentHex = toEvenLengthHex(keys.publicKey.e.toString(16));
  const modulus = forge.util.encode64(forge.util.hexToBytes(modulusHex));
  const exponent = forge.util.encode64(forge.util.hexToBytes(exponentHex));
  const rsask = forge.util.encode64(privateKeyDer);
  const rsapubk = forge.util.encode64(publicKeyDer);

  return {
    caf: {
      da: {
        rutEmisor,
        razonSocial,
        tipoDTE: TipoDTE.FacturaElectronica,
        rangeStart: start,
        rangeEnd: end,
        fechaAutorizacion: "2026-06-25",
        rsaPk: { modulus, exponent },
        idk: "100",
      },
      frma: "firma-caf",
      rsask,
      rsapubk,
      rawXml: "",
    },
    publicKey: keys.publicKey,
  };
}

function verifyFrmtWithLatin1(
  publicKey: forge.pki.rsa.PublicKey,
  ddXml: string,
  frmt: string
): boolean {
  const md = forge.md.sha1.create();
  md.update(Buffer.from(ddXml, "latin1").toString("binary"), "raw");
  return publicKey.verify(md.digest().bytes(), forge.util.decode64(frmt));
}

function signTedUsingUtf8(ddXml: string, caf: CafMaterial): string {
  const der = forge.util.decode64(caf.rsask);
  const asn1 = forge.asn1.fromDer(der);
  const privateKey = forge.pki.privateKeyFromAsn1(asn1) as forge.pki.rsa.PrivateKey;
  const md = forge.md.sha1.create();
  md.update(ddXml, "utf8");
  return forge.util.encode64(privateKey.sign(md));
}

function toEvenLengthHex(value: string): string {
  return value.length % 2 === 0 ? value : `0${value}`;
}
