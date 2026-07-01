import { describe, expect, it } from "vitest";
import { parseCaf } from "../src/caf/caf-parser.js";

describe("CAF parser", () => {
  it("extracts FRMA text when the CAF signature has attributes", () => {
    const caf = parseCaf(`<?xml version="1.0" encoding="ISO-8859-1"?>
<AUTORIZACION>
  <CAF version="1.0">
    <DA>
      <RE>78086484-2</RE>
      <RS>ZEAK STUDIOS SPA</RS>
      <TD>33</TD>
      <RNG><D>1</D><H>10</H></RNG>
      <FA>2026-06-15</FA>
      <RSAPK>
        <M>modulus</M>
        <E>Aw==</E>
      </RSAPK>
      <IDK>100</IDK>
    </DA>
    <FRMA algoritmo="SHA1withRSA">firma-caf-base64</FRMA>
  </CAF>
  <RSASK>private-key</RSASK>
  <RSAPUBK>public-key</RSAPUBK>
</AUTORIZACION>`);

    expect(caf.frma).toBe("firma-caf-base64");
    expect(caf.frma).not.toBe("[object Object]");
  });
});
