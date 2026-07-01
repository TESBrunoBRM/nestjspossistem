import axios from "axios";
import forge from "node-forge";
import { describe, expect, it, vi } from "vitest";
import { getAuthToken } from "../src/signing/seed-auth.js";
import { SiiEnvironment } from "../src/types/transport.types.js";
import type { CertificateMaterial } from "../src/types/signing.types.js";

vi.mock("axios", () => ({
  default: {
    post: vi.fn(),
  },
}));

const postMock = vi.mocked(axios.post);

describe("SII seed authentication", () => {
  it("accepts SOAP returns that contain escaped SII XML payloads", async () => {
    const keyPair = forge.pki.rsa.generateKeyPair({ bits: 1024, e: 0x10001 });
    const cert: CertificateMaterial = {
      privateKeyPem: forge.pki.privateKeyToPem(keyPair.privateKey),
      certificatePem: "-----BEGIN CERTIFICATE-----\nmock\n-----END CERTIFICATE-----",
      rutFirmante: "19157386-2",
      nombre: "Firmante fiscal",
      expiresAt: new Date("2030-01-01T00:00:00.000Z"),
      fingerprintSha256: "mock",
    };

    postMock
      .mockResolvedValueOnce({
        data: soapResponse(
          "getSeedReturn",
          `<?xml version="1.0" encoding="UTF-8"?>
<SII:RESPUESTA xmlns:SII="http://www.sii.cl/XMLSchema">
  <SII:RESP_BODY><SEMILLA>163854084638</SEMILLA></SII:RESP_BODY>
  <SII:RESP_HDR><ESTADO>00</ESTADO></SII:RESP_HDR>
</SII:RESPUESTA>`
        ),
      })
      .mockResolvedValueOnce({
        data: soapResponse(
          "getTokenReturn",
          `<?xml version="1.0" encoding="UTF-8"?>
<SII:RESPUESTA xmlns:SII="http://www.sii.cl/XMLSchema">
  <SII:RESP_BODY><TOKEN>token-real-sii</TOKEN></SII:RESP_BODY>
  <SII:RESP_HDR><STATUS>00</STATUS></SII:RESP_HDR>
</SII:RESPUESTA>`
        ),
      });

    const token = await getAuthToken(SiiEnvironment.Certificacion, cert);

    expect(token.token).toBe("token-real-sii");
    expect(postMock).toHaveBeenCalledTimes(2);
  });
});

function soapResponse(returnName: string, innerXml: string): string {
  const escaped = innerXml
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <soapenv:Body>
    <getSeedResponse>
      <${returnName} xsi:type="xsd:string">${escaped}</${returnName}>
    </getSeedResponse>
  </soapenv:Body>
</soapenv:Envelope>`;
}
