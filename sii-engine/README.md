# sii-engine

Motor de Facturación Electrónica SII para Chile — librería TypeScript modular.

Construida según el RFC "Motor propio de Facturación Electrónica SII directo" para ser usada de forma embebida en proyectos NestJS u otros backends Node.js, sin depender de servicios intermedios.

---

## Características

- **Tipos TypeScript completos** para todos los dominios fiscales
- **Constructores XML** para DTE (33, 39, 56, 61), TED, EnvioDTE, EnvioBOLETA, RVD y RespuestaDTE
- **Firma XMLDSig** conforme al estándar del SII (SHA1withRSA)
- **Firma TED** con clave privada del CAF
- **Carga de certificados** desde P12 (.pfx) y PEM
- **Autenticación SII** automática (semilla → token) con caché
- **Gestión de CAF y folios** con FolioManager
- **Transporte separado** por familia técnica SII: DTE legacy (SOAP/multipart) y Boleta REST
- **Taxonomía completa de estados**: RSC, SOK, CRT, RCT, EPR, RFR, PRD (envío) y DOK, DNK, FAU, FNA, FAN, EMP, TMD, TMC, MMD, NNC, AND, ANC (DTE)
- **Jerarquía de errores tipados**: `SiiCafError`, `SiiCertError`, `SiiSignError`, `SiiSendError`

### DTEs soportados (MVP)

| Tipo | Descripción |
|------|-------------|
| 33   | Factura Electrónica |
| 39   | Boleta Electrónica |
| 56   | Nota de Débito |
| 61   | Nota de Crédito |

---

## Instalación

### Opción A — Desde paquete local (desarrollo)

```bash
# 1. Clonar o copiar la librería en tu máquina
git clone https://github.com/TESBrunoBRM/sii-engine.git
cd sii-engine

# 2. Instalar dependencias y compilar
npm install   # o pnpm install
npm run build # genera la carpeta dist/

# 3. En tu proyecto NestJS, instalar desde la ruta local
cd tu-proyecto-nestjs
npm install /ruta/absoluta/a/sii-engine
# o con pnpm:
pnpm add /ruta/absoluta/a/sii-engine
```

### Opción B — Desde tarball (sin publicar en npm)

```bash
# En el directorio del repo sii-engine:
npm run build
npm pack
# Genera: sii-engine-0.1.0.tgz

# En tu proyecto NestJS:
npm install ./sii-engine-0.1.0.tgz
# o con pnpm:
pnpm add ./sii-engine-0.1.0.tgz
```

### Opción C — Publicar en npm (registry público o privado)

```bash
# Publicar en npm público
npm run build
npm publish

# Publicar en npm registry privado (empresa)
npm run build
npm publish --registry https://tu-registry.empresa.com

# Instalar en el proyecto NestJS
npm install sii-engine
```

### Opción D — Usar como workspace de pnpm (monorepo)

Si tu proyecto NestJS ya usa pnpm workspaces, puedes agregar `sii-engine` como paquete local:

```yaml
# pnpm-workspace.yaml de tu monorepo
packages:
  - apps/*
  - packages/*
  - sii-engine  # ← agrega esta línea apuntando al directorio
```

```json
// package.json de tu app NestJS
{
  "dependencies": {
    "sii-engine": "workspace:*"
  }
}
```

---

## Requisitos

- **Node.js** >= 18 (recomendado 20+)
- **TypeScript** >= 5.0 (para proyectos TS)
- **Dependencias de peer**: ninguna (todas incluidas en el bundle)

---

## Uso rápido

### 1. Importar la librería

```typescript
import {
  TipoDTE,
  SiiEnvironment,
  InMemoryFolioProvider,
  parseCaf,
  loadCertificateFromP12,
  SiiTokenManager,
  LegacySiiClient,
  BoletaSiiClient,
  buildDteXml,
  buildTedXml,
  signTed,
  signDteDocument,
  buildEnvioDteXml,
  buildEnvioBoletaXml,
  validateDteDocument,
  type DteDocument,
  type CertificateMaterial,
  type IssuerContext,
  type SigningProvider,
} from 'sii-engine';
```

### 2. Cargar el certificado de firma

```typescript
import fs from 'fs';

const p12Buffer = fs.readFileSync('ruta/a/certificado.pfx');
const certMaterial = loadCertificateFromP12(p12Buffer, 'password_del_certificado');

console.log('Firmante:', certMaterial.rutFirmante);
console.log('Expira:', certMaterial.expiresAt);
```

También puedes cargar desde PEM:

```typescript
import { loadCertificateFromPem } from 'sii-engine';

const certPem = fs.readFileSync('cert.pem', 'utf-8');
const keyPem  = fs.readFileSync('key.pem', 'utf-8');
const certMaterial = loadCertificateFromPem(certPem, keyPem);
```

### 3. Definir el contexto del emisor (IssuerContext)

Para aplicaciones multi-tenant, toda la información se inyecta por operación, no de forma global:

```typescript
const context: IssuerContext = {
  tenantId: 'tenant-123',
  merchantId: 'merchant-456',
  branchId: 'sucursal-centro',
  environment: SiiEnvironment.Certificacion,
  rutEmisor: '76212345-6',
  fechaResolucion: '2014-08-22',
  nroResolucion: 80,
  certificateRef: 'aws:kms:secret-id-cert',
};

const mockSigningProvider: SigningProvider = {
  async getSigningMaterial(ctx: IssuerContext) {
    // Aquí puedes buscar en tu DB o KMS usando ctx.certificateRef
    return certMaterial;
  }
};
```

### 4. Cargar un CAF y gestionar folios

Para producción, debes implementar `FolioProvider` con bloqueos en DB. Para desarrollo, puedes usar `InMemoryFolioProvider`:

```typescript
import { parseCaf, InMemoryFolioProvider, TipoDTE } from 'sii-engine';

const cafXml = fs.readFileSync('caf_33.xml', 'utf-8');
const caf = parseCaf(cafXml);

const folioProvider = new InMemoryFolioProvider();
folioProvider.addCaf(caf);

// Consultar estado de folios disponibles
const status = await folioProvider.getStatus(context, TipoDTE.FacturaElectronica);
console.log('Folios disponibles:', status[0].remaining);

// Obtener el siguiente folio
const assignment = await folioProvider.getNextFolio(context, TipoDTE.FacturaElectronica);
console.log('Folio asignado:', assignment.folio);
```

### 5. Obtener token de autenticación SII

```typescript
import { SiiTokenManager } from 'sii-engine';

const tokenManager = new SiiTokenManager();

// Obtiene token nuevo o usa el caché. La caché aísla por emisor y entorno.
const authToken = await tokenManager.getToken(context, mockSigningProvider);
console.log('Token SII:', authToken.token);
```

### 6. Construir y firmar una Factura Electrónica (DTE 33)

```typescript
import {
  TipoDTE, FormaPago,
  buildDteXml, buildTedXml, signTed, signDteDocument,
  validateDteDocument,
  type DteDocument,
} from 'sii-engine';

const documento: DteDocument = {
  idDoc: {
    tipoDTE: TipoDTE.FacturaElectronica,
    folio: assignment.folio,
    fechaEmision: '2026-05-15',
    formaPago: FormaPago.Contado,
  },
  emisor: {
    rutEmisor: '76212345-6',
    rznSoc: 'Mi Empresa S.A.',
    giroEmis: 'Servicios de Tecnología',
    acteco: 620900,
    dirOrigen: 'Av. Providencia 1234',
    cmnaOrigen: 'Providencia',
    ciudadOrigen: 'Santiago',
    correoEmisor: 'dte@miempresa.cl',
  },
  receptor: {
    rutRecep: '12345678-9',
    rznSocRecep: 'Cliente S.A.',
    giroRecep: 'Comercio al por mayor',
    dirRecep: 'Calle Los Leones 456',
    cmnaRecep: 'Las Condes',
    ciudadRecep: 'Santiago',
    correoRecep: 'compras@cliente.cl',
  },
  detalles: [
    {
      nroLinDet: 1,
      nmbItem: 'Desarrollo de software',
      qtyItem: 1,
      prcItem: 500000,
      montoItem: 500000,
    },
    {
      nroLinDet: 2,
      nmbItem: 'Soporte técnico mensual',
      qtyItem: 3,
      unmdItem: 'MES',
      prcItem: 100000,
      montoItem: 300000,
    },
  ],
  totales: {
    mntNeto: 800000,
    tasaIVA: 19,
    iva: 152000,
    mntTotal: 952000,
  },
};

// Validar antes de construir (validación estricta cruzada con contexto y CAF)
validateDteDocument(documento, context, assignment.caf);

// 1. Firmar el TED con la clave del CAF
const frma = signTed(documento, assignment.caf);

// 2. Construir el XML del TED
const tedXml = buildTedXml(documento, assignment.caf, frma);

// 3. Construir el XML del DTE completo
const dteXml = buildDteXml(documento, tedXml);

// 4. Firmar el documento con el certificado (XMLDSig)
const signedDteXml = signDteDocument(dteXml, documento, certMaterial);

console.log('DTE firmado correctamente');
```

### 7. Construir una Boleta Electrónica (DTE 39)

```typescript
const boleta: DteDocument = {
  idDoc: {
    tipoDTE: TipoDTE.BoletaElectronica,
    folio: boletaAssignment.folio,
    fechaEmision: '2026-05-15',
  },
  emisor: {
    rutEmisor: '76212345-6',
    rznSoc: 'Mi Empresa S.A.',
    giroEmis: 'Restaurant',
    acteco: 561000,
    dirOrigen: 'Av. Italia 789',
    cmnaOrigen: 'Ñuñoa',
  },
  receptor: {
    // Para consumidor final se puede omitir o usar RUT genérico
    rutRecep: '66666666-6',
    rznSocRecep: 'SIN INFORMACION',
  },
  detalles: [
    {
      nroLinDet: 1,
      nmbItem: 'Almuerzo ejecutivo',
      qtyItem: 2,
      prcItem: 9500,
      montoItem: 19000,
    },
  ],
  totales: {
    mntBruto: 19000,
    mntTotal: 19000,
  },
};

const frmaB = signTed(boleta, boletaAssignment.caf);
const tedB  = buildTedXml(boleta, boletaAssignment.caf, frmaB);
const dteB  = buildDteXml(boleta, tedB);
const signedBoleta = signDteDocument(dteB, boleta, certMaterial);
```

### 8. Construir una Nota de Crédito (DTE 61)

```typescript
import { TipoReferencia } from 'sii-engine';

const notaCredito: DteDocument = {
  idDoc: {
    tipoDTE: TipoDTE.NotaCredito,
    folio: ncAssignment.folio,
    fechaEmision: '2026-05-15',
  },
  emisor: { /* igual que la factura original */ },
  receptor: {
    rutRecep: '12345678-9',
    rznSocRecep: 'Cliente S.A.',
  },
  detalles: [
    {
      nroLinDet: 1,
      nmbItem: 'Anulación total factura 1234',
      prcItem: 952000,
      montoItem: 952000,
    },
  ],
  referencias: [
    {
      nroLinRef: 1,
      tipoDTERef: TipoDTE.FacturaElectronica,
      folioRef: 1234,
      fechaRef: '2026-05-10',
      codRef: TipoReferencia.AnulaDocumento,
      razonRef: 'Anulación por error en montos',
    },
  ],
  totales: {
    mntNeto: 800000,
    tasaIVA: 19,
    iva: 152000,
    mntTotal: 952000,
  },
};
```

### 9. Enviar al SII (Facturas/Notas — canal legacy)

```typescript
import {
  buildEnvioDteXml,
  signEnvelope,
  LegacySiiClient,
  SiiEnvironment,
  type EnvioDTECaratula,
  type DteFirmado,
} from 'sii-engine';

// Armar los objetos DteFirmado
const dtesFirmados: DteFirmado[] = [
  {
    document: documento,
    tedXml,
    signedXml: signedDteXml,
  },
];

// Construir la carátula del sobre
const caratula: EnvioDTECaratula = {
  rutEmisor: '76212345-6',
  rutEnvia: certMaterial.rutFirmante,
  fechaResolucion: '2014-08-22',  // fecha resolución SII
  nroResolucion: 80,
  fechaFirmaEnvio: new Date().toISOString().replace(/\.\d{3}Z$/, ''),
};

// Construir y firmar el sobre
const envioDteXml = buildEnvioDteXml(dtesFirmados, caratula);
const envioDteSigned = signEnvelope(envioDteXml, certMaterial);

// Enviar al SII pasándole el contexto en la ejecución
const client = new LegacySiiClient();

const result = await client.send(envioDteSigned, context, authToken.token);
console.log('TrackID:', result.trackId);
console.log('Estado:', result.status);  // SOK, EPR, etc.
```

### 10. Enviar Boleta al SII + RVD diario

```typescript
import {
  BoletaSiiClient,
  buildEnvioBoletaXml,
  buildResumenVentasDiariasXml,
  signEnvelope,
} from 'sii-engine';

const boletaClient = new BoletaSiiClient();

// Enviar boleta pasándole el contexto
const envioBoletaXml = buildEnvioBoletaXml([{ document: boleta, tedXml: tedB, signedXml: signedBoleta }], caratula);
const envioBoletaSigned = signEnvelope(envioBoletaXml, certMaterial);
const resultBoleta = await boletaClient.send(envioBoletaSigned, context, authToken.token);

// Enviar Resumen de Ventas Diarias (obligatorio todos los días, incluso sin ventas)
const rvdXml = buildResumenVentasDiariasXml(
  '76212345-6',
  certMaterial.rutFirmante,
  '2026-05-15',
  80,           // nroResolucion
  '2014-08-22', // fechaResolucion
  1,            // secEnvio (incremental diario)
  [
    {
      tipoDTE: TipoDTE.BoletaElectronica,
      cantidad: 1,
      montoTotal: 19000,
      montoIVA: 0,
    },
  ]
);

const rvdSigned = signEnvelope(rvdXml, certMaterial);
const resultRvd = await boletaClient.sendRvd(rvdSigned, context, authToken.token);
```

### 11. Consultar estado de envío

```typescript
// Consultar estado del sobre enviado (por TrackID)
const statusResult = await client.queryStatus(result.trackId, context, authToken.token);
console.log('Estado envío:', statusResult.status);
// PRD = Procesado Definitivo, EPR = En Proceso, RSC = Rechazado, etc.

if (statusResult.estadisticas) {
  console.log('Aceptados:', statusResult.estadisticas.aceptados);
  console.log('Rechazados:', statusResult.estadisticas.rechazados);
}

// Consultar estado específico de un DTE
const dteStatus = await client.queryDteStatus(
  {
    tipoDTE: TipoDTE.FacturaElectronica,
    folio: 1,
    fechaEmision: '2026-05-15',
    montoTotal: 952000,
    rutReceptor: '12345678',
    dvReceptor: '9',
  },
  context,
  authToken.token
);
console.log('Estado DTE:', dteStatus.status); // DOK, FAU, DNK, etc.
```

---

## Manejo de errores

```typescript
import {
  isSiiError,
  SiiCafError,
  SiiCertError,
  SiiSignError,
  SiiSendError,
  SiiAuthError,
} from 'sii-engine';

try {
  const assignment = await folioProvider.getNextFolio(context, TipoDTE.FacturaElectronica);
} catch (err) {
  if (err instanceof SiiCafError) {
    switch (err.code) {
      case 'CAF_EXHAUSTED':
        console.error('Se agotaron los folios — solicitar nuevo CAF al SII');
        break;
      case 'CAF_EXPIRED':
        console.error('El CAF expiró — solicitar nuevo CAF al SII');
        break;
    }
  }
}

try {
  const result = await client.send(envioDteXml, context, authToken.token);
} catch (err) {
  if (err instanceof SiiSendError) {
    console.error(`Error de envío [${err.code}]:`, err.message);
    console.error('Respuesta cruda SII:', err.rawResponse);
  }
}
```

---

## Uso en NestJS

### Módulo de inyección de dependencias

```typescript
// sii.module.ts
import { Module, Global } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import {
  SiiTokenManager,
  LegacySiiClient,
  BoletaSiiClient,
} from 'sii-engine';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      // Debes implementar tus propios Providers (Ej: DatabaseFolioProvider)
      provide: 'FolioProvider',
      useClass: TuFolioProviderSeguro,
    },
    {
      // Provee los certificados descifrándolos desde DB o AWS KMS
      provide: 'SigningProvider',
      useClass: TuSigningProviderSeguro,
    },
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
  exports: ['FolioProvider', 'SigningProvider', SiiTokenManager, LegacySiiClient, BoletaSiiClient],
})
export class SiiModule {}
```

### Servicio de emisión

```typescript
// invoice.service.ts
import { Injectable, Inject } from '@nestjs/common';
import {
  SiiTokenManager, LegacySiiClient,
  buildDteXml, buildTedXml, signTed, signDteDocument,
  buildEnvioDteXml, signEnvelope,
  TipoDTE, SiiEnvironment,
  type DteDocument, type EnvioDTECaratula, type IssuerContext, type FolioProvider, type SigningProvider,
} from 'sii-engine';

@Injectable()
export class InvoiceService {
  constructor(
    @Inject('SigningProvider') private readonly signingProvider: SigningProvider,
    @Inject('FolioProvider') private readonly folioProvider: FolioProvider,
    private readonly tokenManager: SiiTokenManager,
    private readonly siiClient: LegacySiiClient,
  ) {}

  async emitirFactura(doc: DteDocument, context: IssuerContext): Promise<{ trackId: string }> {
    const assignment = await this.folioProvider.getNextFolio(context, TipoDTE.FacturaElectronica);
    doc.idDoc.folio = assignment.folio;

    // Se obtiene el certificado dinámicamente según el context.certificateRef
    const cert = await this.signingProvider.getSigningMaterial(context);

    const frma       = signTed(doc, assignment.caf);
    const tedXml     = buildTedXml(doc, assignment.caf, frma);
    const dteXml     = buildDteXml(doc, tedXml);
    const signedDte  = signDteDocument(dteXml, doc, cert);

    const caratula: EnvioDTECaratula = {
      rutEmisor: doc.emisor.rutEmisor,
      rutEnvia: cert.rutFirmante,
      fechaResolucion: context.fechaResolucion,
      nroResolucion: context.nroResolucion,
      fechaFirmaEnvio: new Date().toISOString().replace(/\.\d{3}Z$/, ''),
    };

    const sobre       = buildEnvioDteXml([{ document: doc, tedXml, signedXml: signedDte }], caratula);
    const sobreFirmado = signEnvelope(sobre, cert);

    const authToken = await this.tokenManager.getToken(context, this.signingProvider);
    const result    = await this.siiClient.send(sobreFirmado, context, authToken.token);

    return { trackId: result.trackId };
  }
}
```

---

## Variables de entorno recomendadas

```env
# Ambiente SII
SII_ENV=CERTIFICACION            # CERTIFICACION | PRODUCCION

# Datos del emisor
SII_RUT=76212345                 # RUT sin DV y sin puntos
SII_DV=6                         # DV del RUT

# Resolución SII del emisor
SII_NRO_RESOLUCION=80
SII_FECHA_RESOLUCION=2014-08-22

# Certificado digital
SII_CERT_PATH=/secrets/cert.pfx
SII_CERT_PASSWORD=password_aqui

# Directorio de CAFs por tipo DTE
SII_CAF_DIR=/secrets/cafs
```

---

## Arquitectura de la librería

```
sii-engine/
├── src/
│   ├── types/          ← Tipos TypeScript del dominio fiscal
│   ├── errors/         ← Jerarquía de errores tipados
│   ├── states/         ← Taxonomía de estados SII (envío y DTE)
│   ├── caf/            ← Parser de CAF XML + Interfaces Folio/Caf Provider
│   ├── xml/            ← Constructores XML (DTE, TED, EnvioDTE, RVD, etc.)
│   ├── signing/        ← Firma TED, XMLDSig, autenticación SII
│   └── transport/      ← Clientes HTTP al SII (legacy y boleta)
└── dist/
    ├── index.js        ← ESM bundle
    ├── index.cjs       ← CommonJS bundle (compatible NestJS)
    └── index.d.ts      ← Tipos TypeScript
```

### Decisiones de diseño

- **Library-first**: el motor no es una API, es un core embebible en backends NestJS distribuidos.
- **Sin estado in-memory estricto**: interfaces `FolioProvider` y `CafProvider` permiten escalabilidad delegando persistencia transaccional al host.
- **Multitenant y Seguro**: Todo depende de un `IssuerContext` por operación, eliminando variables de entorno globales. PFX y CAFs se traen por referencia dinámicamente con `SigningProvider`.
- **Dos familias de transporte**: `LegacySiiClient` para DTE 33/56/61 y `BoletaSiiClient` para DTE 39.

---

## Notas importantes del SII

- Los **CAF tienen vigencia de 6 meses** desde la fecha de autorización. Usar `folioManager.getStatus()` para monitorear.
- El **token SII tiene TTL de ~50 minutos**. `SiiTokenManager` maneja el caché automáticamente.
- La **boleta electrónica requiere RVD diario** (Resumen de Ventas Diarias), incluso los días sin ventas.
- El **TED se firma con la clave privada del CAF** (`RSASK`), no con el certificado del contribuyente.
- Los estados `RCH` (rechazado) y `RPR` (aceptado con reparos) tienen flujos de remediación distintos — no son lo mismo.
- El modo **CERTIFICACION** usa los servidores `maullin.sii.cl`, y **PRODUCCION** usa `palena.sii.cl`.

---

## Licencia

MIT
