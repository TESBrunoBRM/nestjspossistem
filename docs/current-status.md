# Estado tecnico de business-app-sii

Estado: fuente canonica
Actualizado: 2026-07-10

Este documento contiene solo avances, validaciones y pendientes propios de `business-app-sii` y su motor `sii-engine`. La arquitectura comercial y la integracion con `business_app_back` se mantienen en [business_app_back/docs/sii-integration-proposal.md](../../business_app_back/docs/sii-integration-proposal.md).

## Resumen ejecutivo

La plataforma ya tiene implementacion para custodia fiscal por emisor, obtencion/importacion de CAF, boleta 39, factura 33, consultas de envio y consulta DTE. El 2026-07-10 se elimino la copia de `sii-engine` que estaba dentro de este repositorio; el unico motor canonico es ahora el repositorio hermano `../sii-engine`.

El motor separado y `business-app-sii` pasan typecheck. El motor pasa 104 tests, la aplicacion pasa 115 unit tests y 17 E2E, y MiniStack valida custodia persistente en S3, DynamoDB y SSM. Los fixtures CAF usan vigencia relativa y los smokes normales rechazan errores, reparos, estados desconocidos y estados DTE inconclusos.

Factura 33 todavia no puede declararse validada de extremo a extremo. La ultima ejecucion realizada por el desarrollador llego a certificacion, valido PFX/token, descargo e importo un CAF 33 y construyo la factura. El upload termino con `ECONNRESET`. El CAF contenia un solo folio, reservado antes del upload; el preflight posterior confirmo el rango custodiado como agotado. No se revierte porque el SII pudo haber recibido el sobre pese al corte de socket.

Para recuperar cualquier folio ya reservado existe un smoke parametrizado que reenvia su mismo `signed-envio-dte-attempt.xml`, no toca `nextFolio` y persiste el `trackId` para reanudar solo las consultas en ejecuciones posteriores. Tambien cuenta con validacion offline previa. El folio 16 fue recuperado exitosamente y obtuvo `trackId`; el SII lo acepto con reparo leve porque el smoke historico habia usado una razon social placeholder.

Las nuevas emisiones ignoran la razon social enviada por el cliente y usan siempre `DA/RS` del CAF asignado, tanto en boleta como en DTE legacy. Esto evita repetir el reparo `HED-1-863` cuando el CAF contiene el dato vigente.

El parser del motor reconoce `RLV - DTE Aceptado con Reparos Leves` como `RPR`, contabiliza tanto `<REPARO>` como `<REPAROS>` y los smokes rechazan estadisticas con reparos aunque la cabecera sea `EPR`.

## Implementado

### Plataforma fiscal

- backend NestJS privado con endpoints fiscales protegidos por API key de desarrollo
- contexto fiscal por tenant/emisor/ambiente
- custodia AWS-compatible de PFX/P12, password y CAF mediante S3, SSM y DynamoDB
- soporte local equivalente con MiniStack
- redaccion de secretos y respuestas publicas saneadas
- adquisicion e importacion de CAF desde portal SII
- disponibilidad de folios CAF 33 por scraping sin solicitar el CAF
- adquisicion CAF server-side: HTTP primero y fallback Playwright Chromium headless, sin dependencia automatica de Edge o GUI
- ante una negativa explicita a un timbraje nuevo, reobtencion HTTP de rangos previamente autorizados mediante `rf_reobtencion*_folios`; esa respuesta no dispara Playwright
- cantidad CAF adaptativa: toma los limites positivos informados por el portal hasta un maximo absoluto de 50; ante disponibilidad desconocida o 0/0 solicita solo 1

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
- el motor independiente pasa 21 archivos de prueba y 104 tests
- `business-app-sii` pasa `tsc --noEmit` y `nest build` consumiendo el repositorio separado

## Auditoria de pruebas del 2026-07-09

No se modifico codigo de aplicacion ni de tests durante esta auditoria.

### Hallazgos de calidad

#### Resuelto: el smoke real no aprueba documentos rechazados

Los smokes de boleta y factura usan aserciones semanticas compartidas:

- rechazan `RSC`, `RCT`, `RFR`, `RCH`, `RPR` y `UNKNOWN`
- rechazan estados DTE de error o inconclusos, incluido `FAU`
- una factura normal solo aprueba estado DTE `DOK`, `AND` o `ANC`
- esperan 5 segundos por defecto antes de `QueryEstUp` para no validar solo el acuse inicial
- permiten probar un rechazo solo mediante una expectativa explicita del estado esperado

La ventana se puede ajustar con `REAL_SII_TEST_STATUS_SETTLE_MS`, entre 0 y 60000 ms.

#### Resuelto: fixtures CAF dependientes de la fecha

Los CAF sinteticos ahora usan el dia anterior a la ejecucion y los certificados sinteticos se generan con una ventana movil de dos anos. Esto mantiene la semantica de vigencia sin depender del calendario.

#### Resuelto: topologia y cobertura del motor

El workspace usa exclusivamente `../sii-engine`; `node_modules/sii-engine` fue verificado contra esa ruta y ya no existe un motor dentro de `business-app-sii`. La suite propia del motor cubre CAF, TED, Latin-1, XMLDSig, transportes y parsers SII con 104 tests aprobados.

El typecheck general tambien esta verde despues de alinear los contratos entre ambos repositorios. CI debe conservar como gate la verificacion del destino del enlace para impedir que se reintroduzca una copia local.

#### Resuelto: cobertura E2E de POST /facturas

`test/fiscal.e2e-spec.ts` cubre readiness e importa un CAF 33 antes de ejecutar `POST /api/fiscal/documents/facturas`. Verifica HTTP, folio, `trackId`, estado y ausencia de secretos con transporte legacy mockeado.

#### Resuelto: tests con estado compartido y fallos en cascada

Cada E2E de emision, estado y muestra impresa prepara su propia boleta. Ya no se consulta `/undefined` cuando una emision anterior falla.

#### Resuelto: timeout y recursos abiertos en scraping real

La adquisicion CAF tiene un timeout total propio de 180 segundos por defecto y un timeout HTTP separado de 30 segundos antes del fallback Playwright. Al vencer aborta reintentos, cierra contextos Playwright y permite que Nest termine sin consumir otros 300 segundos en `afterAll`. Una negativa explicita del SII intenta reobtener un rango autorizado por HTTP; si no existe uno utilizable, termina como `manual_action_required` no reintentable en vez de abrir un navegador. Los diagnosticos publicos exponen solo nombres de controles e indicadores clasificados, no el texto identificatorio del portal.

### Riesgos de implementacion pendientes

El motor canonico ya codifica XML/TED en ISO-8859-1, extrae correctamente nodos `FRMA` con atributos y tiene pruebas especificas para ambos casos. Permanecen pendientes la validacion XSD oficial, golden fixtures completos de factura, evidencia de aceptacion tributaria real con datos acentuados y una imagen Linux que instale Chromium Playwright con sus dependencias de sistema.

## Resultados ejecutados

| Validacion                                     | Resultado                           | Diagnostico                                                                                     |
| ---------------------------------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------- |
| Build por script Corepack                      | Fallo de entorno                    | `ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING` en el shim local                                       |
| Build JS directo del `sii-engine` separado     | Paso                                | CJS, ESM y declaraciones generados correctamente                                                |
| Typecheck aislado `sii-engine`                 | Paso                                | El source del motor compila                                                                     |
| Tests `sii-engine`                             | 21 archivos, 104 tests: todos pasan | Incluye `RLV`, reparo singular y los casos migrados desde la copia eliminada                    |
| Typecheck general `business-app-sii`           | Paso                                | Resuelve tipos desde `../sii-engine`                                                            |
| Build `business-app-sii`                       | Paso                                | Nest compila consumiendo el motor separado                                                      |
| Unit tests Nest contra motor separado          | 17/17 suites; 115/115 tests pasan   | Incluye `EPR` con reparos, cantidad CAF adaptativa, timeout, runtime headless y reobtencion CAF |
| E2E interno                                    | 2/2 suites; 17/17 tests pasan       | Incluye limite CAF de 50, POST de factura 33 y emisiones aisladas por caso                      |
| Bootstrap MiniStack                            | Paso                                | S3, DynamoDB y SSM creados/verificados                                                          |
| Smoke custody MiniStack                        | Paso                                | PFX/password/CAF persisten entre reinicios y permiten reservar folio                            |
| Smoke factura 33 con CAF existente             | Bloqueado                           | Preflight custody-only: CAF 33 custodiado agotado tras reservar el folio del upload fallido     |
| Smoke factura 33 completo contra certificacion | Avance parcial                      | CAF descargado/importado; upload fallo con `ECONNRESET` antes de obtener `trackId`              |

## Estado por capacidad

| Capacidad                           | Estado actual                                               |
| ----------------------------------- | ----------------------------------------------------------- |
| Custodia por emisor                 | Implementada; regresion MiniStack verde                     |
| Token SII                           | Implementado; el smoke real alcanzo esta etapa              |
| Scraping CAF 39                     | Hito previo logrado                                         |
| Scraping CAF 33                     | Validado realmente: CAF descargado e importado en MiniStack |
| Boleta 39                           | Hito real previo; unitarios y E2E verdes                    |
| Factura 33                          | Codigo implementado; validacion real actual no cerrada      |
| QueryEstUp                          | Implementado y con tests de transporte mockeado             |
| QueryEstDte                         | Implementado y con test de transporte mockeado              |
| Persistencia de documentos/tracking | In-memory; pendiente para produccion                        |
| RVD automatico                      | Pendiente                                                   |
| XSD oficial y evidencia formal      | Pendiente                                                   |

## Proximos hitos

### Hito 1: mantener confiabilidad del gate de pruebas

- mantener fechas fiscales sinteticas relativas o reloj controlado
- mantener las aserciones de rechazo, reparo y estado DTE final
- conservar typecheck general como gate separado
- verificar en CI que `sii-engine` resuelve exclusivamente a `../sii-engine`
- fallar CI si reaparece `business-app-sii/sii-engine`
- mantener cada E2E con precondiciones independientes

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
