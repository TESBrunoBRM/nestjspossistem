import axios from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SiiSendError } from "../src/errors/sii-errors.js";
import {
  queryDteStatus,
  querySendStatus,
  sendDte,
} from "../src/transport/legacy-client.js";
import { SiiEnvironment } from "../src/types/transport.types.js";

vi.mock("axios", () => ({
  default: {
    post: vi.fn(),
  },
}));

const postMock = vi.mocked(axios.post);

const options = {
  rutSender: "66000000",
  dvSender: "0",
  rutCompany: "77777777",
  dvCompany: "7",
  token: "token-test",
  environment: SiiEnvironment.Certificacion,
};

describe("legacy DTE upload", () => {
  beforeEach(() => {
    postMock.mockReset();
  });

  it("uses the multipart format accepted by the legacy SII CGI", async () => {
    postMock.mockResolvedValue({
      data: `<?xml version="1.0"?>
<RECEPCIONDTE>
  <STATUS>0</STATUS>
  <TRACKID>0001234567</TRACKID>
</RECEPCIONDTE>`,
    });

    const result = await sendDte(
      '<?xml version="1.0" encoding="ISO-8859-1"?><EnvioDTE>á</EnvioDTE>',
      options
    );

    expect(result).toMatchObject({
      trackId: "0001234567",
      status: "SOK",
    });
    expect(postMock).toHaveBeenCalledTimes(1);

    const [, body, config] = postMock.mock.calls[0]!;
    expect(Buffer.isBuffer(body)).toBe(true);
    const multipartBody = body as Buffer;
    const multipartText = multipartBody.toString("latin1");
    const headers = config?.headers as Record<string, string | number>;

    expect(multipartText).toContain(
      'Content-Disposition: form-data; name="rutSender"'
    );
    expect(multipartText).toContain("Content-Transfer-Encoding: 8Bit");
    expect(multipartText).toContain(
      'Content-Disposition: form-data; name="archivo"; filename="EnvioDTE.xml"'
    );
    expect(multipartText).toContain("Content-Transfer-Encoding: binary");
    expect(multipartText).toContain("<EnvioDTE>á</EnvioDTE>");
    expect(headers["Content-Length"]).toBe(multipartBody.length);
    expect(headers["Content-Type"]).toMatch(
      /^multipart\/form-data; boundary=---------------------------/
    );
    expect(headers.Referer).toBe("http://www.empresa.cl");
  });

  it("rejects non-zero RECEPCIONDTE upload status", async () => {
    postMock.mockResolvedValue({
      data: `<?xml version="1.0"?>
<RECEPCIONDTE>
  <STATUS>5</STATUS>
</RECEPCIONDTE>`,
    });

    await expect(sendDte("<EnvioDTE/>", options)).rejects.toMatchObject<
      Partial<SiiSendError>
    >({
      code: "SEND_FAILED",
    });
  });

  it("queries send status through the official QueryEstUp SOAP service", async () => {
    postMock.mockResolvedValue({
      data: soapResponse(
        "getEstUpReturn",
        `<?xml version="1.0" encoding="UTF-8"?>
<SII:RESPUESTA xmlns:SII="http://www.sii.cl/XMLSchema">
  <SII:RESP_BODY>
    <ACEPTADOS>0</ACEPTADOS>
    <RECHAZADOS>1</RECHAZADOS>
    <REPAROS>0</REPAROS>
  </SII:RESP_BODY>
  <SII:RESP_HDR>
    <TRACKID>0001234568</TRACKID>
    <ESTADO>EPR</ESTADO>
    <GLOSA>Envio Procesado</GLOSA>
  </SII:RESP_HDR>
</SII:RESPUESTA>`
      ),
    });

    const result = await querySendStatus({
      rutEmpresa: "77777777",
      dvEmpresa: "7",
      trackId: "0001234568",
      token: "token-test",
      environment: SiiEnvironment.Certificacion,
    });

    expect(result).toMatchObject({
      trackId: "0001234568",
      status: "EPR",
      detail: "Envio Procesado",
      estadisticas: {
        aceptados: 0,
        rechazados: 1,
        reparos: 0,
      },
    });

    const [url, body, config] = postMock.mock.calls[0]!;
    expect(url).toBe("https://maullin.sii.cl/DTEWS/QueryEstUp.jws");
    expect(String(body)).toContain("<def:getEstUp");
    expect(String(body)).toContain("<TrackId xsi:type=\"xsd:string\">0001234568</TrackId>");
    expect(config?.headers).toMatchObject({
      "Content-Type": "text/xml; charset=utf-8",
      SOAPAction: "",
    });
  });

  it("queries DTE status through the official QueryEstDte SOAP service", async () => {
    postMock.mockResolvedValue({
      data: soapResponse(
        "getEstDteReturn",
        `<?xml version="1.0" encoding="UTF-8"?>
<SII:RESPUESTA xmlns:SII="http://www.sii.cl/XMLSchema">
  <SII:RESP_HDR>
    <ESTADO>FAU</ESTADO>
    <GLOSA_ESTADO>DTE No Recibido</GLOSA_ESTADO>
    <ERR_CODE>3</ERR_CODE>
  </SII:RESP_HDR>
</SII:RESPUESTA>`
      ),
    });

    const result = await queryDteStatus({
      rutConsultante: "66000000",
      dvConsultante: "0",
      rutEmisor: "77777777",
      dvEmisor: "7",
      rutReceptor: "60803000",
      dvReceptor: "K",
      tipoDTE: 33,
      folio: 12,
      fechaEmision: "2026-06-19",
      montoTotal: 1190,
      token: "token-test",
      environment: SiiEnvironment.Certificacion,
    });

    expect(result).toMatchObject({
      tipoDTE: 33,
      folio: 12,
      rutEmisor: "77777777",
      status: "FAU",
      glosa: "DTE No Recibido",
    });

    const [url, body] = postMock.mock.calls[0]!;
    expect(url).toBe("https://maullin.sii.cl/DTEWS/QueryEstDte.jws");
    expect(String(body)).toContain("<def:getEstDte");
    expect(String(body)).toContain(
      "<RutConsultante xsi:type=\"xsd:string\">66000000</RutConsultante>"
    );
    expect(String(body)).toContain(
      "<FechaEmisionDte xsi:type=\"xsd:string\">19-06-2026</FechaEmisionDte>"
    );
  });
});

function soapResponse(returnName: string, innerXml: string): string {
  const escaped = innerXml
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <soapenv:Body>
    <ns1:response xmlns:ns1="http://DefaultNamespace">
      <ns1:${returnName} xsi:type="xsd:string">${escaped}</ns1:${returnName}>
    </ns1:response>
  </soapenv:Body>
</soapenv:Envelope>`;
}
