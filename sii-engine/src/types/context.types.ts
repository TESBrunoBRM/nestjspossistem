import { SiiEnvironment } from "./transport.types.js";

export interface IssuerContext {
  /**
   * Identificador del Tenant u organización en un sistema SaaS.
   */
  tenantId?: string;

  /**
   * Identificador del comercio (Merchant) dentro del Tenant.
   */
  merchantId?: string;

  /**
   * Identificador de la sucursal o caja dentro del comercio.
   */
  branchId?: string;

  /**
   * Entorno del SII a utilizar (Certificacion o Produccion).
   */
  environment: SiiEnvironment;

  /**
   * RUT del Emisor (sin DV o con DV, pero el sistema suele separar).
   * Se recomienda sin DV y con guión si se usa completo, pero ideal solo cuerpo, depende del sistema.
   * Usualmente el SII usa "12345678-9".
   */
  rutEmisor: string;

  /**
   * Fecha de la resolución SII autorizando al emisor (YYYY-MM-DD).
   */
  fechaResolucion: string;

  /**
   * Número de resolución SII.
   */
  nroResolucion: number;

  /**
   * Referencia segura al certificado (PFX o PEM) en el Vault/KMS/DB.
   */
  certificateRef?: string;

  /**
   * Fingerprint SHA-256 esperado del certificado, usado por el host para
   * validar que el material de firma resuelto coincide con el emisor.
   */
  certificateFingerprint?: string;

  /**
   * Metadata o secretos adicionales necesarios por el backend para resolver firmas.
   */
  secrets?: Record<string, unknown>;
}
