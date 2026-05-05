import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import FormData from 'form-data';
import { EmitirBoletaDto } from './dto/emitir-boleta.dto';
import { EmitirFacturaDto } from './dto/emitir-factura.dto';
import { EmitirNotaCreditoDto } from './dto/emitir-nota-credito.dto';
import { RvdRequestDto } from './dto/utilidades-rvd.dto';
import { SobreEnvioRequestDto } from './dto/utilidades-sobre-envio.dto';
import { TimbreRequestDto } from './dto/utilidades-timbre.dto';
import { MuestraImpresaRequestDto } from './dto/utilidades-muestra-impresa.dto';
import { FoliosRequestDto } from './dto/utilidades-folios.dto';
import type { SimpleApiResponse } from './interfaces/simpleapi-response.interface';
import { randomUUID } from 'crypto';

@Injectable()
export class SiiService {
  private readonly logger = new Logger(SiiService.name);
  private readonly http: AxiosInstance;
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly ambiente: number;

  constructor(private readonly configService: ConfigService) {
    this.baseUrl = this.configService.get<string>(
      'SIMPLEAPI_BASE_URL',
      'https://api.simpleapi.cl',
    );
    this.apiKey = this.configService.get<string>(
      'SIMPLEAPI_KEY',
      '',
    );
    this.ambiente = this.configService.get<number>('SIMPLEAPI_AMBIENTE', 0);

    this.http = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      headers: {
        Authorization: this.apiKey,
      },
    });

    this.logger.log(
      `SimpleAPI configurado → baseUrl: ${this.baseUrl} | ambiente: ${this.ambiente === 0 ? 'certificación' : 'producción'}`,
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // BOLETA ELECTRÓNICA (tipo 39)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Genera una Boleta Electrónica tipo 39 usando SimpleAPI.
   * Requiere archivos: certificado digital (.pfx) y CAF (.xml).
   *
   * @param dto  Datos del documento (emisor, receptor, ítems, totales)
   * @param certificadoFile  Archivo .pfx del certificado digital
   * @param cafFile  Archivo .xml de folios CAF autorizado por el SII
   */
  async emitirBoleta(
    dto: EmitirBoletaDto,
    certificadoFile: Express.Multer.File,
    cafFile: Express.Multer.File,
  ): Promise<SimpleApiResponse> {
    this.logger.log(`Emitiendo boleta folio=${dto.IdentificacionDTE.Folio}`);

    // Construir el payload JSON para el Documento
    const documento = this.buildDocumentoBoleta(dto);

    const form = new FormData();
    form.append('documento', JSON.stringify(documento));
    form.append('certificado', certificadoFile.buffer, {
      filename: certificadoFile.originalname,
      contentType: 'application/x-pkcs12',
    });
    form.append('caf', cafFile.buffer, {
      filename: cafFile.originalname,
      contentType: 'application/xml',
    });

    return this.callSimpleApi('/api/v1/dte/boleta', form);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // FACTURA ELECTRÓNICA (tipo 33)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Genera una Factura Electrónica tipo 33 usando SimpleAPI.
   * Requiere archivos: certificado digital (.pfx) y CAF (.xml).
   *
   * @param dto  Datos del documento (emisor, receptor, ítems, totales)
   * @param certificadoFile  Archivo .pfx del certificado digital
   * @param cafFile  Archivo .xml de folios CAF autorizado por el SII
   */
  async emitirFactura(
    dto: EmitirFacturaDto,
    certificadoFile: Express.Multer.File,
    cafFile: Express.Multer.File,
  ): Promise<SimpleApiResponse> {
    this.logger.log(`Emitiendo factura folio=${dto.IdentificacionDTE.Folio}`);

    const documento = this.buildDocumentoFactura(dto);

    const form = new FormData();
    form.append('documento', JSON.stringify(documento));
    form.append('certificado', certificadoFile.buffer, {
      filename: certificadoFile.originalname,
      contentType: 'application/x-pkcs12',
    });
    form.append('caf', cafFile.buffer, {
      filename: cafFile.originalname,
      contentType: 'application/xml',
    });

    return this.callSimpleApi('/api/v1/dte/documento', form);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CONSULTA DE ESTADO (por TrackID)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Consulta el estado de un envío al SII usando el TrackID.
   */
  async consultarEstadoEnvio(
    rutEmpresa: string,
    trackId: string,
    certificadoFile: Express.Multer.File,
    rutCertificado: string,
    passwordCertificado: string,
  ): Promise<SimpleApiResponse> {
    this.logger.log(`Consultando estado trackId=${trackId}`);

    const jsonData = {
      Certificado: { Rut: rutCertificado, Password: passwordCertificado },
      RutEmpresa: rutEmpresa,
      TrackId: trackId,
      Ambiente: this.ambiente,
      ServidorBoletaREST: false,
    };

    const form = new FormData();
    form.append('datos', JSON.stringify(jsonData));
    form.append('certificado', certificadoFile.buffer, {
      filename: certificadoFile.originalname,
      contentType: 'application/x-pkcs12',
    });

    return this.callSimpleApi('/api/v1/dte/estado_envio', form);
  }

  /**
   * Consulta el estado de un DTE individual directamente en el SII.
   */
  async consultarEstadoDte(
    rutEmpresa: string,
    rutReceptor: string,
    folio: number,
    tipoDte: number,
    total: number,
    fechaDte: string,
    certificadoFile: Express.Multer.File,
    rutCertificado: string,
    passwordCertificado: string,
  ): Promise<SimpleApiResponse> {
    this.logger.log(
      `Consultando estado DTE folio=${folio} tipo=${tipoDte}`,
    );

    const jsonData = {
      Certificado: { Rut: rutCertificado, Password: passwordCertificado },
      RutEmpresa: rutEmpresa,
      RutReceptor: rutReceptor,
      Folio: folio,
      Tipo: tipoDte,
      Total: total,
      FechaDTE: fechaDte,
      Ambiente: this.ambiente,
      ServidorBoletaREST: tipoDte === 39 || tipoDte === 41,
    };

    const form = new FormData();
    form.append('datos', JSON.stringify(jsonData));
    form.append('certificado', certificadoFile.buffer, {
      filename: certificadoFile.originalname,
      contentType: 'application/x-pkcs12',
    });

    return this.callSimpleApi('/api/v1/dte/estado_dte', form);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // HEALTH CHECK
  // ─────────────────────────────────────────────────────────────────────────

  async healthCheck(): Promise<{ status: string; url: string; ambiente: string }> {
    try {
      await this.http.get('/');
      return {
        status: 'ok',
        url: this.baseUrl,
        ambiente: this.ambiente === 0 ? 'certificación' : 'producción',
      };
    } catch {
      return {
        status: 'unreachable',
        url: this.baseUrl,
        ambiente: this.ambiente === 0 ? 'certificación' : 'producción',
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // NUEVAS FUNCIONALIDADES SOLICITADAS
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Genera una Nota de Crédito (tipo 61) usando SimpleAPI.
   * La estructura de datos esperada es la misma que una factura,
   * pero con exigencia en el arreglo de Referencias.
   */
  async emitirNotaCredito(
    dto: EmitirNotaCreditoDto,
    certificadoFile: Express.Multer.File,
    cafFile: Express.Multer.File,
  ): Promise<SimpleApiResponse> {
    this.logger.log(`Emitiendo Nota de Crédito folio=${dto.IdentificacionDTE.Folio}`);

    // Nota de crédito usa la misma estructura base de documento que la factura
    const documento = this.buildDocumentoFactura(dto as unknown as EmitirFacturaDto);

    const form = new FormData();
    form.append('documento', JSON.stringify(documento));
    form.append('certificado', certificadoFile.buffer, {
      filename: certificadoFile.originalname,
      contentType: 'application/x-pkcs12',
    });
    form.append('caf', cafFile.buffer, {
      filename: cafFile.originalname,
      contentType: 'application/xml',
    });

    // Usa el mismo endpoint de envío de documentos genéricos para B2B
    return this.callSimpleApi('/api/v1/dte/documento', form);
  }

  /**
   * Genera el sobre de envío al SII de los comprobantes.
   * Algunas versiones de SimpleAPI realizan esto automáticamente, 
   * pero se expone en caso de usarse el endpoint explícito.
   */
  async generarSobreEnvio(
    datosEnvio: SobreEnvioRequestDto,
    certificadoFile: Express.Multer.File,
  ): Promise<SimpleApiResponse> {
    this.logger.log('Generando sobre de envío SII');
    const form = new FormData();
    form.append('datos', JSON.stringify(datosEnvio));
    form.append('certificado', certificadoFile.buffer, {
      filename: certificadoFile.originalname,
      contentType: 'application/x-pkcs12',
    });
    return this.callSimpleApi('/api/v1/dte/sobre_envio', form);
  }

  /**
   * Genera el Registro de Ventas Diarias (RVD / RCOF).
   */
  async generarRvd(
    datosRvd: RvdRequestDto,
    certificadoFile: Express.Multer.File,
  ): Promise<SimpleApiResponse> {
    this.logger.log('Generando RVD');
    const form = new FormData();
    form.append('datos', JSON.stringify(datosRvd));
    form.append('certificado', certificadoFile.buffer, {
      filename: certificadoFile.originalname,
      contentType: 'application/x-pkcs12',
    });
    return this.callSimpleApi('/api/v1/dte/rvd', form);
  }

  /**
   * Obtiene la imagen del timbre (PDF417) de un documento específico.
   */
  async obtenerTimbre(datosTimbre: TimbreRequestDto): Promise<SimpleApiResponse> {
    this.logger.log('Solicitando imagen del timbre TED');
    const form = new FormData();
    form.append('datos', JSON.stringify(datosTimbre));
    return this.callSimpleApi('/api/v1/dte/timbre', form);
  }

  /**
   * Obtiene la muestra impresa (PDF) de un DTE.
   */
  async obtenerMuestraImpresa(datosImpresion: MuestraImpresaRequestDto): Promise<SimpleApiResponse> {
    this.logger.log('Solicitando generación de PDF Muestra Impresa');
    const form = new FormData();
    form.append('datos', JSON.stringify(datosImpresion));
    return this.callSimpleApi('/api/v1/dte/pdf', form);
  }

  /**
   * Validador de esquema de DTE o Sobre.
   */
  async validarDte(xmlBase64: string): Promise<SimpleApiResponse> {
    this.logger.log('Validando estructura de XML DTE');
    const form = new FormData();
    form.append('xml', xmlBase64);
    return this.callSimpleApi('/api/v1/dte/validar', form);
  }

  /**
   * Obtención de Folios (CAF) directo desde el SII a través de SimpleAPI.
   */
  async obtenerFolios(
    datosFolios: FoliosRequestDto,
    certificadoFile: Express.Multer.File,
  ): Promise<SimpleApiResponse> {
    this.logger.log('Solicitando descarga de Folios CAF al SII');
    const form = new FormData();
    form.append('datos', JSON.stringify(datosFolios));
    form.append('certificado', certificadoFile.buffer, {
      filename: certificadoFile.originalname,
      contentType: 'application/x-pkcs12',
    });
    return this.callSimpleApi('/api/v1/dte/caf', form);
  }

  /**
   * Obtener datos de empresa o contribuyente por RUT.
   * Utiliza SimpleAPI para obtener la Razón Social y otros datos.
   */
  async obtenerDatosEmpresa(rut: string): Promise<SimpleApiResponse> {
    this.logger.log(`Obteniendo datos de empresa para RUT: ${rut}`);
    return this.callSimpleApiGet(`/api/v1/sii/datos_empresa/${rut}`);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // HELPERS PRIVADOS
  // ─────────────────────────────────────────────────────────────────────────

  /** Construye el JSON de Documento para una Boleta */
  private buildDocumentoBoleta(dto: EmitirBoletaDto): Record<string, unknown> {
    return {
      Documento: {
        Encabezado: {
          IdentificacionDTE: {
            TipoDTE: dto.IdentificacionDTE.TipoDTE,
            Folio: dto.IdentificacionDTE.Folio,
            FechaEmision: dto.IdentificacionDTE.FechaEmision,
            ...(dto.IdentificacionDTE.IndicadorServicio !== undefined && {
              IndicadorServicio: dto.IdentificacionDTE.IndicadorServicio,
            }),
            ...(dto.IdentificacionDTE.IndicadorMontosNetosBoleta !== undefined && {
              IndicadorMontosNetosBoleta:
                dto.IdentificacionDTE.IndicadorMontosNetosBoleta,
            }),
          },
          Emisor: {
            Rut: dto.Emisor.Rut,
            RazonSocialBoleta: dto.Emisor.RazonSocialBoleta,
            GiroBoleta: dto.Emisor.GiroBoleta,
            DireccionOrigen: dto.Emisor.DireccionOrigen,
            ComunaOrigen: dto.Emisor.ComunaOrigen,
          },
          Receptor: {
            Rut: dto.Receptor.Rut,
            ...(dto.Receptor.RazonSocial && {
              RazonSocial: dto.Receptor.RazonSocial,
            }),
            ...(dto.Receptor.Direccion && {
              Direccion: dto.Receptor.Direccion,
            }),
            ...(dto.Receptor.Comuna && { Comuna: dto.Receptor.Comuna }),
            ...(dto.Receptor.Ciudad && { Ciudad: dto.Receptor.Ciudad }),
            ...(dto.Receptor.Contacto && {
              Contacto: dto.Receptor.Contacto,
            }),
          },
          Totales: {
            MontoTotal: dto.Totales.MontoTotal,
            ...(dto.Totales.MontoNeto !== undefined && {
              MontoNeto: dto.Totales.MontoNeto,
            }),
            ...(dto.Totales.IVA !== undefined && { IVA: dto.Totales.IVA }),
            ...(dto.Totales.MontoExento !== undefined && {
              MontoExento: dto.Totales.MontoExento,
            }),
          },
        },
        Detalles: dto.Detalles.map((item, index) => ({
          NroLinDet: index + 1,
          Nombre: item.Nombre,
          Cantidad: item.Cantidad,
          Precio: item.Precio,
          MontoItem: item.MontoItem,
          ...(item.IndicadorExento !== undefined && {
            IndicadorExento: item.IndicadorExento,
          }),
          ...(item.Descuento !== undefined && {
            DescuentoMonto: item.Descuento,
          }),
          ...(item.Recargo !== undefined && {
            RecargoMonto: item.Recargo,
          }),
        })),
      },
      Certificado: {
        Rut: dto.Certificado.Rut,
        Password: dto.Certificado.Password,
      },
    };
  }

  /** Construye el JSON de Documento para una Factura */
  private buildDocumentoFactura(dto: EmitirFacturaDto): Record<string, unknown> {
    return {
      Documento: {
        Encabezado: {
          IdentificacionDTE: {
            TipoDTE: dto.IdentificacionDTE.TipoDTE,
            Folio: dto.IdentificacionDTE.Folio,
            FechaEmision: dto.IdentificacionDTE.FechaEmision,
            ...(dto.IdentificacionDTE.FormaPago !== undefined && {
              FormaPago: dto.IdentificacionDTE.FormaPago,
            }),
            ...(dto.IdentificacionDTE.MedioPago && {
              MedioPago: dto.IdentificacionDTE.MedioPago,
            }),
          },
          Emisor: {
            Rut: dto.Emisor.Rut,
            RazonSocial: dto.Emisor.RazonSocial,
            Giro: dto.Emisor.Giro,
            ...(dto.Emisor.ActividadEconomica !== undefined && {
              ActividadEconomica: dto.Emisor.ActividadEconomica,
            }),
            DireccionOrigen: dto.Emisor.DireccionOrigen,
            ComunaOrigen: dto.Emisor.ComunaOrigen,
            ...(dto.Emisor.CiudadOrigen && {
              CiudadOrigen: dto.Emisor.CiudadOrigen,
            }),
            ...(dto.Emisor.Telefono?.length && {
              Telefono: dto.Emisor.Telefono,
            }),
          },
          Receptor: {
            Rut: dto.Receptor.Rut,
            RazonSocial: dto.Receptor.RazonSocial,
            Direccion: dto.Receptor.Direccion,
            Comuna: dto.Receptor.Comuna,
            ...(dto.Receptor.Ciudad && { Ciudad: dto.Receptor.Ciudad }),
            ...(dto.Receptor.Giro && { Giro: dto.Receptor.Giro }),
            ...(dto.Receptor.Contacto && {
              Contacto: dto.Receptor.Contacto,
            }),
            ...(dto.Receptor.CorreoElectronico && {
              CorreoElectronico: dto.Receptor.CorreoElectronico,
            }),
          },
          Totales: {
            MontoTotal: dto.Totales.MontoTotal,
            MontoNeto: dto.Totales.MontoNeto,
            IVA: dto.Totales.IVA,
            TasaIVA: dto.Totales.TasaIVA ?? 19,
            ...(dto.Totales.MontoExento !== undefined && {
              MontoExento: dto.Totales.MontoExento,
            }),
          },
        },
        Detalles: dto.Detalles.map((item, index) => ({
          NroLinDet: index + 1,
          Nombre: item.Nombre,
          ...(item.Descripcion && { Descripcion: item.Descripcion }),
          Cantidad: item.Cantidad,
          Precio: item.Precio,
          MontoItem: item.MontoItem,
          ...(item.IndicadorExento !== undefined && {
            IndicadorExento: item.IndicadorExento,
          }),
          ...(item.Descuento !== undefined && {
            DescuentoMonto: item.Descuento,
          }),
          ...(item.Recargo !== undefined && {
            RecargoMonto: item.Recargo,
          }),
        })),
        ...(dto.Referencias?.length && {
          Referencias: dto.Referencias.map((ref, index) => ({
            NroLinRef: index + 1,
            TipoDocRef: ref.TipoDocumento,
            FolioRef: ref.FolioReferencia,
            FchRef: ref.FechaDocumentoReferencia,
            ...(ref.CodigoReferencia !== undefined && {
              CodRef: ref.CodigoReferencia,
            }),
            ...(ref.RazonReferencia && { RazonRef: ref.RazonReferencia }),
          })),
        }),
      },
      Certificado: {
        Rut: dto.Certificado.Rut,
        Password: dto.Certificado.Password,
      },
    };
  }

  /** Ejecuta la llamada a SimpleAPI con FormData (POST) */
  private async callSimpleApi(endpoint: string, form: FormData): Promise<SimpleApiResponse> {
    try {
      const response = await this.http.post(endpoint, form, {
        headers: {
          ...form.getHeaders(),
          Authorization: this.apiKey,
        },
      });
      return response.data as SimpleApiResponse;
    } catch (error: unknown) {
      this.handleApiError(error, endpoint);
    }
  }

  /** Ejecuta una llamada GET a SimpleAPI */
  private async callSimpleApiGet(
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

  /** Manejo centralizado de errores de Axios — sanitiza detalles internos */
  private handleApiError(error: unknown, endpoint: string): never {
    const errorId = randomUUID();
    const axiosError = error as {
      response?: { data: unknown; status: number };
      message?: string;
    };

    // Log interno completo para depuración (sin passwords)
    const sanitizedData = this.redactSensitiveFields(axiosError?.response?.data);
    this.logger.error(
      `[errorId=${errorId}] Error en SimpleAPI [${endpoint}]`,
      sanitizedData ?? axiosError?.message,
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

  /**
   * Redacta campos sensibles (passwords, claves) de un objeto
   * para logging seguro. No modifica el objeto original.
   */
  private redactSensitiveFields(data: unknown): unknown {
    if (!data || typeof data !== 'object') return data;

    const sensitiveKeys = ['password', 'Password', 'contraseña', 'apikey', 'Authorization'];
    const cloned = JSON.parse(JSON.stringify(data)) as Record<string, unknown>;

    const redact = (obj: Record<string, unknown>) => {
      for (const key of Object.keys(obj)) {
        if (sensitiveKeys.some((sk) => key.toLowerCase().includes(sk.toLowerCase()))) {
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
