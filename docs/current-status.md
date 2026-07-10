# Estado tecnico de business-app-sii

Estado: fuente canonica
Actualizado: 2026-07-09

Este documento contiene solo avances, validaciones y pendientes propios de `business-app-sii` y su motor `sii-engine`. La arquitectura comercial y la integracion con `business_app_back` se mantienen en [business_app_back/docs/sii-integration-proposal.md](../../business_app_back/docs/sii-integration-proposal.md).

## Resumen ejecutivo

La plataforma ya tiene implementacion para custodia fiscal por emisor, obtencion/importacion de CAF, boleta 39, factura 33, consultas de envio y consulta DTE. Sin embargo, la auditoria del 2026-07-09 no permite declarar factura 33 como funcionalidad validada de extremo a extremo.

El codigo de factura existe, pero la suite actual presenta fallos de confiabilidad, el typecheck no esta verde y el smoke real no alcanzo la etapa de emision: la adquisicion de CAF 33 excedio su timeout. Ademas, el smoke puede aprobar con estados SII rechazados porque solo exige strings no vacios.

## Implementado

### Plataforma fiscal

- backend NestJS privado con endpoints fiscales protegidos por API key de desarrollo
- contexto fiscal por tenant/emisor/ambiente
- custodia AWS-compatible de PFX/P12, password y CAF mediante S3, SSM y DynamoDB
- soporte local equivalente con MiniStack
- redaccion de secretos y respuestas publicas saneadas
- adquisicion e importacion de CAF desde portal SII
- disponibilidad de folios CAF 33 por scraping sin solicitar el CAF

### Documentos

- boleta 39 con TED, `EnvioBOLETA`, upload y consulta por `trackId`
- factura 33 mediante `EnvioDTE` legacy
- endpoints declarados para 34, 46, 52, 56 y 61
- consulta de envio por `QueryEstUp`
- consulta de estado DTE por `QueryEstDte`
- artefacto de muestra impresa con payload TED/PDF417
- almacenamiento local de artefactos de smoke bajo `secure/real-sii-tests/artifacts`

### Hitos comprobados previamente

- boleta 39 alcanzo certificacion SII, obtuvo `trackId` y permitio consulta de estado
- custodia PFX/password/CAF fue validada previamente sobre MiniStack

Estos hitos historicos no reemplazan una regresion verde en la fecha actual.

## Auditoria de pruebas del 2026-07-09

No se modifico codigo de aplicacion ni de tests durante esta auditoria.

### Hallazgos de calidad

#### Critico: el smoke real de factura puede aprobar documentos rechazados

`test/fiscal-real-sii-factura33.smoke-spec.ts` exige `trackId` y estados no vacios, pero no exige aceptacion tributaria:

- `emitData.status` solo se valida con `toBeTruthy()`
- `normalizedStatus` solo se valida con `toBeTruthy()`
- el estado de `QueryEstDte` solo se valida con `toBeTruthy()`

Por lo tanto, estados como `RCH`, `RFR`, `RPR` o `FAU` pueden dejar la suite verde. Un `TRACKID` confirma recepcion del upload, no aceptacion del DTE.

#### Alto: fixtures CAF dependientes de la fecha

Los fixtures usan `FA=2026-01-01`. El motor considera expirado un CAF seis meses despues de su autorizacion. Al 2026-07-09 esos fixtures aparecen como `expired`, por lo que fallan reservas, boletas, factura 33, custody y readiness.

Los tests necesitan reloj controlado o fechas relativas. Una fecha fija convierte una suite valida en una suite rota con el paso del tiempo.

#### Alto: el workspace instalado puede probar el motor equivocado

`pnpm-workspace.yaml` ya apunta a `./sii-engine`, pero durante esta auditoria `node_modules/sii-engine` seguia enlazado a `../sii-engine`. La primera corrida uso el motor hermano antiguo; despues se repitio temporalmente contra el motor embebido.

Despues de cada cambio de topologia se debe ejecutar `pnpm install` y verificar el destino real del enlace. De lo contrario, una suite puede aprobar contra una implementacion distinta de la versionada en el repositorio.

#### Alto: cobertura insuficiente del sii-engine embebido

El paquete embebido contiene solo tres archivos de prueba y seis tests. No hay pruebas propias del paquete para:

- parser CAF y nodos XML con atributos como `FRMA`
- firma y verificacion TED
- encoding ISO-8859-1 con datos acentuados
- builder completo de factura 33
- XMLDSig de DTE y envelope
- parsing de rechazos/reparos de `QueryEstUp` y `QueryEstDte`

Las unidades de Nest cubren parte del armado, pero mockean el transporte y no sustituyen tests del core.

#### Alto: typecheck general no esta verde

`tsc --noEmit` falla por dos grupos:

- instalacion workspace incompleta para `vitest`, `tsup` y tipos de `node-forge`
- errores propios en mocks, tipos de respuestas publicas y el camino opcional `existingCaf33Path`

Jest no funciona como sustituto del typecheck; hoy ambos pueden entregar resultados diferentes.

#### Medio: el E2E interno no prueba POST /facturas

`test/fiscal.e2e-spec.ts` prueba readiness de factura 33, pero no el endpoint de emision `POST /api/fiscal/documents/facturas`, su validacion DTO ni su respuesta HTTP. La emision queda cubierta por una unidad con transporte mockeado y por el smoke real permisivo.

#### Medio: tests con estado compartido y fallos en cascada

El E2E de boleta comparte `internalId` entre casos. Si la emision falla, las pruebas posteriores consultan `undefined` y generan errores secundarios. Esto dificulta identificar la causa primaria y hace depender la suite del orden de ejecucion.

#### Medio: timeout y recursos abiertos en scraping real

El smoke completo de factura 33 excedio 300 segundos durante adquisicion de CAF. El hook `afterAll` tambien excedio 300 segundos y Jest informo handles abiertos. El adapter necesita cancelacion y cierre determinista cuando el test expira.

### Riesgos de implementacion no cubiertos

- el `sii-engine` embebido firma el `DD` del TED usando UTF-8 aunque los XML declaran ISO-8859-1; la prueba real usa datos mayormente ASCII y no detecta diferencias con acentos
- `parseCaf` convierte `FRMA` con `String(...)`; cuando el parser entrega un nodo con atributos, existe riesgo de obtener `[object Object]`

Estos puntos requieren tests especificos antes de confiar en factura con datos tributarios reales que contengan caracteres Latin-1.

## Resultados ejecutados

| Validacion | Resultado | Diagnostico |
| --- | --- | --- |
| Build por script Corepack | Fallo de entorno | `ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING` en el shim local |
| Build JS directo del `sii-engine` embebido | Paso | CJS y ESM generados correctamente |
| Typecheck aislado `sii-engine` con dependencias resueltas | Paso | El source del motor compila |
| Tests `sii-engine` | 3 suites, 6 tests: todos pasan | Cobertura demasiado pequena para factura/TED/CAF |
| Typecheck general `business-app-sii` | Fallo | Errores de workspace y tipos de tests/API |
| Unit tests Nest contra motor embebido | 12/16 suites; 65/79 tests pasan | 14 fallos, principalmente CAF fixture expirado |
| E2E interno | 1/2 suites; 9/15 tests pasan | 6 fallos, principalmente CAF expirado y cascada por `internalId` |
| Bootstrap MiniStack | Paso | S3, DynamoDB y SSM creados/verificados |
| Smoke custody MiniStack | Fallo | No encontro CAF activo porque el fixture esta expirado |
| Smoke factura 33 con CAF existente | Bloqueado | No habia CAF 33 activo para el tenant de prueba |
| Smoke factura 33 completo contra certificacion | Fallo | Token iniciado; adquisicion CAF excedio 300 s, cierre excedio 300 s; no hubo emision |

## Estado por capacidad

| Capacidad | Estado actual |
| --- | --- |
| Custodia por emisor | Implementada; regresion actual bloqueada por fixture expirado |
| Token SII | Implementado; el smoke real alcanzo esta etapa |
| Scraping CAF 39 | Hito previo logrado |
| Scraping CAF 33 | Implementado, pero timeout en la auditoria actual |
| Boleta 39 | Hito real previo; regresion actual no verde |
| Factura 33 | Codigo implementado; validacion real actual no cerrada |
| QueryEstUp | Implementado y con tests de transporte mockeado |
| QueryEstDte | Implementado y con test de transporte mockeado |
| Persistencia de documentos/tracking | In-memory; pendiente para produccion |
| RVD automatico | Pendiente |
| XSD oficial y evidencia formal | Pendiente |

## Proximos hitos

### Hito 1: recuperar confiabilidad del gate de pruebas

- eliminar fechas CAF fijas o congelar el reloj
- hacer que los smokes fallen ante estados rechazados o reparos no permitidos
- agregar typecheck general como gate separado
- verificar en CI que `sii-engine` resuelve al subdirectorio embebido
- aislar cada E2E o crear precondiciones independientes

### Hito 2: cobertura fiscal del core

- tests de CAF con atributos XML y `FRMA` real
- tests TED con Latin-1, acentos y verificacion con clave publica CAF
- golden fixtures de factura 33 y validacion XSD
- XMLDSig verificable para DTE y `SetDTE`
- casos de aceptacion, rechazo, reparo y estado transitorio

### Hito 3: factura 33 real aceptada

- estabilizar adquisicion/importacion de CAF 33
- ejecutar emision real con datos tributarios autorizados
- exigir estado final aceptado, no solo `trackId`
- conservar XML, envelope, respuesta y metadata como evidencia protegida

### Hito 4: lifecycle durable

- persistir documentos, envelopes, intentos y snapshots de estado
- locks transaccionales para folios
- workers de polling con backoff y rate limits
- auditoria por tenant, emisor, ambiente y request

### Hito 5: cierre de boleta y operacion

- RVD diario automatico y `SecEnvio` durable
- conciliacion de boletas con RVD
- alertas por CAF/certificado, rechazo, reparo y tracks pendientes
- autenticacion service-to-service en reemplazo de la API key de desarrollo

## Limites

- `business-app-sii` no es API publica para Flutter
- no contiene reglas de venta, inventario, usuarios ni terminales
- `docs_sii` permanece reservado para fuentes oficiales
- la propuesta de integracion comercial no se duplica aqui
