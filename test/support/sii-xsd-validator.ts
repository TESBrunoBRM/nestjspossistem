import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { basename, join } from 'path';
import { spawnSync } from 'child_process';
import { resolveProjectPath } from '../../src/common/utils/project-path.util';

export interface XsdValidationResult {
  valid: true;
  schemaName: string;
}

export function validateXmlAgainstOfficialSchema(input: {
  xmlPath: string;
  schemaZipPath: string;
  schemaName: string;
}): XsdValidationResult {
  const workDir = mkdtempSync(join(tmpdir(), 'sii-xsd-'));
  try {
    runTool(
      'unzip',
      ['-qq', '-o', resolveProjectPath(input.schemaZipPath), '-d', workDir],
      'No se pudo extraer el paquete XSD oficial',
    );
    runTool(
      'xmllint',
      [
        '--nonet',
        '--noout',
        '--schema',
        join(workDir, input.schemaName),
        input.xmlPath,
      ],
      `El artefacto no cumple ${input.schemaName}`,
    );
    return { valid: true, schemaName: input.schemaName };
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

function runTool(command: string, args: string[], failureMessage: string): void {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    timeout: 30_000,
    windowsHide: true,
  });
  if (result.error) {
    if ('code' in result.error && result.error.code === 'ENOENT') {
      throw new Error(
        `Falta la herramienta ${command} en la imagen de certificacion.`,
      );
    }
    throw new Error(`${failureMessage}: ${safeToolDetail(result.error.message)}`);
  }
  if (result.status !== 0) {
    const detail = safeToolDetail(result.stderr || result.stdout || 'sin detalle');
    throw new Error(`${failureMessage}: ${detail}`);
  }
}

function safeToolDetail(value: string): string {
  return value
    .replace(/\r?\n/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[<>]/g, '')
    .replace(/[A-Za-z]:\\[^ ]+/g, (path) => basename(path))
    .trim()
    .slice(0, 500);
}
