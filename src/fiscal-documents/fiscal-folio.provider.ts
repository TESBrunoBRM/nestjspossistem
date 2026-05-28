import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { access, readFile } from 'fs/promises';
import { extname } from 'path';
import forge from 'node-forge';
import {
  isCafExpired,
  isCafExpiringSoon,
  normalizeRut,
  parseCaf,
  SiiEnvironment,
  type CafMaterial,
  type CafWithStatus,
  type FolioAssignment,
  type FolioProvider,
  type IssuerContext,
  type TipoDTE,
} from 'sii-engine';

interface InMemoryCafEntry {
  caf: CafMaterial;
  nextFolio: number;
  reservedFolios: Set<number>;
}

@Injectable()
export class FiscalFolioProvider implements FolioProvider, OnModuleInit {
  private readonly logger = new Logger(FiscalFolioProvider.name);
  private readonly entries = new Map<string, InMemoryCafEntry[]>();
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit(): Promise<void> {
    this.assertNoProductionLocalBootstrap();
    await this.loadConfiguredCafs();
  }

  async addCafXml(
    context: IssuerContext | undefined,
    cafXml: string,
  ): Promise<void> {
    return this.enqueue(() => {
      const caf = parseCaf(cafXml);
      caf.rsask = normalizeCafPrivateKey(caf.rsask);
      const fiscalContext = this.resolveCafContext(context, caf);
      this.assertCafMatchesContext(fiscalContext, caf);
      this.addCaf(fiscalContext, caf);
    });
  }

  async getNextFolio(
    context: IssuerContext,
    tipoDTE: TipoDTE,
  ): Promise<FolioAssignment> {
    return this.enqueue(() => {
      const entry = this.findEntryWithAvailability(context, tipoDTE);
      const folio = this.nextAvailableFolio(entry);

      if (folio === null) {
        throw new BadRequestException(`Folios agotados para DTE ${tipoDTE}`);
      }

      return this.reserveInEntry(entry, tipoDTE, folio);
    });
  }

  async reserveFolio(
    context: IssuerContext,
    tipoDTE: TipoDTE,
    folio: number,
  ): Promise<FolioAssignment> {
    return this.enqueue(() => {
      if (!Number.isInteger(folio) || folio <= 0) {
        throw new BadRequestException('El folio debe ser un entero positivo');
      }

      const entry = this.findEntryForFolio(context, tipoDTE, folio);
      return this.reserveInEntry(entry, tipoDTE, folio);
    });
  }

  async getStatus(
    context: IssuerContext,
    tipoDTE?: TipoDTE,
  ): Promise<CafWithStatus[]> {
    await Promise.resolve();
    const result: CafWithStatus[] = [];
    const normalizedRut = normalizeRut(context.rutEmisor);

    for (const [key, entries] of this.entries) {
      const [environment, rut, dte] = key.split(':');
      if (environment !== String(context.environment)) continue;
      if (rut !== normalizedRut) continue;
      if (tipoDTE !== undefined && Number(dte) !== Number(tipoDTE)) continue;

      for (const entry of entries) {
        const remaining = this.countRemaining(entry);
        result.push({
          caf: entry.caf,
          status: this.resolveStatus(entry, remaining),
          remaining,
        });
      }
    }

    return result;
  }

  private async loadConfiguredCafs(): Promise<void> {
    const paths = this.getConfiguredCafPaths();

    for (const cafPath of paths) {
      await this.assertReadableCafFile(cafPath);
      const cafXml = await readFile(cafPath, 'utf8');
      await this.addCafXml(undefined, cafXml);
      this.logger.log('CAF cargado desde bootstrap local');
    }
  }

  private assertNoProductionLocalBootstrap(): void {
    if (this.configService.get<string>('NODE_ENV') !== 'production') return;

    const configuredKeys = ['SII_CAF_PATH', 'SII_CAF_PATHS'].filter((key) => {
      const value = this.configService.get<string>(key);
      return value !== undefined && value !== '';
    });

    if (configuredKeys.length > 0) {
      throw new Error(
        `Bootstrap local de CAF no permitido en produccion (${configuredKeys.join(', ')}). Use un FiscalFolioProvider productivo por tenant/emisor.`,
      );
    }
  }

  private getConfiguredCafPaths(): string[] {
    const singlePath = this.configService.get<string>('SII_CAF_PATH');
    const multiplePaths = this.configService.get<string>('SII_CAF_PATHS');
    const raw = [singlePath, multiplePaths].filter(Boolean).join(',');

    return raw
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  private async assertReadableCafFile(cafPath: string): Promise<void> {
    const extension = extname(cafPath).toLowerCase();
    if (!['.xml', '.txt'].includes(extension)) {
      throw new Error('SII_CAF_PATH debe apuntar a un archivo .xml o .txt');
    }

    try {
      await access(cafPath);
    } catch {
      throw new Error('SII_CAF_PATH no apunta a un archivo legible');
    }
  }

  private resolveCafContext(
    context: IssuerContext | undefined,
    caf: CafMaterial,
  ): IssuerContext {
    return {
      tenantId: context?.tenantId,
      merchantId: context?.merchantId,
      branchId: context?.branchId,
      environment: context?.environment ?? this.resolveEnvironment(),
      rutEmisor: context?.rutEmisor ?? caf.da.rutEmisor,
      fechaResolucion: context?.fechaResolucion ?? '1970-01-01',
      nroResolucion: context?.nroResolucion ?? 0,
      certificateRef: context?.certificateRef,
      certificateFingerprint: context?.certificateFingerprint,
    };
  }

  private resolveEnvironment(): SiiEnvironment {
    const configured = this.configService.get<string | number>('SII_AMBIENTE');

    if (
      configured === 1 ||
      configured === '1' ||
      configured === SiiEnvironment.Produccion
    ) {
      return SiiEnvironment.Produccion;
    }

    return SiiEnvironment.Certificacion;
  }

  private addCaf(context: IssuerContext, caf: CafMaterial): void {
    const key = this.key(
      context.environment,
      context.rutEmisor,
      caf.da.tipoDTE,
    );
    const entries = this.entries.get(key) ?? [];

    const exists = entries.some(
      (entry) =>
        entry.caf.da.rangeStart === caf.da.rangeStart &&
        entry.caf.da.rangeEnd === caf.da.rangeEnd,
    );

    if (exists) return;

    entries.push({
      caf,
      nextFolio: caf.da.rangeStart,
      reservedFolios: new Set<number>(),
    });
    entries.sort(
      (left, right) => left.caf.da.rangeStart - right.caf.da.rangeStart,
    );
    this.entries.set(key, entries);
  }

  private assertCafMatchesContext(
    context: IssuerContext,
    caf: CafMaterial,
  ): void {
    const contextRut = normalizeRut(context.rutEmisor);
    const cafRut = normalizeRut(caf.da.rutEmisor);

    if (contextRut !== cafRut) {
      throw new BadRequestException(
        `El CAF pertenece al RUT ${caf.da.rutEmisor}, pero el contexto fiscal usa ${context.rutEmisor}`,
      );
    }
  }

  private findEntryWithAvailability(
    context: IssuerContext,
    tipoDTE: TipoDTE,
  ): InMemoryCafEntry {
    const entries = this.entries.get(
      this.key(context.environment, context.rutEmisor, tipoDTE),
    );

    if (!entries?.length) {
      throw new BadRequestException(
        `No se encontro un CAF valido para el RUT ${context.rutEmisor} y DTE ${tipoDTE}`,
      );
    }

    const entry = entries.find(
      (item) =>
        !isCafExpired(item.caf) && this.nextAvailableFolio(item) !== null,
    );

    if (!entry) {
      throw new BadRequestException(`Folios agotados para DTE ${tipoDTE}`);
    }

    return entry;
  }

  private findEntryForFolio(
    context: IssuerContext,
    tipoDTE: TipoDTE,
    folio: number,
  ): InMemoryCafEntry {
    const entries = this.entries.get(
      this.key(context.environment, context.rutEmisor, tipoDTE),
    );

    const entry = entries?.find(
      (item) =>
        folio >= item.caf.da.rangeStart && folio <= item.caf.da.rangeEnd,
    );

    if (!entry) {
      throw new BadRequestException(
        `El folio ${folio} no esta autorizado para el RUT ${context.rutEmisor} y DTE ${tipoDTE}`,
      );
    }

    if (isCafExpired(entry.caf)) {
      throw new BadRequestException(
        `El CAF para el folio ${folio} esta expirado`,
      );
    }

    return entry;
  }

  private reserveInEntry(
    entry: InMemoryCafEntry,
    tipoDTE: TipoDTE,
    folio: number,
  ): FolioAssignment {
    if (entry.reservedFolios.has(folio)) {
      throw new BadRequestException(
        `El folio ${folio} ya fue reservado para DTE ${tipoDTE}`,
      );
    }

    entry.reservedFolios.add(folio);

    while (
      entry.nextFolio <= entry.caf.da.rangeEnd &&
      entry.reservedFolios.has(entry.nextFolio)
    ) {
      entry.nextFolio += 1;
    }

    return {
      folio,
      caf: entry.caf,
      assignedAt: new Date(),
    };
  }

  private nextAvailableFolio(entry: InMemoryCafEntry): number | null {
    for (
      let folio = entry.nextFolio;
      folio <= entry.caf.da.rangeEnd;
      folio += 1
    ) {
      if (!entry.reservedFolios.has(folio)) return folio;
    }

    return null;
  }

  private countRemaining(entry: InMemoryCafEntry): number {
    let remaining = 0;
    for (
      let folio = entry.nextFolio;
      folio <= entry.caf.da.rangeEnd;
      folio += 1
    ) {
      if (!entry.reservedFolios.has(folio)) remaining += 1;
    }
    return remaining;
  }

  private resolveStatus(
    entry: InMemoryCafEntry,
    remaining: number,
  ): CafWithStatus['status'] {
    if (isCafExpired(entry.caf)) return 'expired';
    if (remaining <= 0) return 'exhausted';
    if (isCafExpiringSoon(entry.caf)) return 'expiring_soon';
    return 'active';
  }

  private key(
    environment: SiiEnvironment,
    rutEmisor: string,
    tipoDTE: TipoDTE,
  ): string {
    return `${environment}:${normalizeRut(rutEmisor)}:${tipoDTE}`;
  }

  private enqueue<T>(task: () => Promise<T> | T): Promise<T> {
    const result = this.queue.then(task);
    this.queue = result.catch(() => undefined);
    return result;
  }
}

function normalizeCafPrivateKey(rsask: string): string {
  if (!rsask.includes('-----BEGIN')) {
    return rsask.replace(/\s/g, '');
  }

  try {
    const privateKey = forge.pki.privateKeyFromPem(rsask);
    const privateKeyAsn1 = forge.pki.privateKeyToAsn1(privateKey);
    const der = forge.asn1.toDer(privateKeyAsn1).getBytes();
    return forge.util.encode64(der);
  } catch {
    throw new BadRequestException(
      'No se pudo normalizar la clave privada RSASK del CAF',
    );
  }
}
