import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

export function loadEnvFiles(
  files: string[],
  options: { preferExistingProcessEnv?: boolean } = {},
): void {
  const preservedKeys = options.preferExistingProcessEnv
    ? new Set(
        Object.keys(process.env).filter(
          (key) => process.env[key] !== undefined,
        ),
      )
    : undefined;

  for (const file of files) {
    const resolved = resolve(process.cwd(), file);
    if (!existsSync(resolved)) continue;

    const lines = readFileSync(resolved, 'utf8').split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const separatorIndex = trimmed.indexOf('=');
      if (separatorIndex === -1) continue;

      const key = trimmed.slice(0, separatorIndex).trim();
      const rawValue = trimmed.slice(separatorIndex + 1).trim();
      if (preservedKeys?.has(key)) continue;
      process.env[key] = stripQuotes(rawValue);
    }
  }
}

export function prepareMinistackTestEnv(): void {
  loadEnvFiles(['.env.ministack']);
  process.env.NODE_ENV = 'test';
  process.env.API_KEY_FRONTEND ||= 'dev-ministack-key';
  clearFiscalBootstrapEnv();
}

export function prepareRealSiiTestEnv(): void {
  loadEnvFiles(['.env.ministack', '.env'], {
    preferExistingProcessEnv: true,
  });
  inheritRealSiiFallbacksFromBootstrapEnv();
  process.env.NODE_ENV = 'test';
  process.env.API_KEY_FRONTEND =
    process.env.REAL_SII_TEST_API_KEY ||
    process.env.API_KEY_FRONTEND ||
    'dev-ministack-key';
  process.env.SII_PORTAL_CAF_AUTOMATION_ENABLED ||= 'true';
  process.env.SII_PORTAL_HTTP_SCRAPING_ENABLED ||= 'true';
  process.env.SII_PORTAL_PLAYWRIGHT_FALLBACK_ENABLED ||= 'true';
  process.env.SII_PORTAL_CERT_LOGIN_ENABLED ||= 'true';
  process.env.SII_PORTAL_HEADLESS ||= 'true';
  process.env.SII_PORTAL_DEBUG_FORM ||= 'true';
  process.env.SII_PORTAL_TIMEOUT_MS ||= '90000';
  clearFiscalBootstrapEnv();
}

function inheritRealSiiFallbacksFromBootstrapEnv(): void {
  const mappings = [
    ['REAL_SII_TEST_RUT_EMISOR', 'SII_RUT_EMISOR'],
    ['REAL_SII_TEST_RUT_FIRMANTE', 'SII_RUT_FIRMANTE'],
    ['REAL_SII_TEST_FECHA_RESOLUCION', 'SII_FECHA_RESOLUCION'],
    ['REAL_SII_TEST_NRO_RESOLUCION', 'SII_NRO_RESOLUCION'],
    ['REAL_SII_TEST_PFX_PATH', 'SII_PFX_PATH'],
    ['REAL_SII_TEST_PFX_PASSWORD', 'SII_PFX_PASSWORD'],
  ] as const;

  for (const [target, source] of mappings) {
    const targetValue = process.env[target]?.trim();
    const sourceValue = process.env[source]?.trim();
    if (!targetValue && sourceValue) {
      process.env[target] = sourceValue;
    }
  }
}

export function clearFiscalBootstrapEnv(): void {
  const bootstrapKeys = [
    'SII_RUT_EMISOR',
    'SII_RUT_FIRMANTE',
    'SII_CERT_REF',
    'SII_CERT_FINGERPRINT',
    'SII_FECHA_RESOLUCION',
    'SII_NRO_RESOLUCION',
    'SII_PFX_PATH',
    'SII_PFX_PASSWORD',
    'SII_CERT_PEM_PATH',
    'SII_KEY_PEM_PATH',
    'SII_CAF_PATH',
    'SII_CAF_PATHS',
  ];

  for (const key of bootstrapKeys) {
    delete process.env[key];
  }
}

export function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Falta variable requerida para pruebas: ${name}`);
  }
  return value;
}

export function optionalEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function stripQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}
