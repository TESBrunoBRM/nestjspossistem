# 🧾 NestJS SII — Integración SimpleAPI

API REST construida con **NestJS** para emitir documentos tributarios electrónicos (DTE) en Chile, utilizando el servicio **SimpleAPI** como intermediario con el SII.

---

## 📁 Estructura del Proyecto

```
myfirstapp/
├── .env                          ← ⚙️  Variables de entorno (API key, ambiente)
├── public/                       ← Archivos estáticos servidos en /
└── src/
    ├── main.ts                   ← Punto de entrada (puerto, prefijo /api, CORS)
    ├── app.module.ts             ← Módulo raíz (carga ConfigModule, SiiModule)
    └── sii/
        ├── sii.module.ts         ← Módulo SII
        ├── sii.controller.ts     ← Endpoints REST de la API
        ├── sii.service.ts        ← Lógica de negocio y llamadas a SimpleAPI
        ├── dto/
        │   ├── emitir-boleta.dto.ts   ← Estructura del JSON para boletas
        │   └── emitir-factura.dto.ts  ← Estructura del JSON para facturas
        └── interfaces/
            └── simpleapi-response.interface.ts
```

---

## ⚙️ Variables de Entorno — `.env`

**Archivo:** `.env` (raíz del proyecto)

> ⚠️ **Este es el único archivo que debes editar** para conectar con SimpleAPI.

| Variable              | Descripción                                    | Valor por defecto              |
|-----------------------|------------------------------------------------|-------------------------------|
| `SIMPLEAPI_BASE_URL`  | URL base de la API de SimpleAPI                | `https://api.simpleapi.cl`    |
| `SIMPLEAPI_KEY`       | **Tu API Key de SimpleAPI** (cámbiala aquí)    | —                             |
| `SIMPLEAPI_AMBIENTE`  | `0` = Certificación (pruebas) · `1` = Producción | `0`                         |

### Ejemplo `.env` para producción

```env
SIMPLEAPI_BASE_URL=https://api.simpleapi.cl
SIMPLEAPI_KEY=TU-API-KEY-AQUI
SIMPLEAPI_AMBIENTE=1
```

### Ejemplo `.env` para pruebas/certificación

```env
SIMPLEAPI_BASE_URL=https://api.simpleapi.cl
SIMPLEAPI_KEY=TU-API-KEY-AQUI
SIMPLEAPI_AMBIENTE=0
```

> Las variables son leídas en **`src/sii/sii.service.ts`** (líneas 17-25) a través de `ConfigService`.

---

## 🚀 Instalación y Ejecución

```bash
# Instalar dependencias
npm install

# Modo desarrollo (con hot-reload)
npm run start:dev

# Modo producción
npm run build
npm run start:prod
```

El servidor queda disponible en:
- **API:** `http://localhost:3000/api`
- **Archivos estáticos:** `http://localhost:3000/`

> El puerto puede cambiarse con la variable de entorno `PORT` en el `.env`.

---

## 📡 Endpoints Disponibles

Prefijo global: `/api`  
Todos los endpoints de SII están bajo `/api/sii`.

### `GET /api/sii/health`
Verifica la conexión con SimpleAPI y muestra el ambiente configurado.

**Respuesta:**
```json
{
  "status": "ok",
  "url": "https://api.simpleapi.cl",
  "ambiente": "certificación"
}
```

---

### `POST /api/sii/boleta`
Emite una **Boleta Electrónica (tipo 39)** o **Boleta No Afecta (tipo 41)**.

**Content-Type:** `multipart/form-data`

| Campo         | Tipo       | Descripción                                      |
|---------------|------------|--------------------------------------------------|
| `datos`       | string JSON | JSON con la estructura `EmitirBoletaDto`        |
| `certificado` | archivo `.pfx` | Certificado digital de la empresa           |
| `caf`         | archivo `.xml` | CAF de folios tipo 39 autorizado por el SII |

**Ejemplo con `curl`:**
```bash
curl -X POST http://localhost:3000/api/sii/boleta \
  -F "datos={\"IdentificacionDTE\":{\"TipoDTE\":39,\"Folio\":1,\"FechaEmision\":\"2024-04-21\"},\"Emisor\":{\"Rut\":\"12345678-9\",\"RazonSocialBoleta\":\"Mi Empresa SpA\",\"GiroBoleta\":\"Venta al por menor\",\"DireccionOrigen\":\"Av. Principal 123\",\"ComunaOrigen\":\"Santiago\"},\"Receptor\":{\"Rut\":\"66666666-6\"},\"Totales\":{\"MontoTotal\":11900,\"MontoNeto\":10000,\"IVA\":1900},\"Detalles\":[{\"Nombre\":\"Producto A\",\"Cantidad\":1,\"Precio\":10000,\"MontoItem\":10000}],\"Certificado\":{\"Rut\":\"12345678-9\",\"Password\":\"mi-pass\"}}" \
  -F "certificado=@/ruta/certificado.pfx" \
  -F "caf=@/ruta/caf_39.xml"
```

---

### `POST /api/sii/factura`
Emite una **Factura Electrónica (tipo 33)** u otros DTE con receptor identificado.

**Content-Type:** `multipart/form-data`

| Campo         | Tipo           | Descripción                                         |
|---------------|----------------|-----------------------------------------------------|
| `datos`       | string JSON    | JSON con la estructura `EmitirFacturaDto`           |
| `certificado` | archivo `.pfx` | Certificado digital de la empresa                   |
| `caf`         | archivo `.xml` | CAF de folios tipo 33 autorizado por el SII         |

---

### `POST /api/sii/estado-envio/:trackId`
Consulta el estado de un envío al SII usando el **TrackID** devuelto al emitir.

**Content-Type:** `multipart/form-data`

| Campo                 | Tipo           | Descripción                          |
|-----------------------|----------------|--------------------------------------|
| `:trackId`            | URL param      | TrackID del envío                    |
| `rutEmpresa`          | Body string    | RUT empresa emisora (sin puntos)     |
| `rutCertificado`      | Body string    | RUT del certificado digital          |
| `passwordCertificado` | Body string    | Contraseña del certificado `.pfx`    |
| `certificado`         | archivo `.pfx` | Certificado digital                  |

---

### `POST /api/sii/estado-dte`
Consulta el estado de un **DTE individual** directamente en el SII.

**Content-Type:** `multipart/form-data`

| Campo                 | Tipo           | Descripción                                |
|-----------------------|----------------|--------------------------------------------|
| `rutEmpresa`          | Query param    | RUT de la empresa emisora                  |
| `rutReceptor`         | Query param    | RUT del receptor                           |
| `folio`               | Query param    | Número de folio del DTE                    |
| `tipoDte`             | Query param    | Tipo de DTE (33, 39, etc.)                 |
| `total`               | Query param    | Monto total del DTE                        |
| `fechaDte`            | Query param    | Fecha del DTE (AAAA-MM-DD)                 |
| `rutCertificado`      | Body string    | RUT del certificado digital                |
| `passwordCertificado` | Body string    | Contraseña del certificado `.pfx`          |
| `certificado`         | archivo `.pfx` | Certificado digital                        |

---

## 🗂️ Estructura del JSON — Boleta (`EmitirBoletaDto`)

```json
{
  "IdentificacionDTE": {
    "TipoDTE": 39,              // 39=Boleta | 41=Boleta Exenta
    "Folio": 1,                 // Número de folio autorizado por el SII
    "FechaEmision": "2024-04-21", // Formato AAAA-MM-DD
    "IndicadorServicio": 3,     // Opcional: 1,2,3,4
    "IndicadorMontosNetosBoleta": 2  // Opcional: 2 si el detalle va en montos netos
  },
  "Emisor": {
    "Rut": "12345678-9",        // RUT con guión y dígito verificador
    "RazonSocialBoleta": "Mi Empresa SpA",
    "GiroBoleta": "Venta al por menor",
    "DireccionOrigen": "Av. Principal 123",
    "ComunaOrigen": "Santiago"
  },
  "Receptor": {
    "Rut": "66666666-6",        // 66.666.666-6 si no hay individualización
    "RazonSocial": "Cliente",   // Opcional
    "Direccion": "Calle 456",   // Opcional
    "Comuna": "Providencia",    // Opcional
    "Ciudad": "Santiago",       // Opcional
    "Contacto": "email@ejemplo.com" // Opcional
  },
  "Totales": {
    "MontoTotal": 11900,
    "MontoNeto": 10000,         // Opcional
    "IVA": 1900,                // Opcional (19% del neto)
    "MontoExento": 0            // Opcional
  },
  "Detalles": [
    {
      "Nombre": "Producto A",
      "Cantidad": 1,
      "Precio": 10000,
      "MontoItem": 10000,       // Precio * Cantidad
      "IndicadorExento": 0,     // Opcional: 0=no exento, 1=exento
      "Descuento": 0,           // Opcional
      "Recargo": 0              // Opcional
    }
  ],
  "Certificado": {
    "Rut": "12345678-9",        // RUT del certificado digital
    "Password": "contraseña"    // Contraseña del archivo .pfx
  }
}
```

---

## 🗂️ Estructura del JSON — Factura (`EmitirFacturaDto`)

```json
{
  "IdentificacionDTE": {
    "TipoDTE": 33,              // 33=Factura | 34=Exenta | 46=Compra | 52=Despacho | 56=Débito | 61=Crédito
    "Folio": 1,
    "FechaEmision": "2024-04-21",
    "FormaPago": 1,             // Opcional: 1=Contado, 2=Crédito, 3=Sin costo
    "MedioPago": "EF"          // Opcional: EF, TC, CH, OT, PE, LT, CF
  },
  "Emisor": {
    "Rut": "12345678-9",
    "RazonSocial": "Mi Empresa SpA",
    "Giro": "Venta de software",
    "ActividadEconomica": 620200, // Opcional: código SII
    "DireccionOrigen": "Av. Principal 123",
    "ComunaOrigen": "Santiago",
    "CiudadOrigen": "Santiago", // Opcional
    "Telefono": ["+56912345678"] // Opcional (array de strings)
  },
  "Receptor": {
    "Rut": "98765432-1",
    "RazonSocial": "Cliente Empresa Ltda",
    "Direccion": "Calle Receptor 789",
    "Comuna": "Las Condes",
    "Ciudad": "Santiago",       // Opcional
    "Giro": "Servicios TI",     // Opcional
    "Contacto": "contacto@empresa.cl", // Opcional
    "CorreoElectronico": "email@empresa.cl" // Opcional
  },
  "Totales": {
    "MontoTotal": 11900,
    "MontoNeto": 10000,
    "IVA": 1900,
    "TasaIVA": 19,              // Opcional (por defecto 19)
    "MontoExento": 0            // Opcional
  },
  "Detalles": [
    {
      "Nombre": "Servicio de desarrollo",
      "Descripcion": "Detalle adicional", // Opcional
      "Cantidad": 1,
      "Precio": 10000,
      "MontoItem": 10000,
      "IndicadorExento": 0,     // Opcional
      "Descuento": 0,           // Opcional
      "Recargo": 0              // Opcional
    }
  ],
  "Referencias": [              // Opcional (ej: para Notas de Crédito/Débito)
    {
      "FechaDocumentoReferencia": "2024-04-20",
      "TipoDocumento": 33,
      "FolioReferencia": 5,
      "CodigoReferencia": 1,    // Opcional: 0=no definido, 1=anular, 2=corregir texto, 3=corregir montos
      "RazonReferencia": "Anulación" // Opcional
    }
  ],
  "Certificado": {
    "Rut": "12345678-9",
    "Password": "contraseña"
  }
}
```

---

## 🔑 Archivos Necesarios para Emitir DTEs

Para emitir cualquier DTE necesitas **dos archivos** que debes obtener del SII o de tu representante:

| Archivo          | Extensión | Descripción                                                    |
|------------------|-----------|----------------------------------------------------------------|
| **Certificado**  | `.pfx`    | Certificado digital de la empresa (con clave privada)          |
| **CAF**          | `.xml`    | Código de Autorización de Folios emitido por el SII por tipo de DTE |

> Los CAF son **específicos por tipo de DTE**: el CAF de boletas (tipo 39) no sirve para facturas (tipo 33).

---

## 📂 ¿Dónde cambiar cada cosa?

| ¿Qué quieres cambiar?                    | Archivo                           | Detalle                                     |
|------------------------------------------|-----------------------------------|---------------------------------------------|
| API Key de SimpleAPI                     | `.env`                            | Variable `SIMPLEAPI_KEY`                    |
| Ambiente (pruebas/producción)            | `.env`                            | Variable `SIMPLEAPI_AMBIENTE` (`0` o `1`)   |
| URL base de SimpleAPI                    | `.env`                            | Variable `SIMPLEAPI_BASE_URL`               |
| Puerto del servidor                      | `.env`                            | Variable `PORT` (defecto: 3000)             |
| Prefijo de la API (`/api`)               | `src/main.ts`                     | `app.setGlobalPrefix('api')`                |
| Timeout de requests a SimpleAPI          | `src/sii/sii.service.ts`          | `timeout: 30000` en `axios.create()`        |
| Validaciones del JSON de boleta          | `src/sii/dto/emitir-boleta.dto.ts`| Decoradores `class-validator`               |
| Validaciones del JSON de factura         | `src/sii/dto/emitir-factura.dto.ts`| Decoradores `class-validator`              |
| Estructura del payload enviado a SimpleAPI| `src/sii/sii.service.ts`         | Métodos `buildDocumentoBoleta` / `buildDocumentoFactura` |
| Agregar nuevos endpoints SII             | `src/sii/sii.controller.ts`       | Agregar métodos con decoradores `@Post`/`@Get` |

---

## 🧪 Dependencias Principales

| Paquete                    | Versión   | Uso                                          |
|----------------------------|-----------|----------------------------------------------|
| `@nestjs/common`           | ^11.0.1   | Framework base                               |
| `@nestjs/config`           | ^4.0.4    | Lectura del `.env` con `ConfigService`       |
| `@nestjs/platform-express` | ^11.0.1   | Soporte Express + Multer para archivos       |
| `@nestjs/serve-static`     | ^5.0.5    | Servir archivos estáticos desde `/public`    |
| `axios`                    | ^1.15.1   | Cliente HTTP para llamar a SimpleAPI         |
| `form-data`                | ^4.0.5    | Construir `multipart/form-data` en el service|
| `class-validator`          | ^0.15.1   | Validación de DTOs                           |
| `class-transformer`        | ^0.5.1    | Transformación automática de tipos           |
| `multer`                   | ^2.1.1    | Manejo de archivos en endpoints              |

---

## 🐛 Errores Comunes

| Error                                  | Causa probable                                          | Solución                                    |
|----------------------------------------|---------------------------------------------------------|---------------------------------------------|
| `401 Unauthorized`                     | API Key incorrecta o inválida                           | Verificar `SIMPLEAPI_KEY` en `.env`         |
| `Se requiere el archivo "caf"`         | No se envió el archivo CAF                              | Incluir campo `caf` en el form-data         |
| `El campo "datos" no es un JSON válido`| JSON malformado en el campo `datos`                     | Validar el JSON antes de enviarlo           |
| `502 Bad Gateway`                      | SimpleAPI no responde o está caído                      | Verificar `SIMPLEAPI_BASE_URL` y conectividad|
| Folios agotados                        | El CAF no tiene más folios disponibles                  | Solicitar nuevo CAF al SII                  |
