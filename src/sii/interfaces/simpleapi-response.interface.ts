/**
 * Respuesta genérica de SimpleAPI
 */
export interface SimpleApiResponse<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
  error?: string;
}

/**
 * Respuesta de generación de DTE (boleta o factura)
 * SimpleAPI devuelve el XML del DTE timbrado y firmado
 */
export interface DteGeneradoResponse {
  /** XML del DTE timbrado y firmado en base64 o como string */
  xml?: string;
  /** Folio utilizado */
  folio?: number;
  /** Tipo de DTE (33, 39, etc.) */
  tipoDTE?: number;
  /** Rut del emisor */
  rutEmisor?: string;
}

/**
 * Respuesta del sobre de envío DTE al SII
 */
export interface SobreEnvioResponse {
  /** XML del sobre de envío */
  xmlSobre?: string;
}

/**
 * Respuesta del envío al SII
 */
export interface EnvioSiiResponse {
  /** TrackID asignado por el SII para seguimiento */
  trackId?: number | string;
  /** Mensaje de respuesta del SII */
  glosa?: string;
}

/**
 * Respuesta de consulta de estado al SII
 */
export interface EstadoEnvioResponse {
  /** Estado del envío: EPR, PDR, RSC, etc. */
  estado?: string;
  /** Glosa descriptiva del estado */
  glosa?: string;
  /** Número de documentos aceptados */
  aceptados?: number;
  /** Número de documentos rechazados */
  rechazados?: number;
  /** Detalle en XML */
  xmlRespuesta?: string;
}

/**
 * Respuesta de estado de un DTE individual
 */
export interface EstadoDteResponse {
  /** Estado del DTE: DOK, DNK, FAU, FNA, FAN, etc. */
  estado?: string;
  /** Glosa descriptiva */
  glosa?: string;
}

export interface TimbreResponse {
  /** Imagen del timbre en formato Base64 o string */
  timbreBase64?: string;
}

export interface MuestraImpresaResponse {
  /** Documento base64 en formato PDF */
  pdfBase64?: string;
}

export interface ValidadorResponse {
  /** Resultado de la validación estructural o esquema */
  valido: boolean;
  errores?: string[];
}

export interface FoliosResponse {
  /** Archivo CAF (Base64) */
  cafBase64?: string;
  /** Cantidad de folios disponibles */
  disponibles?: number;
}
