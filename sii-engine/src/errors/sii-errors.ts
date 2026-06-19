export type SiiErrorCode =
  | "AUTH_SEED_FAILED"
  | "AUTH_TOKEN_FAILED"
  | "AUTH_TOKEN_EXPIRED"
  | "CAF_PARSE_ERROR"
  | "CAF_EXHAUSTED"
  | "CAF_EXPIRED"
  | "CAF_INVALID_RANGE"
  | "CAF_WRONG_TYPE"
  | "CERT_LOAD_ERROR"
  | "CERT_EXPIRED"
  | "CERT_INVALID"
  | "SIGN_FAILED"
  | "XML_BUILD_ERROR"
  | "SEND_FAILED"
  | "SEND_SCHEMA_REJECTED"
  | "SEND_CONTENT_REJECTED"
  | "QUERY_FAILED"
  | "FOLIO_NOT_AVAILABLE"
  | "VALIDATION_ERROR"
  | "NETWORK_ERROR"
  | "UNKNOWN";

export class SiiError extends Error {
  readonly code: SiiErrorCode;
  readonly detail?: string;
  readonly rawResponse?: string;

  constructor(
    code: SiiErrorCode,
    message: string,
    options?: { detail?: string; rawResponse?: string; cause?: Error }
  ) {
    super(message, { cause: options?.cause });
    this.name = "SiiError";
    this.code = code;
    this.detail = options?.detail;
    this.rawResponse = options?.rawResponse;
  }
}

export class SiiAuthError extends SiiError {
  constructor(
    code: Extract<SiiErrorCode, "AUTH_SEED_FAILED" | "AUTH_TOKEN_FAILED" | "AUTH_TOKEN_EXPIRED">,
    message: string,
    options?: { detail?: string; rawResponse?: string; cause?: Error }
  ) {
    super(code, message, options);
    this.name = "SiiAuthError";
  }
}

export class SiiCafError extends SiiError {
  constructor(
    code: Extract<SiiErrorCode, "CAF_PARSE_ERROR" | "CAF_EXHAUSTED" | "CAF_EXPIRED" | "CAF_INVALID_RANGE" | "CAF_WRONG_TYPE">,
    message: string,
    options?: { detail?: string; cause?: Error }
  ) {
    super(code, message, options);
    this.name = "SiiCafError";
  }
}

export class SiiCertError extends SiiError {
  constructor(
    code: Extract<SiiErrorCode, "CERT_LOAD_ERROR" | "CERT_EXPIRED" | "CERT_INVALID">,
    message: string,
    options?: { detail?: string; cause?: Error }
  ) {
    super(code, message, options);
    this.name = "SiiCertError";
  }
}

export class SiiSignError extends SiiError {
  constructor(message: string, options?: { detail?: string; cause?: Error }) {
    super("SIGN_FAILED", message, options);
    this.name = "SiiSignError";
  }
}

export class SiiSendError extends SiiError {
  constructor(
    code: Extract<SiiErrorCode, "SEND_FAILED" | "SEND_SCHEMA_REJECTED" | "SEND_CONTENT_REJECTED">,
    message: string,
    options?: { detail?: string; rawResponse?: string; cause?: Error }
  ) {
    super(code, message, options);
    this.name = "SiiSendError";
  }
}

export class SiiValidationError extends SiiError {
  readonly fields?: Record<string, string>;

  constructor(
    message: string,
    options?: { fields?: Record<string, string>; cause?: Error }
  ) {
    super("VALIDATION_ERROR", message, { cause: options?.cause });
    this.name = "SiiValidationError";
    this.fields = options?.fields;
  }
}

export function isSiiError(err: unknown): err is SiiError {
  return err instanceof SiiError;
}
