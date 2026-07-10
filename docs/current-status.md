# Estado tecnico de business-app-sii

Estado: fuente canonica
Actualizado: 2026-07-10

Este documento contiene solo avances, validaciones y pendientes propios de `business-app-sii` y su motor `sii-engine`. La arquitectura comercial y la integracion con `business_app_back` se mantienen en [business_app_back/docs/sii-integration-proposal.md](../../business_app_back/docs/sii-integration-proposal.md).

## Resumen ejecutivo

La plataforma ya tiene implementacion para custodia fiscal por emisor, obtencion/importacion de CAF, boleta 39, factura 33, consultas de envio y consulta DTE. El 2026-07-10 se elimino la copia de `sii-engine` que estaba dentro de este repositorio; el unico motor canonico es ahora el repositorio hermano `../sii-engine`.

El motor separado y `business-app-sii` pasan typecheck, el motor pasa sus 103 tests y la aplicacion compila contra el enlace externo. Todavia no se puede declarar factura 33 validada de extremo a extremo: los unit tests de la aplicacion tienen fixtures CAF vencidos y el smoke real puede aprobar estados SII rechazados porque solo exige strings no vacios.

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

### Consolidacion de `sii-engine` del 2026-07-10

- se elimino por completo `business-app-sii/sii-engine`
- `pnpm-workspace.yaml`, el lockfile y `node_modules/sii-engine` apuntan a `../sii-engine`
- se conservaron en el motor canonico los aportes utiles de la copia: DTE 46/52, multipart legacy, parser `RECEPCIONDTE` y contrato oficial `getEstDte`
- se conservaron las defensas mas completas del repositorio separado: ISO-8859-1, parsing de `FRMA`, parsers de respuesta, polling, sanitizacion y registro de schemas
- el motor independiente pasa 21 archivos de prueba y 103 tests
- `business-app-sii` pasa `tsc --noEmit` y `nest build` consumiendo el repositorio separado

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

#### Resuelto: topologia y cobertura del motor

El workspace usa exclusivamente `../sii-engine`; `node_modules/sii-engine` fue verificado contra esa ruta y ya no existe un motor dentro de `business-app-sii`. La suite propia del motor cubre CAF, TED, Latin-1, XMLDSig, transportes y parsers SII con 103 tests aprobados.

El typecheck general tambien esta verde despues de alinear los contratos entre ambos repositorios. CI debe conservar como gate la verificacion del destino del enlace para impedir que se reintroduzca una copia local.

#### Medio: el E2E interno no prueba POST /facturas

`test/fiscal.e2e-spec.ts` prueba readiness de factura 33, pero no el endpoint de emision `POST /api/fiscal/documents/facturas`, su validacion DTO ni su respuesta HTTP. La emision queda cubierta por una unidad con transporte mockeado y por el smoke real permisivo.

#### Medio: tests con estado compartido y fallos en cascada

El E2E de boleta comparte `internalId` entre casos. Si la emision falla, las pruebas posteriores consultan `undefined` y generan errores secundarios. Esto dificulta identificar la causa primaria y hace depender la suite del orden de ejecucion.

#### Medio: timeout y recursos abiertos en scraping real

El smoke completo de factura 33 excedio 300 segundos durante adquisicion de CAF. El hook `afterAll` tambien excedio 300 segundos y Jest informo handles abiertos. El adapter necesita cancelacion y cierre determinista cuando el test expira.

### Riesgos de implementacion pendientes

El motor canonico ya codifica XML/TED en ISO-8859-1, extrae correctamente nodos `FRMA` con atributos y tiene pruebas especificas para ambos casos. Permanecen pendientes la validacion XSD oficial, golden fixtures completos de factura y evidencia de aceptacion tributaria real con datos acentuados.

## Resultados ejecutados

| Validacion | Resultado | Diagnostico |
| --- | --- | --- |
| Build por script Corepack | Fallo de entorno | `ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING` en el shim local |
| Build JS directo del `sii-engine` separado | Paso | CJS, ESM y declaraciones generados correctamente |
| Typecheck aislado `sii-engine` | Paso | El source del motor compila |
| Tests `sii-engine` | 21 archivos, 103 tests: todos pasan | Incluye los casos migrados desde la copia eliminada |
| Typecheck general `business-app-sii` | Paso | Resuelve tipos desde `../sii-engine` |
| Build `business-app-sii` | Paso | Nest compila consumiendo el motor separado |
| Unit tests Nest contra motor separado | 12/16 suites; 65/79 tests pasan | 14 fallos por CAF fixtures expirados; no son errores de resolucion del paquete |
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
- conservar typecheck general como gate separado
- verificar en CI que `sii-engine` resuelve exclusivamente a `../sii-engine`
- fallar CI si reaparece `business-app-sii/sii-engine`
- aislar cada E2E o crear precondiciones independientes

### Hito 2: cobertura fiscal del core

- mantener tests de CAF con atributos XML, `FRMA` real y TED Latin-1
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
