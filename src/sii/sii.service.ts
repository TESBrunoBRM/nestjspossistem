import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosError, AxiosInstance, AxiosRequestConfig } from 'axios';
import FormData from 'form-data';
import type { SimpleApiResponse } from './interfaces/simpleapi-response.interface';
import { randomUUID } from 'crypto';

@Injectable()
export class SiiService {
  private readonly logger = new Logger(SiiService.name);
  private readonly http: AxiosInstance;
  private readonly baseUrl: string;
  private readonly foliosBaseUrl: string;
  private readonly apiKey: string;
  private readonly ambiente: number;

  constructor(private readonly configService: ConfigService) {
    this.baseUrl = this.configService.get<string>(
      'SIMPLEAPI_BASE_URL',
      'https://api.simpleapi.cl',
    );
    this.foliosBaseUrl = this.configService.get<string>(
      'SIMPLEAPI_FOLIOS_BASE_URL',
      'https://servicios.simpleapi.cl',
    );
    this.apiKey = this.configService.get<string>('SIMPLEAPI_KEY', '');
    this.ambiente = Number(
      this.configService.get<number>('SIMPLEAPI_AMBIENTE', 0),
    );

    this.http = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      headers: {
        Authorization: this.apiKey,
      },
    });

    this.logger.log(
      `SimpleAPI configurado → baseUrl: ${this.baseUrl} | foliosBaseUrl: ${this.foliosBaseUrl} | ambiente: ${this.ambiente === 0 ? 'certificación' : 'producción'}`,
    );
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  getFoliosBaseUrl(): string {
    return this.foliosBaseUrl;
  }

  getAmbiente(): number {
    return this.ambiente;
  }

  getAmbienteLabel(): string {
    return this.ambiente === 0 ? 'certificación' : 'producción';
  }

  async postForm(
    endpoint: string,
    form: FormData,
    requestConfig: Pick<
      AxiosRequestConfig,
      'baseURL' | 'responseType' | 'timeout'
    > = {},
  ): Promise<SimpleApiResponse> {
    try {
      const response = await this.http.post(endpoint, form, {
        headers: {
          ...form.getHeaders(),
          Authorization: this.apiKey,
        },
        ...requestConfig,
      });
      return response.data as SimpleApiResponse;
    } catch (error: unknown) {
      this.handleApiError(error, endpoint);
    }
  }

  async get(
    endpoint: string,
    params?: Record<string, string | number>,
  ): Promise<SimpleApiResponse> {
    try {
      const response = await this.http.get(endpoint, {
        params,
        headers: { Authorization: this.apiKey },
      });
      return response.data as SimpleApiResponse;
    } catch (error: unknown) {
      this.handleApiError(error, endpoint);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // HELPERS PRIVADOS
  // ─────────────────────────────────────────────────────────────────────────

  /** Manejo centralizado de errores de Axios — sanitiza detalles internos */
  private handleApiError(error: unknown, endpoint: string): never {
    const errorId = randomUUID();
    const axiosError = error as AxiosError;

    // Log interno completo para depuración (sin passwords)
    const sanitizedError = this.buildSanitizedErrorLog(axiosError, endpoint);
    this.logger.error(
      `[errorId=${errorId}] Error en SimpleAPI [${endpoint}]`,
      JSON.stringify(sanitizedError, null, 2),
    );

    // Respuesta pública: NO filtrar datos internos de SimpleAPI
    const status = axiosError?.response?.status ?? HttpStatus.BAD_GATEWAY;
    const publicMessage =
      status >= 500
        ? 'Error interno del servicio SimpleAPI. Intente nuevamente.'
        : 'Error al procesar la solicitud con SimpleAPI.';

    throw new HttpException(
      {
        message: publicMessage,
        errorId,
        endpoint,
      },
      status,
    );
  }

  private buildSanitizedErrorLog(
    error: AxiosError,
    endpoint: string,
  ): Record<string, unknown> {
    const requestConfig = error.config;
    const method = requestConfig?.method?.toUpperCase() ?? 'UNKNOWN';
    const baseUrl = requestConfig?.baseURL ?? this.baseUrl;
    const requestUrl = requestConfig?.url ?? endpoint;

    return {
      endpoint,
      method,
      url: `${baseUrl}${requestUrl}`,
      message: error.message,
      code: error.code,
      status: error.response?.status,
      statusText: error.response?.statusText,
      request: {
        baseURL: baseUrl,
        url: requestUrl,
        params: this.redactSensitiveFields(requestConfig?.params),
        headers: this.redactSensitiveFields(requestConfig?.headers),
        data: this.redactSensitiveFields(
          this.parseAxiosPayload(requestConfig?.data),
        ),
        timeout: requestConfig?.timeout,
      },
      response: {
        headers: this.redactSensitiveFields(error.response?.headers),
        data: this.redactSensitiveFields(error.response?.data),
      },
      stack: error.stack,
    };
  }

  private parseAxiosPayload(data: unknown): unknown {
    if (data instanceof FormData) {
      return '[FormData omitted from logs]';
    }

    if (typeof data !== 'string') {
      return data;
    }

    try {
      return JSON.parse(data) as unknown;
    } catch {
      return data;
    }
  }

  /**
   * Redacta campos sensibles (passwords, claves) de un objeto
   * para logging seguro. No modifica el objeto original.
   */
  private redactSensitiveFields(data: unknown): unknown {
    if (!data || typeof data !== 'object') return data;

    const sensitiveKeys = [
      'password',
      'Password',
      'contraseña',
      'apikey',
      'Authorization',
    ];
    const cloned = JSON.parse(JSON.stringify(data)) as Record<string, unknown>;

    const redact = (obj: Record<string, unknown>) => {
      for (const key of Object.keys(obj)) {
        if (
          sensitiveKeys.some((sk) =>
            key.toLowerCase().includes(sk.toLowerCase()),
          )
        ) {
          obj[key] = '[REDACTED]';
        } else if (typeof obj[key] === 'object' && obj[key] !== null) {
          redact(obj[key] as Record<string, unknown>);
        }
      }
    };

    redact(cloned);
    return cloned;
  }
}
