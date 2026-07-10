# Business App SII

Backend fiscal privado NestJS para custodiar material tributario y operar con el SII mediante el paquete hermano `sii-engine`.

Este repositorio no es la API publica de Flutter y no contiene el dominio comercial. `business_app_back` sigue siendo la frontera publica y delega aqui la emision fiscal.

## Documentacion

- [Indice tecnico](./docs/README.md)
- [Estado actual, auditoria y proximos hitos](./docs/current-status.md)
- [Pruebas locales y reales](./docs/real-sii-testing.md)
- [Documentacion oficial SII](./docs_sii/)
- [Motor fiscal independiente](../sii-engine/README.md)

La propuesta de integracion comercial se mantiene en [business_app_back/docs/sii-integration-proposal.md](../business_app_back/docs/sii-integration-proposal.md) y no se duplica aqui.

## Responsabilidad

- resolver contexto fiscal por tenant, emisor y ambiente
- custodiar PFX/P12, password y CAF
- reservar folios fiscales
- construir, firmar, enviar y consultar documentos SII
- sanear respuestas y proteger secretos
- hospedar polling, RVD y automatizacion fiscal operativa

## Limites

- Flutter no llama directo a este backend
- nunca se devuelven PFX, password, CAF completo, RSASK, token SII, cookies ni XML firmado
- ventas, usuarios, inventario, terminales y comprobantes offline pertenecen a `business_app_back`
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

## Desarrollo local

```powershell
pnpm run ministack:start
pnpm run ministack:bootstrap
pnpm run start:dev:ministack
```

Swagger local:

```text
http://localhost:3002/api
```

## Validacion

```powershell
pnpm run typecheck:sii-engine
pnpm run test:sii-engine
pnpm exec tsc --noEmit
pnpm exec jest --runInBand
pnpm exec jest --config ./test/jest-e2e.json --runInBand
```

Las pruebas contra certificacion SII y sus precondiciones estan documentadas en [docs/real-sii-testing.md](./docs/real-sii-testing.md).

## Endpoints fiscales principales

- `POST /api/fiscal/issuers`
- `POST /api/fiscal/folios/cafs`
- `POST /api/fiscal/folios/availability`
- `POST /api/fiscal/folios/requests`
- `GET /api/fiscal/folios/status`
- `POST /api/fiscal/documents/boletas`
- `POST /api/fiscal/documents/facturas`
- `GET /api/fiscal/documents/:id/status`
- `GET /api/fiscal/documents/:id/dte-status`
- `GET /api/fiscal/documents/:id/printed-sample`
- `POST /api/fiscal/rvd`

La API key actual es un mecanismo de desarrollo. Produccion requiere autenticacion service-to-service, scopes, rotacion y auditoria.
