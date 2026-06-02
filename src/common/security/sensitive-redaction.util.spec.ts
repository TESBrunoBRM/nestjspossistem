import { BadRequestException } from '@nestjs/common';
import {
  assertNoSensitiveKeys,
  sanitizePublicPayload,
} from './sensitive-redaction.util';

describe('sensitive fiscal redaction', () => {
  it('rejects sensitive material submitted in public request payloads', () => {
    expect(() =>
      assertNoSensitiveKeys({
        document: { idDoc: { tipoDTE: 39 } },
        pfxPassword: 'not-allowed',
      }),
    ).toThrow(BadRequestException);
  });

  it('allows CAF XML only when the caller explicitly permits that field', () => {
    expect(() =>
      assertNoSensitiveKeys(
        {
          cafXml:
            '<AUTORIZACION><CAF version="1.0"></CAF><RSASK>secret</RSASK></AUTORIZACION>',
        },
        { allowKeys: ['cafXml'] },
      ),
    ).not.toThrow();
  });

  it('allows issuer onboarding sensitive fields only when explicitly permitted', () => {
    expect(() =>
      assertNoSensitiveKeys(
        {
          pfxBase64: 'ZmFrZS1wZng=',
          pfxPassword: 'allowed-here',
        },
        { allowKeys: ['pfxBase64', 'pfxPassword'] },
      ),
    ).not.toThrow();
  });

  it('redacts raw provider responses and fiscal secrets before public output', () => {
    const sanitized = sanitizePublicPayload({
      trackId: '123',
      rawResponse: '<xml>provider-response</xml>',
      signedXml: '<DTE>signed</DTE>',
      nested: {
        cafXml:
          '<AUTORIZACION><CAF version="1.0"><DA>secret</DA></CAF><RSASK>private</RSASK></AUTORIZACION>',
      },
    });

    const serialized = JSON.stringify(sanitized);

    expect(serialized).toContain('"trackId":"123"');
    expect(serialized).not.toContain('rawResponse');
    expect(serialized).not.toContain('signedXml');
    expect(serialized).not.toContain('cafXml');
    expect(serialized).not.toContain('<DTE>signed</DTE>');
    expect(serialized).not.toContain('<CAF');
    expect(serialized).not.toContain('<RSASK');
    expect(serialized).not.toContain('private');
  });

  it('keeps public CAF metadata while removing private CAF fields', () => {
    const sanitized = sanitizePublicPayload({
      folio: 1,
      caf: {
        rutEmisor: '76123456-0',
        rangeStart: 1,
        rangeEnd: 10,
        rawXml: '<CAF>secret</CAF>',
        rsask: 'private-caf-key',
      },
    });

    const serialized = JSON.stringify(sanitized);

    expect(serialized).toContain('"caf"');
    expect(serialized).toContain('"rangeStart":1');
    expect(serialized).not.toContain('rawXml');
    expect(serialized).not.toContain('rsask');
    expect(serialized).not.toContain('<CAF');
    expect(serialized).not.toContain('private-caf-key');
  });
});
