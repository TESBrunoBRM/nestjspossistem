import type { CafMaterial } from "../types/caf.types.js";
import type { TipoDTE } from "../types/dte.types.js";
import type { IssuerContext } from "../types/context.types.js";

/**
 * Interfaz que debe implementar el consumidor (ej. NestJS) para proveer
 * acceso seguro a la información del CAF (Código de Autorización de Folios).
 * Permite mantener los CAFs encriptados en base de datos o KMS y obtenerlos solo
 * al momento de firmar.
 */
export interface CafProvider {
  /**
   * Obtiene la data del CAF válida para el tipo de DTE y el contexto solicitados.
   * Debe descifrar el CAF (si está cifrado) y devolver el objeto parseado listo para usar.
   *
   * @param context Contexto fiscal del emisor
   * @param tipoDTE Tipo de documento
   */
  getCaf(context: IssuerContext, tipoDTE: TipoDTE): Promise<CafMaterial>;
}
