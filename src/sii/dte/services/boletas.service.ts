import { Injectable, Logger } from '@nestjs/common';
import FormData from 'form-data';
import { SiiService } from '../../sii.service';
import { EmitirBoletaDto } from '../../dto/emitir-boleta.dto';

@Injectable()
export class BoletasService {
  private readonly logger = new Logger(BoletasService.name);

  constructor(private readonly siiService: SiiService) {}

  emitir(
    dto: EmitirBoletaDto,
    certificadoFile: Express.Multer.File,
    cafFile: Express.Multer.File,
  ) {
    this.logger.log(`Emitiendo boleta folio=${dto.IdentificacionDTE.Folio}`);

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

    return this.siiService.postForm('/api/v1/dte/boleta', form);
  }

  private buildDocumento(dto: EmitirBoletaDto): Record<string, unknown> {
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
            ...(dto.IdentificacionDTE.IndicadorMontosNetosBoleta !==
              undefined && {
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
}
