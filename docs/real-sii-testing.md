# Pruebas locales y reales SII

Actualizado: 2026-07-10

Esta guia describe como ejecutar las pruebas. El resultado vigente y sus hallazgos se mantienen solo en [current-status.md](./current-status.md).

## Tipos de prueba

| Suite                 | Alcance                                                                             |
| --------------------- | ----------------------------------------------------------------------------------- |
| Unit Jest             | Servicios Nest, providers, seguridad y builders orquestados con transporte mockeado |
| E2E interno           | API Nest real con SII mockeado                                                      |
| Tests sii-engine      | Core fiscal del repositorio independiente                                           |
| Smoke MiniStack       | S3, DynamoDB, SSM y persistencia entre reinicios                                    |
| Smoke real boleta     | Token, CAF, emision y consulta en certificacion SII                                 |
| Smoke real CAF 33     | Disponibilidad, scraping e importacion CAF 33                                       |
| Smoke real factura 33 | Token, CAF, emision, `QueryEstUp`, `QueryEstDte` y muestra impresa                  |

## Preparacion del workspace

Despues de cambiar o actualizar la topologia del workspace:

```powershell
corepack pnpm install
```

Verificar que el enlace use el repositorio hermano:

```powershell
Get-Item node_modules/sii-engine | Format-List Target
```

El destino debe terminar en:

```text
business-app\sii-engine
```

Si apunta a `business-app-sii\sii-engine`, existe una copia interna obsoleta que debe eliminarse. El workspace solo admite el repositorio separado.

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

Para ajustar la espera entre upload y consulta de estado:

- `REAL_SII_TEST_STATUS_SETTLE_MS=5000` por defecto; admite entre 0 y 60000 ms

Para limitar toda la operacion de scraping CAF, incluidos sus reintentos:

- `SII_PORTAL_OPERATION_TIMEOUT_MS=180000` por defecto
- `SII_PORTAL_HTTP_TIMEOUT_MS=30000` por defecto para cada paso HTTP antes del fallback Playwright

El smoke de factura imprime un hito al comenzar y completar cada etapa y un heartbeat cada 10 segundos durante operaciones largas. El adapter tambien informa la ultima etapa HTTP/Playwright alcanzada. Los mensajes no incluyen RUT, token, PFX, password ni XML.

Antes de conectar al portal, el adapter valida que custody entregue certificado PEM, clave privada PEM y una fecha de expiracion vigente. Los fallos HTTP y de navegacion Playwright (`requestfailed`) se muestran saneados para distinguir timeout, TLS, certificado cliente o bloqueo de red.

Si el SII rechaza expresamente un timbraje nuevo porque existen situaciones pendientes o folios suficientes, el adapter intenta por HTTP la opcion oficial `Reobtencion de Folios`. Si no encuentra un rango utilizable, devuelve `manual_action_required` y no inicia Playwright. Los hints registran solo acciones, nombres de controles e indicadores clasificados; no incluyen el texto libre con identidades mostrado por el portal.

Factura 33 usa por defecto un techo de 50 folios. Antes de generar el CAF, el servicio consulta `Disponible` y `Maximo Autorizado` y solicita el menor valor positivo entre ambos y ese techo. Por ejemplo, con 3 disponibles solicita 3; con 1000 solicita 50. Si la disponibilidad falla o el portal informa 0/0, usa el fallback conservador de 1 folio. `REAL_SII_TEST_FACTURA33_CAF_QUANTITY` puede reducir el techo, pero nunca superar 50.

## Ejecucion headless y Linux

- la adquisicion intenta primero el flujo HTTP, que no necesita navegador
- la reobtencion de un CAF previamente autorizado tambien se ejecuta por HTTP y no necesita navegador
- si el portal no entrega el CAF por HTTP, usa Playwright con Chromium en modo headless
- el smoke fuerza `headless=true`; una ventana visible solo se habilita con `SII_PORTAL_DEBUG_BROWSER_VISIBLE=true`
- Edge y otros ejecutables del sistema no se detectan automaticamente; `SII_PORTAL_BROWSER_EXECUTABLE_PATH` debe configurarse de forma explicita
- Linux no necesita GUI ni X11, pero la imagen debe incluir Chromium de Playwright y sus librerias de sistema
- el repositorio aun no incluye un Dockerfile de runtime con esas dependencias; ese empaquetado sigue pendiente antes del despliegue Linux

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

Comprobar la custodia sin contactar al SII, solicitar CAF ni reservar folios:

```powershell
node scripts/ministack/run-with-env.cjs .env.real-sii-tests node scripts/real-sii/check-custodied-caf-factura33.cjs
```

Validar offline un envelope firmado reservado, indicando el folio:

```powershell
node scripts/ministack/run-with-env.cjs .env.real-sii-tests node scripts/real-sii/validate-retry-factura33-folio.cjs 16
```

Reenviar exactamente ese envelope, sin reservar ni liberar folios:

```powershell
node scripts/ministack/run-with-env.cjs .env.real-sii-tests node scripts/real-sii/retry-factura33-folio.cjs 16
```

El argumento puede ser cualquier folio positivo que tenga `secure/real-sii-tests/artifacts/factura33/<folio>/signed-envio-dte-attempt.xml`. El retry guarda `retry-result.json` junto al envelope apenas obtiene `trackId`. Si una consulta posterior falla, la siguiente ejecucion reutiliza ese `trackId` y no vuelve a subir el DTE.

La razon social del emisor enviada en nuevos DTE se toma siempre de `DA/RS` del CAF asignado. El texto recibido desde el cliente o desde variables de smoke no puede reemplazar ese dato fiscal autoritativo. Si la razon social del CAF ya no coincide con el registro actual del SII, debe obtenerse un CAF actualizado.

El smoke `fiscal-real-sii-factura33` rechaza cualquier ambiente distinto de `CERTIFICACION` antes de contactar al SII, aunque una variable local intente seleccionar produccion.

El modo `existing-caf` usa exclusivamente un CAF activo ya persistido en MiniStack. No solicita, reobtiene ni importa CAF desde archivos locales. Falla antes de emitir si la custodia no tiene folios restantes.

## Criterio de aprobacion real

Los smokes normales aplican estas condiciones como assertions obligatorias:

- `trackId` no vacio
- estado de envio no rechazado ni con reparos (`RSC`, `RCT`, `RCH`, `RFR`, `RPR` o `UNKNOWN` fallan)
- estadisticas sin documentos rechazados cuando la respuesta las incluya
- estado DTE `DOK`, `AND` o `ANC`; `FAU` y estados transitorios no son suficientes
- ausencia de reparos no permitidos
- `RLV` se normaliza como `RPR`; `<REPARO>` y `<REPAROS>` se contabilizan de la misma manera
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
- `test:real-sii:factura33:existing-caf` no solicita CAF, pero consume un folio si alcanza la emision
- `test:real-sii:factura33:custody-check` solo inspecciona la custodia y no consume folios
- una reserva no se revierte automaticamente ante `ECONNRESET` o timeout de upload: el SII pudo haber recibido el sobre aunque no llegara respuesta
- no ejecutar smokes reales en paralelo para el mismo emisor/tenant
