export function prepareMinistackTestEnv(): void {
  process.env.NODE_ENV = 'test';
  process.env.API_KEY_FRONTEND ||= 'dev-ministack-key';
  clearFiscalBootstrapEnv();
}

export function prepareRealSiiTestEnv(): void {
  process.env.NODE_ENV = 'test';
  process.env.API_KEY_FRONTEND =
    process.env.REAL_SII_TEST_API_KEY ||
    process.env.API_KEY_FRONTEND ||
    'dev-ministack-key';
  process.env.SII_PORTAL_CAF_AUTOMATION_ENABLED ||= 'true';
  process.env.SII_PORTAL_HTTP_SCRAPING_ENABLED ||= 'true';
  process.env.SII_PORTAL_PLAYWRIGHT_FALLBACK_ENABLED ||= 'true';
  process.env.SII_PORTAL_CERT_LOGIN_ENABLED ||= 'true';
  process.env.SII_PORTAL_HEADLESS =
    process.env.SII_PORTAL_DEBUG_BROWSER_VISIBLE === 'true' ? 'false' : 'true';
  process.env.SII_PORTAL_DEBUG_FORM ||= 'true';
  process.env.SII_PORTAL_PROGRESS_LOG_ENABLED ||= 'true';
  process.env.SII_PORTAL_TIMEOUT_MS ||= '90000';
  process.env.SII_PORTAL_HTTP_TIMEOUT_MS ||= '30000';
  clearFiscalBootstrapEnv();
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
