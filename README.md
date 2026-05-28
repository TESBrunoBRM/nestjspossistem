# NestJS SII - Backend POS directo con sii-engine

Backend NestJS para que el POS Flutter emita, envie y consulte documentos tributarios usando la libreria local `sii-engine`.

SimpleAPI queda fuera del diseno y del runtime. El backend no debe tener fallback, API keys, URLs, DTOs ni rutas productivas asociadas a SimpleAPI.

## Arquitectura actual

- `sii-engine` resuelve XML, firma, token SII, envio, consulta de estado, normalizacion de estados y sugerencia de polling.
- Nest actua como host operacional: resuelve contexto de emisor, inyecta certificados/CAF mediante providers, expone API REST y orquesta polling.
- El polling productivo pertenece al backend host. La libreria solo consulta y clasifica.
- La primera integracion usa providers in-memory para desarrollo y tests. No son persistencia productiva.

## Endpoints fiscales

Todos los endpoints nuevos viven bajo `/api/fiscal`.

- `GET /api/fiscal/health`: health del modulo fiscal directo.
- `POST /api/fiscal/documents/boletas`: emision/envio de boleta electronica usando `sii-engine`.
- `POST /api/fiscal/polling/send-status`: consulta puntual de estado por `trackId`.
- `POST /api/fiscal/rvd`: envio de Resumen de Ventas Diarias.

Los endpoints mutables requieren `x-api-key` usando `API_KEY_FRONTEND`. El health fiscal queda abierto para diagnostico basico.

## Configuracion

Variables relevantes:

- `API_KEY_FRONTEND`: clave que debe enviar Flutter en `x-api-key`.
- `PORT`: puerto HTTP opcional.
- `CORS_ORIGIN`: origen permitido opcional.
- `SII_AMBIENTE`: default opcional de desarrollo si el host decide usarlo.

No se deben configurar datos de emisor, RUT de certificado, PFX, password ni CAF en `.env` para emision productiva. Esos datos deben entrar por onboarding/storage del host y resolverse por `IssuerContext`, `SigningProvider` y `FolioProvider`.

## Contexto dinamico

Cada comercio debe operar con un `context` propio:

```json
{
  "environment": "CERTIFICATION",
  "rutEmisor": "12345678-9",
  "fechaResolucion": "2026-01-01",
  "nroResolucion": 0,
  "tenantId": "tenant-demo",
  "merchantId": "merchant-demo",
  "branchId": "branch-1",
  "certificateRef": "default"
}
```

El `certificateRef` o `certificateFingerprint` permite cachear token por certificado y evita mezclar credenciales entre comercios.

## Instalacion

Desde el workspace raiz `C:/Users/bbrev/OneDrive/Desktop`:

```bash
corepack pnpm install
```

El workspace incluye:

- `nest/myfirstapp`
- `biblioteca sii/sii-engine`

`myfirstapp` consume `sii-engine` como `workspace:*`.

## Validacion

Comandos esperados:

```bash
npm.cmd run build
npm.cmd test -- --runInBand
npm.cmd run test:e2e -- --runInBand
```

Para `sii-engine`:

```bash
npm.cmd run typecheck -- --pretty false
npm.cmd test
npm.cmd run build
```

## Pendiente productivo

- Reemplazar providers in-memory por storage cifrado de certificados y CAF.
- Persistir `trackId`, snapshots de estado, XML crudo y errores normalizados.
- Implementar workers/colas/locks/rate limits para polling durable.
- Crear flujo de onboarding seguro para cargar PFX, password y CAF fuera de los endpoints de emision.
- Completar Factura 33 y documentos posteriores segun fases del roadmap.
