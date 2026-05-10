import { Injectable, Logger } from '@nestjs/common';
import FormData from 'form-data';
import { EmitirNotaCreditoDto } from '../../../dto/emitir-nota-credito.dto';
import { SiiService } from '../../../sii.service';

@Injectable()
export class NotasCreditoService {
  private readonly logger = new Logger(NotasCreditoService.name);

  constructor(private readonly siiService: SiiService) {}

  emitir(
    dto: EmitirNotaCreditoDto,
    certificadoFile: Express.Multer.File,
    cafFile: Express.Multer.File,
  ) {
    this.logger.log(
      `Emitiendo Nota de Crédito folio=${dto.IdentificacionDTE.Folio}`,
    );

    const form = new FormData();
    form.append('documento', JSON.stringify(this.buildDocumento(dto)));
    form.append('certificado', certificadoFile.buffer, {
      filename: certificadoFile.originalname,
      contentType: 'application/x-pkcs12',
    });
    form.append('caf', cafFile.buffer, {
      filename: cafFile.originalname,
      contentType: 'application/xml',
    });

    return this.siiService.postForm('/api/v1/dte/documento', form);
  }

  private buildDocumento(dto: EmitirNotaCreditoDto): Record<string, unknown> {
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
}
