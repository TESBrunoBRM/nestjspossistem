import type { FolioAssignment, CafWithStatus } from "../types/caf.types.js";
import type { TipoDTE } from "../types/dte.types.js";
import type { IssuerContext } from "../types/context.types.js";
import { SiiCafError } from "../errors/sii-errors.js";

/**
 * Interfaz que debe implementar el consumidor (ej. NestJS) para proveer
 * acceso concurrente y seguro a la asignación de folios.
 */
export interface FolioProvider {
  /**
   * Obtiene y asigna el siguiente folio disponible de forma atómica y transaccional.
   * Si no quedan folios o están expirados, debe lanzar SiiCafError.
   *
   * @param context Contexto fiscal del emisor
   * @param tipoDTE Tipo de documento para el cual se requiere el folio
   */
  getNextFolio(context: IssuerContext, tipoDTE: TipoDTE): Promise<FolioAssignment>;

  /**
   * Reserva un folio específico para un documento (por ejemplo si ya se había asignado antes y se está regenerando).
   *
   * @param context Contexto fiscal del emisor
   * @param tipoDTE Tipo de documento
   * @param folio Folio específico a reservar
   */
  reserveFolio(context: IssuerContext, tipoDTE: TipoDTE, folio: number): Promise<FolioAssignment>;

  /**
   * Obtiene el estado de los folios (cuántos quedan, si están por expirar, etc).
   * Útil para monitoreo y alertas.
   *
   * @param context Contexto fiscal del emisor
   * @param tipoDTE Opcional, si no se envía devuelve el estado de todos los tipos de DTE
   */
  getStatus(context: IssuerContext, tipoDTE?: TipoDTE): Promise<CafWithStatus[]>;
}
