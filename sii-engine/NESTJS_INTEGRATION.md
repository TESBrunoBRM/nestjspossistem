# Manual de Integración con NestJS (Multi-Tenant)

La librería `sii-engine` ha sido refactorizada para funcionar en entornos distribuidos y multi-tenant sin estado interno (`stateless`). A continuación se detalla paso a paso cómo inyectarla y usarla en un backend desarrollado con NestJS.

## 1. Instalación

Instala la librería desde el repositorio (o tu registry privado):

```bash
npm install sii-engine
```

## 2. Conceptos Clave

* **`IssuerContext`**: Es el objeto central que representa "en nombre de quién" se hace la operación. Incluye `tenantId`, `rutEmisor`, `certificateRef`, etc.
* **`SigningProvider`**: Contrato para extraer certificados P12/PEM (ej. desde AWS KMS, DB, etc.) dinámicamente según el `IssuerContext`.
* **`CafProvider`** y **`FolioProvider`**: Contratos para extraer y consumir CAFs/Folios en base de datos.
* **Clientes de Transporte (`LegacySiiClient` / `BoletaSiiClient`)**: Ya no almacenan el RUT ni el ambiente. El `IssuerContext` se pasa en cada método `.send()`.

## 3. Implementación de los Providers Obligatorios

Debes crear servicios en NestJS que cumplan las interfaces de la librería.

### 3.1. `SigningProvider` (Manejo de Certificados)

```typescript
import { Injectable } from '@nestjs/common';
import { SigningProvider, IssuerContext, CertificateMaterial, loadCertificateFromP12 } from 'sii-engine';
import { KmsService } from './kms.service'; // Tu servicio propio

@Injectable()
export class KmsSigningProvider implements SigningProvider {
  constructor(private readonly kms: KmsService) {}

  async getSigningMaterial(context: IssuerContext): Promise<CertificateMaterial> {
    // Buscar el P12 cifrado en KMS/Base de datos usando context.certificateRef
    const p12Buffer = await this.kms.getSecretBuffer(context.certificateRef);
    const password = await this.kms.getSecretPassword(context.certificateRef);

    // Cargar en la estructura de la librería
    return loadCertificateFromP12(p12Buffer, password);
  }
}
```

### 3.2. `FolioProvider` (Manejo de Folios Transaccional)

```typescript
import { Injectable } from '@nestjs/common';
import { FolioProvider, IssuerContext, TipoDTE, FolioAssignment, CafWithStatus } from 'sii-engine';
import { DataSource } from 'typeorm';
import { FolioEntity } from './entities/folio.entity';

@Injectable()
export class DatabaseFolioProvider implements FolioProvider {
  constructor(private dataSource: DataSource) {}

  async getNextFolio(context: IssuerContext, tipoDTE: TipoDTE): Promise<FolioAssignment> {
    // EJEMPLO CONCEPTUAL usando SELECT FOR UPDATE para evitar colisiones
    return await this.dataSource.transaction(async (manager) => {
      const dbFolio = await manager
        .createQueryBuilder(FolioEntity, 'f')
        .setLock('pessimistic_write')
        .where('f.rutEmisor = :rut', { rut: context.rutEmisor })
        .andWhere('f.tipoDTE = :tipo', { tipo: tipoDTE })
        .andWhere('f.usado = false')
        .orderBy('f.folio', 'ASC')
        .getOne();

      if (!dbFolio) throw new Error('Sin folios disponibles');

      dbFolio.usado = true;
      await manager.save(dbFolio);

      return {
        folio: dbFolio.folio,
        caf: dbFolio.cafMaterial, // Debe ser de tipo CafMaterial (con rsask)
        assignedAt: new Date()
      };
    });
  }

  async getStatus(context: IssuerContext, tipoDTE: TipoDTE): Promise<CafWithStatus[]> {
    // Retornar reportes de uso...
    return [];
  }
}
```

## 4. Configurar el Módulo SII en NestJS

Crea un módulo global (`SiiModule`) que provea y exporte las clases inyectadas.

```typescript
import { Module, Global } from '@nestjs/common';
import {
  SiiTokenManager,
  LegacySiiClient,
  BoletaSiiClient
} from 'sii-engine';
import { KmsSigningProvider } from './kms-signing.provider';
import { DatabaseFolioProvider } from './database-folio.provider';

@Global()
@Module({
  providers: [
    {
      provide: 'SigningProvider',
      useClass: KmsSigningProvider,
    },
    {
      provide: 'FolioProvider',
      useClass: DatabaseFolioProvider,
    },
    // Estas clases de sii-engine ya son stateless y pueden inyectarse como singletons
    {
      provide: SiiTokenManager,
      useClass: SiiTokenManager,
    },
    {
      provide: LegacySiiClient,
      useClass: LegacySiiClient,
    },
    {
      provide: BoletaSiiClient,
      useClass: BoletaSiiClient,
    },
  ],
  exports: [
    'SigningProvider',
    'FolioProvider',
    SiiTokenManager,
    LegacySiiClient,
    BoletaSiiClient
  ],
})
export class SiiModule {}
```

## 5. Emisión de Documentos en tu Servicio

Ahora puedes crear tu servicio de facturación que construya e inyecte todo por petición.

```typescript
import { Injectable, Inject } from '@nestjs/common';
import {
  SiiTokenManager, LegacySiiClient,
  buildDteXml, buildTedXml, signTed, signDteDocument, buildEnvioDteXml, signEnvelope,
  TipoDTE, DteDocument, EnvioDTECaratula, IssuerContext, FolioProvider, SigningProvider
} from 'sii-engine';

@Injectable()
export class InvoiceService {
  constructor(
    @Inject('SigningProvider') private readonly signingProvider: SigningProvider,
    @Inject('FolioProvider') private readonly folioProvider: FolioProvider,
    private readonly tokenManager: SiiTokenManager,
    private readonly siiClient: LegacySiiClient,
  ) {}

  async emitirFactura(doc: DteDocument, context: IssuerContext) {
    // 1. Obtener certificado y folio seguro
    const cert = await this.signingProvider.getSigningMaterial(context);
    const assignment = await this.folioProvider.getNextFolio(context, TipoDTE.FacturaElectronica);
    doc.idDoc.folio = assignment.folio;

    // 2. Firmar componentes
    const frma = signTed(doc, assignment.caf);
    const tedXml = buildTedXml(doc, assignment.caf, frma);
    const dteXml = buildDteXml(doc, tedXml);
    const signedDte = signDteDocument(dteXml, doc, cert);

    // 3. Empaquetar sobre
    const caratula: EnvioDTECaratula = {
      rutEmisor: context.rutEmisor,
      rutEnvia: cert.rutFirmante,
      fechaResolucion: context.fechaResolucion,
      nroResolucion: context.nroResolucion,
      fechaFirmaEnvio: new Date().toISOString().replace(/\.\d{3}Z$/, ''),
    };

    const envelopeXml = buildEnvioDteXml([{ document: doc, tedXml, signedXml: signedDte }], caratula);
    const envelopeSigned = signEnvelope(envelopeXml, cert);

    // 4. Autenticar y Enviar al SII
    const token = await this.tokenManager.getToken(context, this.signingProvider);
    const result = await this.siiClient.send(envelopeSigned, context, token.token);

    return result; // Contiene status y trackId
  }
}
```

## 6. Generando el Contexto Dinámico (Ej. AuthGuard)

Asegúrate de que en el Request a tu controlador, puedas construir el `IssuerContext` basado en los parámetros o claims del usuario logueado en la terminal POS.

```typescript
@Post('/emitir')
async emitirDte(@Body() payload: any, @Req() req: Request) {
  // Construir contexto desde el JWT o base de datos del POS
  const context: IssuerContext = {
    tenantId: req.user.tenantId,
    merchantId: req.user.merchantId,
    rutEmisor: req.user.merchantRut,
    environment: req.user.isProduction ? SiiEnvironment.Produccion : SiiEnvironment.Certificacion,
    fechaResolucion: req.user.siiFechaResolucion,
    nroResolucion: req.user.siiNroResolucion,
    certificateRef: `aws/kms/cert/${req.user.tenantId}`,
  };

  return await this.invoiceService.emitirFactura(payload.dte, context);
}
```

¡Listo! `sii-engine` procesará la factura de forma concurrente, aislando el material de firma y los tokens por comercio.
