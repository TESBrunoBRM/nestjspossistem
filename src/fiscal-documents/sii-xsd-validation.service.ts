import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { spawnSync } from 'child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { basename, join } from 'path';
import { isBoletaTipoDTE } from 'sii-engine';
import { resolveProjectPath } from '../common/utils/project-path.util';

@Injectable()
export class SiiXsdValidationService {
  private readonly logger = new Logger(SiiXsdValidationService.name);

  constructor(private readonly configService: ConfigService) {}

  validateSignedEnvelope(xml: string, tipoDTE: number): void {
    if (!this.enabled()) return;

    const schema = isBoletaTipoDTE(tipoDTE)
      ? {
          zipPath: 'docs_sii/FormatoXML/schema_envio_bol.zip',
          name: 'EnvioBOLETA_v11.xsd',
        }
      : {
          zipPath: 'docs_sii/FormatoXML/schema_dte.zip',
          name: 'EnvioDTE_v10.xsd',
        };
    const workDir = mkdtempSync(join(tmpdir(), 'sii-envelope-xsd-'));

    try {
      const xmlPath = join(workDir, 'signed-envelope.xml');
      writeFileSync(xmlPath, encodeLatin1(xml));
      this.runTool(
        'unzip',
        ['-qq', '-o', resolveProjectPath(schema.zipPath), '-d', workDir],
        'No se pudo extraer el esquema oficial',
      );
      this.runTool(
        'xmllint',
        ['--nonet', '--noout', '--schema', join(workDir, schema.name), xmlPath],
        `El sobre firmado no cumple ${schema.name}`,
      );
    } finally {
      rmSync(workDir, { recursive: true, force: true });
    }
  }

  private enabled(): boolean {
    const configured = this.configService.get<boolean | string>(
      'SII_XSD_VALIDATION_ENABLED',
    );
    if (configured !== undefined) return parseBoolean(configured);
    return this.configService.get<string>('NODE_ENV') === 'production';
  }

  private runTool(
    command: string,
    args: string[],
    failureMessage: string,
  ): void {
    const result = spawnSync(command, args, {
      encoding: 'utf8',
      timeout: 30_000,
      windowsHide: true,
    });
    if (!result.error && result.status === 0) return;

    const rawDetail =
      result.error?.message || result.stderr || result.stdout || 'sin detalle';
    const detail = safeToolDetail(rawDetail);
    this.logger.error(`${failureMessage}: ${detail}`);
    throw new InternalServerErrorException(
      'El XML fiscal generado no supero la validacion XSD oficial; no se realizo upload al SII.',
    );
  }
}

function encodeLatin1(value: string): Buffer {
  for (let index = 0; index < value.length; index += 1) {
    if (value.charCodeAt(index) > 0xff) {
      throw new InternalServerErrorException(
        'El XML fiscal contiene caracteres fuera de ISO-8859-1; no se realizo upload al SII.',
      );
    }
  }
  return Buffer.from(value, 'latin1');
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

function parseBoolean(value: boolean | string): boolean {
  if (typeof value === 'boolean') return value;
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}
