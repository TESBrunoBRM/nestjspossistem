# Pruebas locales y reales SII

Actualizado: 2026-07-09

Esta guia describe como ejecutar las pruebas. El resultado vigente y sus hallazgos se mantienen solo en [current-status.md](./current-status.md).

## Tipos de prueba

| Suite | Alcance |
| --- | --- |
| Unit Jest | Servicios Nest, providers, seguridad y builders orquestados con transporte mockeado |
| E2E interno | API Nest real con SII mockeado |
| Tests sii-engine | Core fiscal embebido |
| Smoke MiniStack | S3, DynamoDB, SSM y persistencia entre reinicios |
| Smoke real boleta | Token, CAF, emision y consulta en certificacion SII |
| Smoke real CAF 33 | Disponibilidad, scraping e importacion CAF 33 |
| Smoke real factura 33 | Token, CAF, emision, `QueryEstUp`, `QueryEstDte` y muestra impresa |

## Preparacion del workspace

Despues de cambiar o actualizar la topologia del workspace:

```powershell
corepack pnpm install
```

Verificar que el enlace use el motor embebido:

```powershell
Get-Item node_modules/sii-engine | Format-List Target
```

El destino debe terminar en:

```text
business-app-sii\sii-engine
```

Si apunta a `business-app\sii-engine`, la instalacion esta probando el repositorio hermano antiguo.

## Assets sensibles

Ubicacion recomendada:

```text
secure/real-sii-tests/
```

PFX esperado por defecto:

```text
secure/real-sii-tests/certificado.pfx
```

No versionar PFX, password, CAF privados ni artefactos firmados.

## Variables

El loader actual de smoke lee automaticamente:

1. `.env.ministack`
2. `.env`

No lee automaticamente `.env.real-sii-tests`.

Si se mantienen las credenciales aisladas en `.env.real-sii-tests`, ejecutar mediante el runner sin abrir ni copiar el contenido:

```powershell
node scripts/ministack/run-with-env.cjs .env.real-sii-tests node scripts/real-sii/test-existing-caf-factura33.cjs
```

Variables minimas:

- `REAL_SII_TEST_RUT_EMISOR`
- `REAL_SII_TEST_RUT_FIRMANTE`
- `REAL_SII_TEST_FECHA_RESOLUCION`
- `REAL_SII_TEST_NRO_RESOLUCION`
- `REAL_SII_TEST_PFX_PATH`
- `REAL_SII_TEST_PFX_PASSWORD`
- `REAL_SII_TEST_ENVIRONMENT=CERTIFICACION`

Para importar un CAF 33 existente:

- `REAL_SII_TEST_FACTURA33_CAF_PATH`

Para impedir nuevas solicitudes CAF durante una regresion:

- `REAL_SII_TEST_SKIP_CAF_REQUEST=true`

## MiniStack

En una terminal dedicada:

```powershell
pnpm run ministack:start
```

En otra terminal:

```powershell
pnpm run ministack:bootstrap
pnpm run test:ministack-custody
```

El bootstrap debe verificar:

- bucket S3
- tabla DynamoDB
- `SecureString` SSM

## Unit, typecheck y E2E

```powershell
pnpm run typecheck:sii-engine
pnpm run test:sii-engine
pnpm exec tsc --noEmit
pnpm exec jest --runInBand
pnpm exec jest --config ./test/jest-e2e.json --runInBand
```

No interpretar Jest verde como reemplazo del typecheck.

## Smokes reales

Boleta 39:

```powershell
pnpm run test:real-sii
pnpm run test:real-sii:existing-caf
```

CAF 33 y factura 33:

```powershell
pnpm run test:real-sii:caf33
pnpm run test:real-sii:factura33
pnpm run test:real-sii:factura33:existing-caf
```

El smoke con CAF existente falla correctamente si no hay CAF activo en MiniStack o no se entrega `REAL_SII_TEST_FACTURA33_CAF_PATH`.

## Criterio de aprobacion real

Hasta que los assertions sean endurecidos, una suite Jest verde no basta. Revisar tambien:

- `trackId` no vacio
- estado de envio no rechazado (`RSC`, `RCT`, `RCH`, `RFR` u otro rechazo documentado)
- estadisticas sin documentos rechazados cuando la respuesta las incluya
- estado DTE final aceptado; un valor no vacio como `FAU` no es suficiente
- ausencia de reparos no permitidos
- artefactos correspondientes al mismo folio y `trackId`

Los artefactos quedan bajo:

```text
secure/real-sii-tests/artifacts/
```

## Fallos de precondicion

Los tests deben distinguir:

- archivo PFX ausente
- password ausente
- password/PFX incompatibles
- resolucion SII ausente o invalida
- CAF ausente, vencido o de otro tipo DTE
- bloqueo de red
- timeout de scraping
- rechazo del upload
- rechazo tributario posterior al upload

## Consumo de CAF y folios

- `test:real-sii:caf33` puede solicitar un CAF nuevo
- `test:real-sii:factura33` puede solicitar CAF y consumir un folio al emitir
- usar variantes `existing-caf` para regresiones frecuentes
- no ejecutar smokes reales en paralelo para el mismo emisor/tenant

