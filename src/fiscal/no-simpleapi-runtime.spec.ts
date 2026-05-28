import { readFileSync } from 'fs';
import { join } from 'path';

function readSource(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), 'utf8');
}

describe('native fiscal runtime', () => {
  it('does not wire the legacy external API into the application runtime', () => {
    const appModule = readSource('src/app.module.ts');
    const envValidation = readSource('src/config/env.validation.ts');
    const folioProvider = readSource(
      'src/fiscal-documents/fiscal-folio.provider.ts',
    );
    const main = readSource('src/main.ts');
    const legacyApiName = ['Simple', 'API'].join('');
    const legacyModuleName = ['Sii', 'Module'].join('');

    expect(appModule).not.toContain(legacyModuleName);
    expect(appModule).not.toContain(legacyApiName);
    expect(envValidation).toContain('legacyExternalApiPrefix');
    expect(envValidation).not.toContain(`${legacyApiName.toUpperCase()}_`);
    expect(envValidation).not.toContain('SII_RUT_CERTIFICADO');
    expect(envValidation).not.toContain('SII_RUT_EMPRESA');
    expect(folioProvider).not.toContain('data');
    expect(folioProvider).not.toContain('folios.json');
    expect(folioProvider).not.toContain('writeFile');
    expect(main).not.toContain(legacyApiName);
  });
});
