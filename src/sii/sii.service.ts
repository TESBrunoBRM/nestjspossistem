import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import FormData from 'form-data';
import { EmitirBoletaDto } from './dto/emitir-boleta.dto';
import { EmitirFacturaDto } from './dto/emitir-factura.dto';

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
  ): Promise<unknown> {
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
  ): Promise<unknown> {
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
  ): Promise<unknown> {
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
  ): Promise<unknown> {
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
  // HELPERS PRIVADOS
  // ─────────────────────────────────────────────────────────────────────────

  /** Construye el JSON de Documento para una Boleta */
  private buildDocumentoBoleta(dto: EmitirBoletaDto): object {
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
  private buildDocumentoFactura(dto: EmitirFacturaDto): object {
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

  /** Ejecuta la llamada a SimpleAPI con FormData */
  private async callSimpleApi(endpoint: string, form: FormData): Promise<unknown> {
    try {
      const response = await this.http.post(endpoint, form, {
        headers: {
          ...form.getHeaders(),
          Authorization: this.apiKey,
        },
      });
      return response.data;
    } catch (error: unknown) {
      const axiosError = error as {
        response?: { data: unknown; status: number };
        message?: string;
      };
      this.logger.error(
        `Error llamando SimpleAPI [${endpoint}]`,
        axiosError?.response?.data ?? axiosError?.message,
      );
      throw new HttpException(
        {
          message: 'Error al comunicarse con SimpleAPI',
          details: axiosError?.response?.data ?? axiosError?.message,
          endpoint,
        },
        axiosError?.response?.status ?? HttpStatus.BAD_GATEWAY,
      );
    }
  }
}
