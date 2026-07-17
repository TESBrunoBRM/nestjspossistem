# Business App SII

Backend fiscal privado NestJS para custodiar material tributario y operar con el SII mediante el paquete hermano `sii-engine`.

Este repositorio no es la API publica de Flutter y no contiene el dominio comercial. `business_app_back` sigue siendo la frontera publica y delega aqui la emision fiscal.

## Documentacion

- [Indice tecnico](./docs/README.md)
- [Estado actual, auditoria y proximos hitos](./docs/current-status.md)
- [Runbook de pruebas fiscales](./docs/real-sii-testing.md)
- [Docker para certificacion y produccion](./docs/docker-testing-production.md)
- [Documentacion oficial SII](./docs_sii/)
- [Motor fiscal independiente](../sii-engine/README.md)

La propuesta de integracion comercial se mantiene en [business_app_back/docs/sii-integration-proposal.md](../business_app_back/docs/sii-integration-proposal.md) y no se duplica aqui.

## Responsabilidad

- resolver contexto fiscal por tenant, emisor y ambiente
- custodiar PFX/P12, password, CAF y folios en S3, SSM y DynamoDB compatibles
- reservar y compensar folios de forma atomica antes del upload
- construir, firmar, validar por XSD oficial, enviar y consultar documentos SII
- persistir metadata, TED, DTE firmado, sobre firmado, trackId y estado
- emitir notas 56/61 desde una factura 33/34 origen aceptada
- generar representaciones PDF A4 y termica 80 mm con PDF417
- sanear respuestas, proteger secretos y hospedar polling, RVD y automatizacion fiscal

## Limites

- Flutter no llama directo a este backend
- nunca se devuelven PFX, password, CAF completo, RSASK, token SII, cookies ni XML firmado
- ventas, usuarios, inventario, terminales y comprobantes offline pertenecen a `business_app_back`
- la API key actual es un mecanismo de desarrollo; produccion requiere autenticacion service-to-service, scopes, rotacion y auditoria
- `docs_sii` contiene solo fuentes oficiales

## Workspace

```text
business-app/
  business-app-sii/
    src/
    test/
    docs/
    docs_sii/
  sii-engine/
```

Instalacion:

```powershell
corepack enable
corepack pnpm install
```

Despues de instalar, `node_modules/sii-engine` debe apuntar a `../sii-engine`. No debe existir un directorio `business-app-sii/sii-engine`.

## Docker local

La configuracion no sensible vive en `.env`. PFX, password y API key viven en `secrets/`; no se guardan dentro de `.env`. Las pruebas reales solo se ejecutan mediante `compose.certification.yaml`.

Todos los comandos de CAF, emision y recuperacion se mantienen en el [runbook de pruebas fiscales](./docs/real-sii-testing.md).

API local:

```text
http://localhost:3000/api
```

## Validacion

```powershell
pnpm run typecheck:sii-engine
pnpm run test:sii-engine
pnpm exec tsc --noEmit
pnpm exec jest --runInBand
pnpm exec jest --config ./test/jest-e2e.json --runInBand
pnpm run sii:cert -- custody test
```

La imagen de aceptacion incluye `xmllint`, los XSD oficiales y Chromium Playwright. La validacion XSD ocurre antes del upload; un fallo previo libera solo el ultimo folio reservado. Una vez iniciado el upload, el folio no se libera automaticamente y se debe reconciliar para evitar duplicados.

Evidencia real al 2026-07-16:

- DTE 33 y 39 aceptados previamente en SII Certificacion
- DTE 34 folio 2 confirmado `DOK`
- DTE 41 folio 1 procesado con 1 aceptado, 0 rechazados y 0 reparos
- DTE 56 y 61 listos en codigo, unitarios y E2E; el smoke real esta bloqueado porque el portal SII no entrego sus CAF y Maullin expiro durante el fallback

## Endpoints fiscales principales

- `POST /api/fiscal/issuers`
- `POST /api/fiscal/folios/cafs`
- `GET /api/fiscal/folios/status`
- `POST /api/fiscal/folios/reserve`
- `POST /api/fiscal/folios/availability`
- `POST /api/fiscal/folios/requests`
- `POST /api/fiscal/documents/boletas` para 39/41
- `POST /api/fiscal/documents/facturas` para 33
- `POST /api/fiscal/documents/facturas-exentas` para 34
- `POST /api/fiscal/documents/facturas-compra` para 46
- `POST /api/fiscal/documents/guias-despacho` para 52
- `POST /api/fiscal/documents/notas-de-debito` para 56
- `POST /api/fiscal/documents/notas-de-credito` para 61
- `POST /api/fiscal/documents/:sourceInternalId/debit-notes`
- `POST /api/fiscal/documents/:sourceInternalId/credit-notes`
- `GET /api/fiscal/documents/:id/status`
- `GET /api/fiscal/documents/:id/dte-status`
- `GET /api/fiscal/documents/:id/pdf?format=a4|thermal`
- `GET /api/fiscal/documents/:id/printed-sample`
- `POST /api/fiscal/rvd`
