# 🧾 NestJS SII — Integración SimpleAPI (Backend POS)

Esta API REST construida con **NestJS** actúa como intermediario (Backend) entre el Frontend del Punto de Venta (POS) en Flutter y los servicios del SII (a través de **SimpleAPI**). 

**El propósito de esta API es liberar al Frontend (Flutter) de la lógica compleja.** El frontend no necesita preocuparse por firmar XMLs, manejar contraseñas de certificados digitales, construir "Sobres" o comunicarse directamente con el SII. Flutter solo debe hacer llamadas HTTP REST estándar a esta API, y el backend de NestJS se encarga de todo el trabajo pesado.

---

## 🛡️ Seguridad y Autenticación

Dado que esta API maneja documentos financieros y contraseñas de certificados digitales, se ha configurado con una **estrategia de seguridad estricta**:

1. **Autenticación (API Key):** El frontend (Flutter) debe enviar obligatoriamente el header HTTP `x-api-key` en **todas** las peticiones al prefijo `/api/sii`. Si no se envía o es incorrecto, la API responderá con `401 Unauthorized`.
2. **Protección contra Fuerza Bruta (Rate Limiting):** Limitado a 100 peticiones por minuto por IP.
3. **CORS Estricto:** Evita que páginas web no autorizadas hagan llamadas a la API desde navegadores.
4. **Límites de Memoria (Archivos):** Los archivos de certificados y CAFs están limitados a 5MB por petición para evitar ataques de agotamiento de memoria (OOM).
5. **Helmet:** Cabeceras HTTP seguras activadas por defecto.

---

## ⚙️ Configuración (.env)

El manejo de ambientes (Certificación vs. Producción) y la seguridad se controlan **exclusivamente desde el Backend**. 

Todo se configura en el archivo `.env` en la raíz del proyecto:

| Variable              | Descripción                                    | Valor por defecto              |
|-----------------------|------------------------------------------------|-------------------------------|
| `SIMPLEAPI_BASE_URL`  | URL base de la API de SimpleAPI                | `https://api.simpleapi.cl`    |
| `SIMPLEAPI_KEY`       | Tu API Key de SimpleAPI                        | —                             |
| `SIMPLEAPI_AMBIENTE`  | `0` = Certificación (pruebas) · `1` = Producción | `0`                         |
| `API_KEY_FRONTEND`    | **La clave secreta que Flutter debe enviar en `x-api-key`** | `MiSuperClavePOS2024` |
| `CORS_ORIGIN`         | Orígenes permitidos (Ej. `http://mipos.com` o `*`) | `*`                           |

---

## 🔑 Archivos Necesarios (Certificados y CAFs)

Para interactuar con el SII a través de esta API, el Frontend debe proporcionar ciertos archivos en formato `multipart/form-data` en algunos endpoints. Aquí te explicamos qué son y por qué se necesitan:

### 1. Certificado Digital (`.pfx` / `.p12`)
- **¿Qué es?:** Es la "firma electrónica" de la empresa o representante legal autorizada por el SII. Contiene la clave privada necesaria para firmar matemáticamente los documentos (XML) para que el SII los considere válidos.
- **¿Cómo se usa?:** El archivo se envía en la petición bajo el campo `certificado`, junto con su contraseña en el JSON. 
- **¿Para qué endpoints se exige?:** Emisión de Documentos, Notas de Crédito, Generación de Sobres, RVD, Obtención de Folios y Consultas de Estado.

### 2. CAF (Código de Autorización de Folios - `.xml`)
- **¿Qué es?:** Es un archivo XML entregado por el SII que contiene un rango de folios (números) autorizados para ser usados en un tipo específico de documento, junto con una llave criptográfica. 
- **Específico por Documento:** **Un CAF de Boletas (tipo 39) no sirve para Facturas (tipo 33)**. Cada tipo de documento tiene su propio CAF.
- **¿Para qué endpoints se exige?:** Solo para la **Generación de Documentos** (Boleta, Factura, Notas de Crédito/Débito).

---

## 📡 Documentación de Endpoints

Todos los endpoints están bajo el prefijo `/api/sii`. 

### 1. Generar Documento: Boleta y Factura
Genera y emite el DTE al SII. La API toma el JSON, firma el XML usando el certificado, le asigna el folio usando el CAF, y lo envía a SimpleAPI.

- **Endpoints:** 
  - `POST /api/sii/boleta` (Tipo 39 y 41)
  - `POST /api/sii/factura` (Tipo 33, 34, etc.)
- **Content-Type:** `multipart/form-data`
- **Requerimientos:**
  - `datos` (JSON String): Estructura con Emisor, Receptor, Totales y Detalles.
  - `certificado` (Archivo `.pfx`): Certificado digital.
  - `caf` (Archivo `.xml`): CAF correspondiente al tipo de documento.

### 2. Nota de Crédito / Débito
Idéntico a la Factura, pero exige el nodo `Referencias` indicando el documento que está siendo modificado o anulado.

- **Endpoint:** `POST /api/sii/nota-credito`
- **Requerimientos:** Mismos que factura (`datos`, `certificado`, `caf`).

### 3. Sobre Envío
Para empaquetar múltiples documentos y enviarlos juntos al SII. (SimpleAPI automatiza esto en muchos casos, pero se provee por si se necesita control manual).

- **Endpoint:** `POST /api/sii/sobre-envio`
- **Requerimientos:** 
  - `datos` (JSON String)
  - `certificado` (Archivo `.pfx`)

### 4. Generar RVD (Registro de Ventas Diarias)
Obligatorio para quienes emiten Boletas Electrónicas. Resume las ventas del día.

- **Endpoint:** `POST /api/sii/rvd`
- **Requerimientos:** 
  - `datos` (JSON String)
  - `certificado` (Archivo `.pfx`)

### 5. Consultar Estado DTE y Estado de Envío
Permite saber si el SII aceptó, rechazó o reparó un documento o un sobre completo.

- **Endpoints:**
  - `POST /api/sii/estado-envio/:trackId`: Consulta por el TrackID del sobre.
  - `POST /api/sii/estado-dte`: Consulta por Folio y Tipo específico.
- **Requerimientos:** Requieren el archivo `certificado` (`.pfx`) y credenciales para autenticarse ante el SII.

### 6. Imagen del Timbre y Muestra Impresa
Generan la visualización del documento. Útil para imprimir el voucher en el POS.

- **Endpoints:**
  - `POST /api/sii/timbre`: Retorna solo la imagen del código de barras bidimensional (PDF417).
  - `POST /api/sii/muestra-impresa`: Retorna el PDF completo del documento tamaño carta o voucher.
- **Requerimientos:** Solo requieren el JSON en el `body` (`datos`). **No requieren archivos.**

### 7. Validador
Valida la estructura de un XML antes de enviarlo.

- **Endpoint:** `POST /api/sii/validador`
- **Requerimientos:** Recibe JSON con `xml` en Base64. **No requiere archivos.**

### 8. Obtención de Folios
Descarga automáticamente un nuevo CAF desde el SII cuando los folios actuales están por acabarse.

- **Endpoint:** `POST /api/sii/folios`
- **Requerimientos:** `datos` (JSON String) y `certificado` (`.pfx`).

### 9. Obtener Datos del Negocio por RUT (Nuevo)
Permite al frontend (Flutter) enviar un RUT y obtener la Razón Social, Giro y otros datos del cliente o negocio de forma automática para agilizar el proceso de venta.

- **Endpoint:** `GET /api/sii/contribuyente/:rut`
- **Requerimientos:** Solo el parámetro de ruta `:rut`. No requiere archivos ni body.

> 💡 **Cómo cambiar el proveedor de Obtención de Datos por RUT:**
> Por defecto, este endpoint está configurado para consumir `/api/v1/sii/datos_empresa/:rut` en SimpleAPI. Si SimpleAPI no tiene este endpoint habilitado en tu plan, o si prefieres usar una API gratuita chilena (como LibreAPI, apis.net.pe versión Chile, o un scraper), puedes cambiar esto fácilmente modificando la función `obtenerDatosEmpresa(rut)` en el archivo `src/sii/sii.service.ts`. Como Flutter solo llama a `GET /contribuyente/:rut`, **puedes cambiar el proveedor en NestJS sin tener que tocar ni una sola línea de código en la aplicación móvil.**

---

## 🚀 Instalación y Ejecución

```bash
# Instalar dependencias
npm install

# Modo desarrollo
npm run start:dev
```

El servidor queda disponible en los siguientes puntos:
- **API SII:** `http://localhost:3000/api/sii`
- **Raíz / Frontend Estático:** `http://localhost:3000/`
