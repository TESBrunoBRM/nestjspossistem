import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UploadedFiles,
  UseInterceptors,
  BadRequestException,
  Query,
  Logger,
  UseGuards,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { SiiService } from './sii.service';
import { EmitirBoletaDto } from './dto/emitir-boleta.dto';
import { EmitirFacturaDto } from './dto/emitir-factura.dto';
import { EmitirNotaCreditoDto } from './dto/emitir-nota-credito.dto';

/**
 * Controlador SII — Integración SimpleAPI
 *
 * Todos los endpoints que generan DTE reciben:
 *  - Body JSON con los datos del documento (como campo de form-data)
 *  - Archivo 'certificado' (.pfx) — Certificado digital de la empresa
 *  - Archivo 'caf' (.xml)         — Folios autorizados por el SII
 *
 * Ejemplo con curl:
 *  curl -X POST http://localhost:3000/sii/boleta \
 *    -F "datos={...JSON...}" \
 *    -F "certificado=@/ruta/certificado.pfx" \
 *    -F "caf=@/ruta/caf_39.xml"
 *    -H "x-api-key: TU_API_KEY"
 */
@UseGuards(ApiKeyGuard)
@Controller('sii')
export class SiiController {
  private readonly logger = new Logger(SiiController.name);

  constructor(private readonly siiService: SiiService) {}

  // ─────────────────────────────────────────────────────────────────────────
  // HEALTH CHECK
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * GET /sii/health
   * Verifica la configuración de la conexión con SimpleAPI.
   */
  @Get('health')
  async health() {
    return this.siiService.healthCheck();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // BOLETA ELECTRÓNICA (tipo 39)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * POST /sii/boleta
   * Emite una Boleta Electrónica (tipo 39) a través de SimpleAPI.
   *
   * Content-Type: multipart/form-data
   * Campos:
   *   - datos       (string JSON) → Datos de la boleta (EmitirBoletaDto)
   *   - certificado (file .pfx)  → Certificado digital
   *   - caf         (file .xml)  → Archivo CAF de folios tipo 39
   */
  @Post('boleta')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'certificado', maxCount: 1 },
        { name: 'caf', maxCount: 1 },
      ],
      { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } },
    ),
  )
  async emitirBoleta(
    @Body('datos') datosRaw: string,
    @UploadedFiles()
    files: {
      certificado?: Express.Multer.File[];
      caf?: Express.Multer.File[];
    },
  ) {
    // Validar presencia de archivos
    if (!files?.certificado?.[0]) {
      throw new BadRequestException(
        'Se requiere el archivo "certificado" (.pfx)',
      );
    }
    if (!files?.caf?.[0]) {
      throw new BadRequestException(
        'Se requiere el archivo "caf" (.xml) con los folios tipo 39',
      );
    }
    if (!datosRaw) {
      throw new BadRequestException(
        'Se requiere el campo "datos" con el JSON de la boleta',
      );
    }

    let dto: EmitirBoletaDto;
    try {
      dto = JSON.parse(datosRaw) as EmitirBoletaDto;
    } catch {
      throw new BadRequestException(
        'El campo "datos" no es un JSON válido',
      );
    }

    this.logger.log(
      `[POST /sii/boleta] Folio=${dto.IdentificacionDTE?.Folio}`,
    );

    return this.siiService.emitirBoleta(
      dto,
      files.certificado[0],
      files.caf[0],
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // FACTURA ELECTRÓNICA (tipo 33)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * POST /sii/factura
   * Emite una Factura Electrónica (tipo 33) a través de SimpleAPI.
   *
   * Content-Type: multipart/form-data
   * Campos:
   *   - datos       (string JSON) → Datos de la factura (EmitirFacturaDto)
   *   - certificado (file .pfx)  → Certificado digital
   *   - caf         (file .xml)  → Archivo CAF de folios tipo 33
   */
  @Post('factura')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'certificado', maxCount: 1 },
        { name: 'caf', maxCount: 1 },
      ],
      { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } },
    ),
  )
  async emitirFactura(
    @Body('datos') datosRaw: string,
    @UploadedFiles()
    files: {
      certificado?: Express.Multer.File[];
      caf?: Express.Multer.File[];
    },
  ) {
    if (!files?.certificado?.[0]) {
      throw new BadRequestException(
        'Se requiere el archivo "certificado" (.pfx)',
      );
    }
    if (!files?.caf?.[0]) {
      throw new BadRequestException(
        'Se requiere el archivo "caf" (.xml) con los folios tipo 33',
      );
    }
    if (!datosRaw) {
      throw new BadRequestException(
        'Se requiere el campo "datos" con el JSON de la factura',
      );
    }

    let dto: EmitirFacturaDto;
    try {
      dto = JSON.parse(datosRaw) as EmitirFacturaDto;
    } catch {
      throw new BadRequestException(
        'El campo "datos" no es un JSON válido',
      );
    }

    this.logger.log(
      `[POST /sii/factura] Folio=${dto.IdentificacionDTE?.Folio}`,
    );

    return this.siiService.emitirFactura(
      dto,
      files.certificado[0],
      files.caf[0],
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CONSULTA DE ESTADO POR TRACKID
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * POST /sii/estado-envio/:trackId
   * Consulta el estado de un envío al SII usando el TrackID.
   *
   * Content-Type: multipart/form-data
   * Campos:
   *   - rutEmpresa       (string) → RUT de la empresa emisora (sin puntos, con guión)
   *   - rutCertificado   (string) → RUT del certificado
   *   - passwordCertificado (string) → Contraseña del certificado
   *   - certificado      (file .pfx) → Certificado digital
   */
  @Post('estado-envio/:trackId')
  @UseInterceptors(
    FileFieldsInterceptor(
      [{ name: 'certificado', maxCount: 1 }],
      { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } },
    ),
  )
  async consultarEstadoEnvio(
    @Param('trackId') trackId: string,
    @Body('rutEmpresa') rutEmpresa: string,
    @Body('rutCertificado') rutCertificado: string,
    @Body('passwordCertificado') passwordCertificado: string,
    @UploadedFiles() files: { certificado?: Express.Multer.File[] },
  ) {
    if (!files?.certificado?.[0]) {
      throw new BadRequestException('Se requiere el archivo "certificado" (.pfx)');
    }
    if (!rutEmpresa || !rutCertificado || !passwordCertificado) {
      throw new BadRequestException(
        'Se requieren los campos: rutEmpresa, rutCertificado, passwordCertificado',
      );
    }

    return this.siiService.consultarEstadoEnvio(
      rutEmpresa,
      trackId,
      files.certificado[0],
      rutCertificado,
      passwordCertificado,
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CONSULTA DE ESTADO DE UN DTE INDIVIDUAL
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * POST /sii/estado-dte
   * Consulta el estado de un DTE individual en el SII.
   *
   * Query params: rutEmpresa, rutReceptor, folio, tipoDte, total, fechaDte
   * Archivos: certificado (.pfx)
   * Body: rutCertificado, passwordCertificado
   */
  @Post('estado-dte')
  @UseInterceptors(
    FileFieldsInterceptor(
      [{ name: 'certificado', maxCount: 1 }],
      { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } },
    ),
  )
  async consultarEstadoDte(
    @Query('rutEmpresa') rutEmpresa: string,
    @Query('rutReceptor') rutReceptor: string,
    @Query('folio') folio: string,
    @Query('tipoDte') tipoDte: string,
    @Query('total') total: string,
    @Query('fechaDte') fechaDte: string,
    @Body('rutCertificado') rutCertificado: string,
    @Body('passwordCertificado') passwordCertificado: string,
    @UploadedFiles() files: { certificado?: Express.Multer.File[] },
  ) {
    if (!files?.certificado?.[0]) {
      throw new BadRequestException('Se requiere el archivo "certificado" (.pfx)');
    }

    return this.siiService.consultarEstadoDte(
      rutEmpresa,
      rutReceptor,
      parseInt(folio, 10),
      parseInt(tipoDte, 10),
      parseInt(total, 10),
      fechaDte,
      files.certificado[0],
      rutCertificado,
      passwordCertificado,
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // NOTA DE CRÉDITO (tipo 61) / DÉBITO (tipo 56)
  // ─────────────────────────────────────────────────────────────────────────

  @Post('nota-credito')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'certificado', maxCount: 1 },
        { name: 'caf', maxCount: 1 },
      ],
      { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } },
    ),
  )
  async emitirNotaCredito(
    @Body('datos') datosRaw: string,
    @UploadedFiles()
    files: {
      certificado?: Express.Multer.File[];
      caf?: Express.Multer.File[];
    },
  ) {
    if (!files?.certificado?.[0]) throw new BadRequestException('Se requiere archivo "certificado" (.pfx)');
    if (!files?.caf?.[0]) throw new BadRequestException('Se requiere archivo "caf" (.xml)');
    if (!datosRaw) throw new BadRequestException('Se requiere el campo "datos" JSON');

    let dto: EmitirNotaCreditoDto;
    try {
      dto = JSON.parse(datosRaw) as EmitirNotaCreditoDto;
    } catch {
      throw new BadRequestException('El campo "datos" no es un JSON válido');
    }

    return this.siiService.emitirNotaCredito(dto, files.certificado[0], files.caf[0]);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // GENERAR SOBRE ENVÍO
  // ─────────────────────────────────────────────────────────────────────────

  @Post('sobre-envio')
  @UseInterceptors(FileFieldsInterceptor([{ name: 'certificado', maxCount: 1 }], { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }))
  async generarSobreEnvio(
    @Body('datos') datosRaw: string,
    @UploadedFiles() files: { certificado?: Express.Multer.File[] },
  ) {
    if (!files?.certificado?.[0]) throw new BadRequestException('Se requiere "certificado" (.pfx)');
    if (!datosRaw) throw new BadRequestException('Se requiere el campo "datos" JSON');
    return this.siiService.generarSobreEnvio(JSON.parse(datosRaw), files.certificado[0]);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // GENERAR REGISTRO VENTAS DIARIAS (RVD / RCOF)
  // ─────────────────────────────────────────────────────────────────────────

  @Post('rvd')
  @UseInterceptors(FileFieldsInterceptor([{ name: 'certificado', maxCount: 1 }], { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }))
  async generarRvd(
    @Body('datos') datosRaw: string,
    @UploadedFiles() files: { certificado?: Express.Multer.File[] },
  ) {
    if (!files?.certificado?.[0]) throw new BadRequestException('Se requiere "certificado" (.pfx)');
    if (!datosRaw) throw new BadRequestException('Se requiere el campo "datos" JSON');
    return this.siiService.generarRvd(JSON.parse(datosRaw), files.certificado[0]);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TIMBRE ELECTRÓNICO (PDF417)
  // ─────────────────────────────────────────────────────────────────────────

  @Post('timbre')
  async obtenerTimbre(@Body('datos') datos: any) {
    if (!datos) throw new BadRequestException('Se requieren datos para generar el timbre');
    return this.siiService.obtenerTimbre(datos);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // MUESTRA IMPRESA (PDF)
  // ─────────────────────────────────────────────────────────────────────────

  @Post('muestra-impresa')
  async obtenerMuestraImpresa(@Body('datos') datos: any) {
    if (!datos) throw new BadRequestException('Se requieren datos para el PDF');
    // SimpleAPI retorna un success con un Base64 que se entregará al cliente.
    return this.siiService.obtenerMuestraImpresa(datos);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // VALIDADOR DE DTE / SOBRE
  // ─────────────────────────────────────────────────────────────────────────

  @Post('validador')
  async validarDte(@Body('xml') xmlBase64: string) {
    if (!xmlBase64) throw new BadRequestException('Se requiere base64 en variable "xml"');
    return this.siiService.validarDte(xmlBase64);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // OBTENCIÓN DE FOLIOS (CAF)
  // ─────────────────────────────────────────────────────────────────────────

  @Post('folios')
  @UseInterceptors(FileFieldsInterceptor([{ name: 'certificado', maxCount: 1 }], { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }))
  async obtenerFolios(
    @Body('datos') datosRaw: string,
    @UploadedFiles() files: { certificado?: Express.Multer.File[] },
  ) {
    if (!files?.certificado?.[0]) throw new BadRequestException('Se requiere "certificado" (.pfx)');
    if (!datosRaw) throw new BadRequestException('Se requiere el campo "datos" JSON');
    return this.siiService.obtenerFolios(JSON.parse(datosRaw), files.certificado[0]);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // OBTENCIÓN DE DATOS DEL NEGOCIO / EMPRESA
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * GET /sii/contribuyente/:rut
   * Obtiene datos del negocio por RUT (Razón Social, etc.)
   */
  @Get('contribuyente/:rut')
  async obtenerDatosEmpresa(@Param('rut') rut: string) {
    if (!rut) throw new BadRequestException('Se requiere el RUT');
    return this.siiService.obtenerDatosEmpresa(rut);
  }
}
