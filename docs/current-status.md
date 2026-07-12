# Estado tecnico de business-app-sii

Estado: fuente canonica
Actualizado: 2026-07-12

Este documento contiene solo avances, validaciones y pendientes propios de `business-app-sii` y su motor `sii-engine`. La arquitectura comercial y la integracion con `business_app_back` se mantienen en [business_app_back/docs/sii-integration-proposal.md](../../business_app_back/docs/sii-integration-proposal.md).

Los comandos operativos y flujos de factura, boleta, CAF y retry se mantienen
unicamente en [real-sii-testing.md](./real-sii-testing.md).

## Resumen ejecutivo

La plataforma ya tiene implementacion para custodia fiscal por emisor, obtencion/importacion de CAF, boleta 39, factura 33, consultas de envio y consulta DTE. El 2026-07-10 se elimino la copia de `sii-engine` que estaba dentro de este repositorio; el unico motor canonico es ahora el repositorio hermano `../sii-engine`.

El motor separado y `business-app-sii` pasan typecheck. El motor pasa 120 tests en Linux Docker, la aplicacion pasa 146 unit tests y 17 E2E, y MiniStack valida custodia persistente en S3, DynamoDB y SSM. Los fixtures CAF usan vigencia relativa y los smokes normales rechazan errores, reparos, estados desconocidos y estados DTE inconclusos.

Boleta tiene estrategias explicitas y mutuamente excluyentes por ambiente. En
Certificacion usa el contrato empiricamente validado el 2026-06-01: token DTE,
upload multipart a Maullin y consultas `QueryEstUp`/`QueryEstDte`. En Produccion
usa token de boleta, upload REST a Rahue y consultas REST en `api.sii.cl`. No hay
fallback automatico entre canales. Factura y RVD permanecen aislados en el
cliente DTE y no fueron redirigidos por este cambio.

El folio 34 de boleta fue recuperado y enviado exitosamente el 2026-07-12 mediante
Maullin/DTE. El SII devolvio `trackId` 253005150 y el correo de resultado confirmo
`EPR - Envio Procesado`, un documento informado, uno aceptado, cero rechazados y
cero reparos.
Los intentos REST previos de Certificacion devolvieron `HTTP 500 / Error 500` y
no fueron registrados por el SII, pero no dejaron metadata suficiente para
auditar completamente token, endpoint, headers y respuesta. El OpenAPI oficial
1.0.5 identifica Pangal como servidor de Certificacion para
`POST /boleta.electronica.envio` y exige token especifico de boleta. El
instructivo tecnico declara que los servidores de boleta son distintos de
Palena y Maullin. Esta documentacion contradice la evidencia empirica del
2026-06-01. La decision implementada prioriza para Certificacion el contrato
Maullin que obtuvo procesamiento real, manteniendo REST exclusivamente para
Produccion. La contradiccion queda documentada y debera revisarse si el SII
retira o modifica ese canal.

Los intentos de recuperacion por Maullin alcanzaron el servidor, pero usaban un
cliente distinto al envio historico y este respondio su HTML generico de error
de upload, sin `RECEPCIONDTE` ni `trackId`. La comparacion identifico una
diferencia concreta: el intento fallido enviaba `axios/1.16.0` como User-Agent,
mientras el flujo exitoso usaba el identificador historico del cliente SII. La
estrategia de Certificacion ahora reproduce endpoint, orden multipart, nombre y
tipo del archivo, Latin-1 y User-Agent del contrato exitoso. La regresion real del
folio 34 confirmo que este contrato vuelve a ser aceptado por el SII.

Los comandos de recuperacion rehidratan idempotentemente el PFX/password desde
los secretos Docker antes de usar la custodia. Esto repara referencias de perfil
que hayan sobrevivido a un objeto S3 ausente sin modificar CAF, `nextFolio` ni el
sobre firmado. El reconcile del folio 34 fue revalidado en verde y confirmo
`FAU - Documento No Recibido por el SII`.

Factura 33 ya alcanzo aceptacion real en SII Certificacion desde el entorno Docker. El flujo valido PFX/token, adquirio y custodio CAF 33, emitio el folio 17 y recibio `trackId`; el correo posterior del SII confirmo la factura aceptada. El smoke original dio un falso negativo porque consulto a los cinco segundos: `QueryEstUp` aun respondia `ERR_CODE=2` y `QueryEstDte` informaba `FAU - DTE No Recibido` mientras el envio seguia procesandose.

El smoke fue corregido para reintentar solo estados pendientes dentro de un timeout acotado. Rechazos, reparos y errores definitivos siguen fallando inmediatamente, y las estadisticas publicas de rechazados/reparos ya no se pierden en la capa de polling. Falta una nueva ejecucion real para cerrar la regresion automatizada corregida; no se debe reenviar el folio 17.

Para recuperar cualquier folio ya reservado existe un smoke parametrizado que reenvia su mismo `signed-envio-dte-attempt.xml`, no toca `nextFolio` y persiste el `trackId` para reanudar solo las consultas en ejecuciones posteriores. Tambien cuenta con validacion offline previa. El folio 16 fue recuperado exitosamente y obtuvo `trackId`; el SII lo acepto con reparo leve porque el smoke historico habia usado una razon social placeholder.

Las nuevas emisiones ignoran la razon social enviada por el cliente y usan siempre `DA/RS` del CAF asignado, tanto en boleta como en EnvioDTE. Esto evita repetir el reparo `HED-1-863` cuando el CAF contiene el dato vigente.

El parser del motor reconoce `RLV - DTE Aceptado con Reparos Leves` como `RPR`, contabiliza tanto `<REPARO>` como `<REPAROS>` y los smokes rechazan estadisticas con reparos aunque la cabecera sea `EPR`.

`EPR - Envio Procesado` ahora es terminal para `QueryEstUp`, segun el manual
oficial del SII. El polling conserva las estadisticas finales, reconoce las
variantes singulares `<ACEPTA>`/`<RECHAZA>` y registra cada consulta sin exponer
la respuesta fiscal cruda.

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

- boleta 39 con TED, `EnvioBOLETA` y transporte explicito por ambiente
- factura 33 mediante `EnvioDTE`
- endpoints declarados para 34, 46, 52, 56 y 61
- consulta de factura/RVD por `QueryEstUp` y factura por `QueryEstDte`
- consulta de boleta por `QueryEstUp`/`QueryEstDte` en Certificacion y REST en Produccion
- artefacto de muestra impresa con payload TED/PDF417
- almacenamiento local de artefactos de smoke bajo `secure/real-sii-tests/artifacts`

### Hitos comprobados previamente

- boleta 39 alcanzo certificacion SII, obtuvo `trackId` y permitio consulta de estado
- custodia PFX/password/CAF fue validada previamente sobre MiniStack

Estos hitos historicos no reemplazan una regresion verde en la fecha actual.

### Consolidacion de `sii-engine` del 2026-07-10

- se elimino por completo `business-app-sii/sii-engine`
- `pnpm-workspace.yaml`, el lockfile y `node_modules/sii-engine` apuntan a `../sii-engine`
- se conservaron en el motor canonico los aportes utiles de la copia: DTE 46/52, multipart EnvioDTE, parser `RECEPCIONDTE` y contrato oficial `getEstDte`
- se conservaron las defensas mas completas del repositorio separado: ISO-8859-1, parsing de `FRMA`, parsers de respuesta, polling, sanitizacion y registro de schemas
- el motor independiente pasa 25 archivos de prueba y 120 tests
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

El workspace usa exclusivamente `../sii-engine`; `node_modules/sii-engine` fue verificado contra esa ruta y ya no existe un motor dentro de `business-app-sii`. La suite propia del motor cubre CAF, TED, Latin-1, XMLDSig, transportes y parsers SII. La cobertura de canales y verificacion XMLDSig eleva el total a 114 tests verdes en Linux Docker.

El typecheck general tambien esta verde despues de alinear los contratos entre ambos repositorios. CI debe conservar como gate la verificacion del destino del enlace para impedir que se reintroduzca una copia local.

#### Resuelto: cobertura E2E de POST /facturas

`test/fiscal.e2e-spec.ts` cubre readiness e importa un CAF 33 antes de ejecutar `POST /api/fiscal/documents/facturas`. Verifica HTTP, folio, `trackId`, estado y ausencia de secretos con transporte DTE mockeado.

#### Resuelto: tests con estado compartido y fallos en cascada

Cada E2E de emision, estado y muestra impresa prepara su propia boleta. Ya no se consulta `/undefined` cuando una emision anterior falla.

#### Resuelto: timeout y recursos abiertos en scraping real

La adquisicion CAF tiene un timeout total propio de 180 segundos por defecto y un timeout HTTP separado de 30 segundos antes del fallback Playwright. Al vencer aborta reintentos, cierra contextos Playwright y permite que Nest termine sin consumir otros 300 segundos en `afterAll`. Una negativa explicita del SII intenta reobtener un rango autorizado por HTTP; si no existe uno utilizable, termina como `manual_action_required` no reintentable en vez de abrir un navegador. Los diagnosticos publicos exponen solo nombres de controles e indicadores clasificados, no el texto identificatorio del portal.

### Riesgos de implementacion pendientes

El motor canonico ya codifica XML/TED en ISO-8859-1, extrae correctamente nodos `FRMA` con atributos y tiene pruebas especificas para ambos casos. La imagen Linux con Chromium Playwright ya fue construida y validada headless. Permanecen pendientes la validacion XSD oficial, golden fixtures completos de factura, evidencia con datos acentuados y una regresion real verde del polling corregido.

## Resultados ejecutados

| Validacion                                 | Resultado                             | Diagnostico                                                                                             |
| ------------------------------------------ | ------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Build por script Corepack                  | Fallo de entorno                      | `ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING` en el shim local                                               |
| Build JS directo del `sii-engine` separado | Paso                                  | CJS, ESM y declaraciones generados correctamente                                                        |
| Typecheck aislado `sii-engine`             | Paso                                  | El source del motor compila                                                                             |
| Tests `sii-engine`                         | 25 archivos; 120/120 pasan            | Incluye estrategias separadas de boleta, contrato wire Maullin, polling EPR, XMLDSig, DTE/factura y RVD |
| Typecheck general `business-app-sii`       | Paso                                  | Resuelve tipos desde `../sii-engine`                                                                    |
| Build `business-app-sii`                   | Paso                                  | Nest compila consumiendo el motor separado                                                              |
| Unit tests Nest contra motor separado      | 20/20 suites; 146/146 tests pasan     | Incluye recuperacion firmada, `FAU`, CAF adaptativa y runtime headless                                  |
| E2E interno                                | 2/2 suites; 17/17 tests pasan         | Incluye limite CAF de 50, POST de factura 33 y emisiones aisladas por caso                              |
| Bootstrap MiniStack                        | Paso                                  | S3, DynamoDB y SSM creados/verificados                                                                  |
| Smoke custody MiniStack                    | Paso                                  | PFX/password/CAF persisten entre reinicios y permiten reservar folio                                    |
| Smoke factura 33 con CAF existente         | Paso                                  | CAF 33 adquirido, persistido y reutilizado desde MiniStack Docker                                       |
| Factura 33 real contra certificacion       | Aceptada por SII                      | Folio 17 aceptado; el smoke original dio falso negativo por estado transitorio                          |
| Polling corregido de factura 33            | Unitarios verdes; regresion pendiente | `FAU` se trata como no recibido; la consulta debe respetar la ventana de procesamiento                  |
| Boleta 39 real contra certificacion        | Aceptada por SII                      | Folio 34, trackId 253005150, `EPR`, 1 aceptada, 0 rechazadas y 0 reparos                                |

## Checklist de diagnostico: boleta 39, folio 34

Regla de seguridad: todos los comandos de esta investigacion usan exclusivamente
`CERTIFICACION`. `compose.certification.yaml` fija el ambiente y el parser de los
smokes rechaza cualquier otro valor. No se prueba contra Produccion.

### Matriz de evidencia

| ID     | Prueba o evidencia                                   | Resultado                                                                                                               | Conclusion                                                             |
| ------ | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| B39-01 | Identidad del artefacto y reserva                    | DTE 39, folio 34, emisor esperado; no reserva otro folio                                                                | Correcto                                                               |
| B39-02 | `retry validate` sobre original                      | XSD, TED/CAF y ambas XMLDSig validas                                                                                    | XML y firmas descartados como causa conocida                           |
| B39-03 | `retry prepare` y nueva validacion                   | Renueva timestamps y XMLDSig; TED preservado; todo valido                                                               | Preparacion correcta                                                   |
| B39-04 | REST Certificacion previo                            | `HTTP 500`; reconciliacion posterior `FAU`                                                                              | No recibido; causa inconclusa por falta de metadata de transporte      |
| B39-05 | Maullin con sobre original                           | HTML generico sin `trackId`; luego `FAU`                                                                                | No recibido                                                            |
| B39-06 | Maullin con sobre recien firmado, 2026-07-12 20:35Z  | Mismo HTML generico; luego `FAU`                                                                                        | Antiguedad de firma descartada                                         |
| B39-07 | OpenAPI SII 1.0.5 e instructivo de boleta            | Pangal exclusivo para POST de Certificacion; token y consultas REST de boleta                                           | Contrato oficial identificado                                          |
| B39-08 | Commits `d7b37a5` y `f2e384a`, 2026-06-01            | Maullin, token DTE, `form-data`, Latin-1 y `application/octet-stream`                                                   | Contrato historico localizado                                          |
| B39-09 | Aislamiento de factura y RVD                         | Conservan `DteSiiClient` y endpoints DTE                                                                                | Sin cambio funcional intencional                                       |
| B39-10 | Artefactos reales 26 y 31                            | `trackId` 250347014 y 250350294; correos SII con envio procesado                                                        | Maullin funciono realmente ese dia                                     |
| B39-11 | Comparacion XML 31 aceptado vs. 34                   | Misma estructura, orden, elementos y atributos; solo cambian datos fiscales, CAF, fechas y firmas derivadas             | No hay diferencia estructural que explique el fallo                    |
| B39-12 | Primer intento normal del folio 34                   | Error local `Cannot read properties of undefined (reading 'transport')`                                                 | No alcanzo al SII y no prueba fallo del cliente normal                 |
| B39-13 | Cabeceras historicas vs. retry                       | Historico: Mozilla 4.0; retry: `axios/1.16.0`. `Content-Length` y multipart equivalentes                                | Diferencia de transporte concreta y reproducible                       |
| B39-14 | Seleccion explicita por ambiente                     | Certificacion usa Maullin/DTE; Produccion usa Rahue/API REST; no existe fallback                                        | Canales separados en estrategias                                       |
| B39-15 | Contrato wire de Certificacion                       | Verifica orden multipart, Latin-1, nombre/tipo de archivo, User-Agent historico, `Content-Length` y ausencia de chunked | Contrato historico reproducido localmente                              |
| B39-16 | Regresiones sin red SII                              | Motor 120/120, Nest 146/146, E2E 17/17 y build runtime/acceptance verdes                                                | Cambio integrado sin mezclar factura                                   |
| B39-17 | `retry reconcile` con Maullin/DTE, 2026-07-12 22:13Z | `FAU - DTE No Recibido`; no reservo folios ni realizo upload                                                            | Folio 34 habilitado para preparar un sobre fresco                      |
| B39-18 | `retry send` con sobre fresco, 2026-07-12 22:15Z     | TrackId 253005150; correo SII `EPR`, informado 1, aceptado 1, sin rechazos ni reparos                                   | Flujo Maullin historico recuperado y validado realmente                |
| B39-19 | Cierre local posterior al upload                     | El upload termino, pero el polling trataba `EPR` como transitorio                                                       | Corregido: `EPR` terminal, trazas por intento y reanudacion sin upload |

Fuentes oficiales contrastadas:

- [OpenAPI de boleta del SII](https://www4c.sii.cl/bolcoreinternetui/api/)
- [Instructivo tecnico de boleta](https://www.sii.cl/factura_electronica/factura_mercado/Instructivo_Emision_Boleta_Elect.pdf)

### Hipotesis

- [x] XML, TED o XMLDSig invalidos: descartado por validacion offline.
- [x] Firma demasiado antigua: descartado por el intento con sobre recien firmado.
- [x] Folio ya recibido: descartado por reconciliaciones `FAU`.
- [x] PFX ausente en custodia: descartado por rehidratacion y firma correctas.
- [x] User-Agent del retry: diferencia corregida en la estrategia de
      Certificacion y cubierta por test wire-level.
- [ ] Diferencia de runtime Windows/host frente a Linux/Docker, incluida huella
      TLS o tratamiento del gateway SII.
- [ ] Proteccion temporal o rate limiting del gateway despues de varios intentos.
- [x] Resolver la seleccion operativa sin fallback: Maullin/DTE en
      Certificacion y Rahue/API REST en Produccion.
- [ ] Determinar la causa del antiguo `HTTP 500` de Pangal con el contrato y la
      trazabilidad corregidos. No bloquea el canal de Certificacion seleccionado.

### Siguiente secuencia controlada

- [x] Localizar y revisar los commits exactos del flujo exitoso del 2026-06-01.
- [x] Comparar sin exponer datos los XML de los folios 31 y 34.
- [x] Comparar localmente las cabeceras emitidas por el cliente historico y el
      retry fallido.
- [x] Agregar tests locales de endpoint, campos multipart, `Content-Length`,
      cookie y consultas de cada estrategia.
- [x] Agregar al trace el detalle sanitario de endpoint, HTTP status,
      content-type y bytes cuando exista una respuesta HTTP no exitosa.
- [x] Ejecutar regresiones locales y Docker sin contactar al SII: motor 120/120,
      Nest 146/146 y E2E 17/17.
- [x] Definir un adaptador unico de Certificacion que reproduce el contrato
      Maullin historico y no realiza fallback.
- [x] Incorporar el User-Agent historico y un test de contrato wire-level.
- [x] Construir los targets Docker `acceptance` y `runtime` con las estrategias
      separadas.
- [x] Ejecutar `retry reconcile` con Maullin/DTE; confirmo `FAU` sin reservar
      folios ni realizar upload.
- [x] Con `FAU`, preparar y validar nuevamente el folio 34.
- [x] Realizar un unico `retry send` a Maullin: trackId 253005150 y aceptacion
      sin reparos confirmada por el SII.
- [x] Corregir el cierre local posterior: `EPR` es terminal y cada intento de
      polling deja una traza sanitaria.
- [x] Permitir reanudar consultas desde un `trackId` persistido sin exigir un
      sobre fresco ni repetir el upload.

## Estado por capacidad

| Capacidad                           | Estado actual                                                                         |
| ----------------------------------- | ------------------------------------------------------------------------------------- |
| Custodia por emisor                 | Implementada; regresion MiniStack verde                                               |
| Token SII                           | DTE para factura/RVD y boleta Certificacion; boleta REST en Produccion                |
| Scraping CAF 39                     | Hito previo logrado                                                                   |
| Scraping CAF 33                     | Validado realmente: CAF descargado e importado en MiniStack                           |
| Boleta 39                           | Maullin/DTE validado realmente en Certificacion; Rahue/REST reservado para Produccion |
| Factura 33                          | Folio 17 aceptado realmente; revalidacion automatizada pendiente                      |
| QueryEstUp                          | Implementado para factura, RVD y boleta en Certificacion                              |
| QueryEstDte                         | Implementado para factura                                                             |
| Consultas de boleta                 | `QueryEstUp`/`QueryEstDte` en Certificacion; REST en Produccion                       |
| Persistencia de documentos/tracking | In-memory; pendiente para produccion                                                  |
| RVD automatico                      | Pendiente                                                                             |
| XSD oficial y evidencia formal      | Pendiente                                                                             |

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
