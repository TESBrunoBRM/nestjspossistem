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

## 📡 Documentación Interactiva (Swagger)

La API cuenta con documentación interactiva y detallada gracias a **Swagger**.
Al levantar el proyecto de forma local, puedes acceder a la interfaz gráfica navegando a:
👉 **http://localhost:3000/api**

Allí encontrarás todos los endpoints organizados por categoría (Boletas, Facturas, Sesión, Consultas, etc.), junto con **ejemplos JSON completos** y detallados para los payloads que debes enviar desde el POS.

---

## 🛣️ Endpoints Principales

Todos los endpoints están bajo el prefijo `/api/sii`. Debido a la arquitectura limpia, están agrupados semánticamente en las siguientes categorías:

### 1. Boletas (`/api/sii/boletas`)
- `POST /emitir`: Emite una boleta (Tipo 39 y 41). Recibe `datos`, `certificado` (.pfx) y `caf` (.xml).

### 2. Facturas y Notas (`/api/sii/facturas`)
- `POST /emitir`: Emite una factura (Tipo 33, 34, etc.).
- `POST /nota-credito`: Emite una Nota de Crédito o Débito. Exige el nodo de `Referencias` obligatorio.

### 3. Utilidades DTE (`/api/sii/utilidades`)
- `POST /sobre-envio`: Generar Sobre de Envío.
- `POST /rvd`: Generar Registro de Ventas Diarias.
- `POST /timbre`: Obtener imagen del Timbre Electrónico (PDF417).
- `POST /muestra-impresa`: Obtener PDF con la Muestra Impresa.
- `POST /validador`: Validador de esquemas XML del SII.
- `POST /folios`: Descargar un nuevo CAF desde el SII (Obtención de Folios).

### 4. Consultas SII (`/api/sii/consultas`)
- `POST /estado-envio/:trackId`: Consulta el estado de recepción de un sobre por su TrackID.
- `POST /estado-dte`: Consulta por Folio y Tipo específico si un documento fue aceptado o rechazado.

### 5. Sesión (`/api/sii/sesion`)
- `GET /health`: Verifica la salud y la configuración de conexión con SimpleAPI.

### 6. Contribuyentes (`/api/sii/contribuyente`)
- `GET /:rut`: Obtiene Razón Social, Giro y otros datos del cliente de forma automática para agilizar las ventas.

> 💡 **Cómo cambiar el proveedor de Obtención de Datos por RUT:**
> Por defecto, este endpoint está configurado para consumir `/api/v1/sii/datos_empresa/:rut` en SimpleAPI. Si prefieres usar una API gratuita chilena o un scraper, puedes cambiar esto fácilmente modificando la función `obtenerDatosEmpresa(rut)` en el archivo `src/sii/sii.service.ts` sin necesidad de alterar la lógica de la App en Flutter.

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
