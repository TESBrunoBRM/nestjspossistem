import type { CafMaterial, FolioAssignment, CafWithStatus } from "../types/caf.types.js";
import type { TipoDTE } from "../types/dte.types.js";
import type { IssuerContext } from "../types/context.types.js";
import { SiiCafError } from "../errors/sii-errors.js";
import { isCafExpired, isCafExpiringSoon } from "./caf-parser.js";
import type { FolioProvider } from "./folio-provider.js";

export class InMemoryFolioProvider implements FolioProvider {
  private cafMap: Map<TipoDTE, CafEntry[]> = new Map();

  addCaf(caf: CafMaterial): void {
    const tipoDTE = caf.da.tipoDTE;
    if (!this.cafMap.has(tipoDTE)) {
      this.cafMap.set(tipoDTE, []);
    }
    const entries = this.cafMap.get(tipoDTE)!;

    const existing = entries.find(
      (e) => e.caf.da.rangeStart === caf.da.rangeStart
    );
    if (existing) {
      return;
    }

    entries.push({
      caf,
      currentFolio: caf.da.rangeStart,
    });

    entries.sort((a, b) => a.caf.da.rangeStart - b.caf.da.rangeStart);
  }

  async getNextFolio(_context: IssuerContext, tipoDTE: TipoDTE): Promise<FolioAssignment> {
    const entries = this.cafMap.get(tipoDTE);
    if (!entries || entries.length === 0) {
      throw new SiiCafError(
        "CAF_EXHAUSTED",
        `No hay CAFs disponibles para el tipo DTE ${tipoDTE}`
      );
    }

    for (const entry of entries) {
      if (isCafExpired(entry.caf)) continue;
      if (entry.currentFolio > entry.caf.da.rangeEnd) continue;

      const folio = entry.currentFolio;
      entry.currentFolio++;

      return {
        folio,
        caf: entry.caf,
        assignedAt: new Date(),
      };
    }

    throw new SiiCafError(
      "CAF_EXHAUSTED",
      `Todos los CAFs del tipo DTE ${tipoDTE} están agotados o expirados`
    );
  }

  async reserveFolio(_context: IssuerContext, tipoDTE: TipoDTE, folio: number): Promise<FolioAssignment> {
    const entries = this.cafMap.get(tipoDTE);
    if (!entries || entries.length === 0) {
      throw new SiiCafError(
        "CAF_EXHAUSTED",
        `No hay CAFs disponibles para el tipo DTE ${tipoDTE}`
      );
    }

    for (const entry of entries) {
      if (folio >= entry.caf.da.rangeStart && folio <= entry.caf.da.rangeEnd) {
        return {
          folio,
          caf: entry.caf,
          assignedAt: new Date(),
        };
      }
    }

    throw new SiiCafError(
      "CAF_INVALID_RANGE",
      `El folio ${folio} no está en ningún CAF registrado para tipo ${tipoDTE}`
    );
  }

  async getStatus(_context: IssuerContext, tipoDTE?: TipoDTE): Promise<CafWithStatus[]> {
    const result: CafWithStatus[] = [];
    const types = tipoDTE ? [tipoDTE] : Array.from(this.cafMap.keys());

    for (const type of types) {
      const entries = this.cafMap.get(type) ?? [];
      for (const entry of entries) {
        const remaining = entry.caf.da.rangeEnd - entry.currentFolio + 1;
        let status: CafWithStatus["status"];

        if (isCafExpired(entry.caf)) {
          status = "expired";
        } else if (remaining <= 0) {
          status = "exhausted";
        } else if (isCafExpiringSoon(entry.caf)) {
          status = "expiring_soon";
        } else {
          status = "active";
        }

        result.push({
          caf: entry.caf,
          status,
          remaining: Math.max(0, remaining),
        });
      }
    }

    return result;
  }

  async getRemainingFolios(context: IssuerContext, tipoDTE: TipoDTE): Promise<number> {
    const statuses = await this.getStatus(context, tipoDTE);
    return statuses
      .filter((s) => s.status === "active")
      .reduce((acc, s) => acc + s.remaining, 0);
  }
}

interface CafEntry {
  caf: CafMaterial;
  currentFolio: number;
}
