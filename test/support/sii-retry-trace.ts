import { appendFileSync, mkdirSync } from 'fs';
import { createHash } from 'crypto';
import { dirname } from 'path';
import { sanitizePublicPayload } from '../../src/common/security/sensitive-redaction.util';

export class RetryTrace {
  constructor(
    private readonly path: string,
    private readonly tipoDTE: number,
    private readonly folio: number,
    private readonly operation: string,
  ) {}

  event(
    event: string,
    message: string,
    details: Record<string, unknown> = {},
  ): void {
    const timestamp = new Date().toISOString();
    const safeDetails = sanitizePublicPayload(details);
    const record = {
      version: 1,
      timestamp,
      tipoDTE: this.tipoDTE,
      folio: this.folio,
      operation: this.operation,
      event,
      ...safeDetails,
    };
    mkdirSync(dirname(this.path), { recursive: true });
    appendFileSync(this.path, `${JSON.stringify(record)}\n`, 'utf8');
    process.stdout.write(
      `[real-sii:retry:${this.tipoDTE}:${this.operation}] ${timestamp} ${message}${formatDetails(safeDetails)}\n`,
    );
  }
}

export function sha256(value: Buffer | string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function summarizeSiiResponse(rawResponse?: string): {
  responseKind?: 'html' | 'xml' | 'text';
  responseBytes?: number;
  responseSha256?: string;
} {
  if (!rawResponse) return {};
  const trimmed = rawResponse.trimStart();
  return {
    responseKind: /^<!DOCTYPE\s+HTML|^<html\b/i.test(trimmed)
      ? 'html'
      : /^<\?xml\b|^<[A-Za-z_][\w:.-]*\b/.test(trimmed)
        ? 'xml'
        : 'text',
    responseBytes: Buffer.byteLength(rawResponse),
    responseSha256: sha256(rawResponse),
  };
}

function formatDetails(details: Record<string, unknown>): string {
  const entries = Object.entries(details).filter(
    ([, value]) => value !== undefined && value !== null && value !== '',
  );
  return entries.length > 0
    ? ` | ${entries.map(([key, value]) => `${key}=${String(value)}`).join(' ')}`
    : '';
}
