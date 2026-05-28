import { BadRequestException } from '@nestjs/common';

const SENSITIVE_KEYS = new Set([
  'cafxml',
  'certificatepem',
  'cookie',
  'cookies',
  'p12',
  'password',
  'pfx',
  'privatekey',
  'privatekeypem',
  'rawxml',
  'rawresponse',
  'rsask',
  'session',
  'setcookie',
  'signedenvelope',
  'signedxml',
  'token',
]);

const SENSITIVE_KEY_FRAGMENTS = [
  'cafxml',
  'cookie',
  'password',
  'pfx',
  'p12',
  'privatekey',
  'rawxml',
  'rawresponse',
  'rsask',
  'session',
  'setcookie',
  'signeddte',
  'signeddocument',
  'signedenvelope',
  'signedxml',
  'token',
];

const SENSITIVE_TEXT_PATTERNS = [
  /-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/gi,
  /<RSASK\b[^>]*>[\s\S]*?<\/RSASK>/gi,
  /<CAF\b[^>]*>[\s\S]*?<\/CAF>/gi,
  /TOKEN=[^;<\s]+/gi,
];

interface SensitiveKeyOptions {
  allowKeys?: string[];
}

export function assertNoSensitiveKeys(
  value: unknown,
  options: SensitiveKeyOptions = {},
): void {
  const allowedKeys = new Set(
    options.allowKeys?.map((key) => normalizeKey(key)) ?? [],
  );
  const key = findSensitiveKey(value, allowedKeys);
  if (key) {
    throw new BadRequestException(
      `El cuerpo de la solicitud contiene un campo fiscal prohibido: ${key}`,
    );
  }
}

export function sanitizePublicPayload<T>(value: T): T {
  return sanitizeValue(value) as T;
}

function findSensitiveKey(
  value: unknown,
  allowedKeys: Set<string>,
): string | undefined {
  if (!value || typeof value !== 'object') return undefined;

  if (Array.isArray(value)) {
    for (const item of value) {
      const key = findSensitiveKey(item, allowedKeys);
      if (key) return key;
    }
    return undefined;
  }

  for (const [key, nested] of Object.entries(value)) {
    if (isSensitiveKey(key) && !allowedKeys.has(normalizeKey(key))) return key;

    const nestedKey = findSensitiveKey(nested, allowedKeys);
    if (nestedKey) return nestedKey;
  }

  return undefined;
}

function sanitizeValue(value: unknown): unknown {
  if (typeof value === 'string') return redactSensitiveText(value);
  if (!value || typeof value !== 'object') return value;

  if (value instanceof Date) return value;

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item));
  }

  const output: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) {
    if (isSensitiveKey(key)) {
      continue;
    }

    output[key] = sanitizeValue(nested);
  }

  return output;
}

function redactSensitiveText(input: string): string {
  return SENSITIVE_TEXT_PATTERNS.reduce(
    (text, pattern) => text.replace(pattern, '[REDACTED]'),
    input,
  );
}

function normalizeKey(key: string): string {
  return key.replace(/[_\-\s]/g, '').toLowerCase();
}

function isSensitiveKey(key: string): boolean {
  const normalized = normalizeKey(key);
  return (
    SENSITIVE_KEYS.has(normalized) ||
    SENSITIVE_KEY_FRAGMENTS.some((fragment) => normalized.includes(fragment))
  );
}
