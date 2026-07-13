# Docker para certificacion y produccion

Estado: implementado.

## Checklist de avance

- [x] Definir una imagen multi-stage con targets `runtime` y `acceptance`.
- [x] Mantener `sii-engine` como repositorio hermano mediante contexto relativo.
- [x] Crear Compose compartido, de produccion y de certificacion.
- [x] Empaquetar MiniStack con version fija y volumen persistente.
- [x] Separar smoke con CAF custodiado de adquisicion CAF explicita.
- [x] Montar PFX y password como Docker Secrets.
- [x] Consolidar configuracion local no sensible en un unico `.env`.
- [x] Validar build completo del target `runtime`.
- [x] Validar build completo del target `acceptance`.
- [x] Validar healthcheck y bootstrap de MiniStack en Docker.
- [x] Ejecutar smoke de custodia dentro de Docker.
- [x] Migrar manualmente PFX/password locales a `secrets/`.
- [x] Ejecutar factura 33 con CAF custodiado contra SII Certificacion: folio 17 aceptado.
- [x] Revalidar el smoke completo de factura 33 con polling corregido.
- [x] Ejecutar boleta 39 con CAF custodiado contra SII Certificacion: folio 34 aceptado sin reparos.
- [x] Retirar runners MiniStack, loaders `.env` y comandos legacy.
- [x] Unificar adquisicion, consulta y emision 33/39 bajo `sii:cert`.
- [x] Implementar retry 33/39 con Strategy, validacion offline e idempotencia por `trackId`.
- [x] Separar boleta por ambiente: Maullin/DTE en Certificacion y Rahue/API REST en Produccion, sin fallback.
- [x] Mantener factura y RVD aislados en el cliente DTE.
- [x] Bloquear los smokes reales si el ambiente no es `CERTIFICACION`.
- [x] Retirar pagina demo, boilerplate Nest y wrappers Jest sin logica propia.

## Objetivo

Empaquetar `business-app-sii` de forma portable para ejecutarlo en un VPS,
Fargate o cualquier runtime Docker, y permitir pruebas locales completas contra
el ambiente de certificacion del SII sin depender de una cuenta AWS.

## Estructura propuesta

```text
Dockerfile
compose.yaml
compose.production.yaml
compose.certification.yaml
.env.example
secrets/                 # ignorado por Git
```

El `Dockerfile` tendra dos targets construidos desde el mismo codigo y artefacto:

| Target       | Uso                                                        |
| ------------ | ---------------------------------------------------------- |
| `runtime`    | Imagen minima para produccion                              |
| `acceptance` | Imagen de certificacion con Jest, tests y herramientas SII |

La imagen `runtime` no incluira tests, fixtures ni dependencias de desarrollo.
Ambos targets incluiran Chromium y las librerias requeridas por Playwright para
que la adquisicion CAF funcione en Linux headless.

## Servicios Compose

`compose.yaml` define la red, volumenes y configuracion compartida.

`compose.production.yaml` levanta solamente `business-app-sii` con el target
`runtime`. La persistencia y los secretos se configuran en el entorno donde se
despliegue, sin cambiar la imagen.

`compose.certification.yaml` define:

- `ministack`: custodia local compatible con S3, SSM y DynamoDB
- `ministack-init`: crea bucket, tabla y parametros requeridos
- servicios efimeros para custodia, CAF y emision contra SII Certificacion

El estado de MiniStack se conserva en un volumen nombrado para reutilizar PFX,
CAF y reservas entre ejecuciones.

## Operacion

Este documento define la topologia Docker, no la secuencia de uso. Los comandos,
precondiciones, diagramas y flujos de factura 33 y boleta 39 se mantienen solo
en el [runbook de pruebas fiscales](./real-sii-testing.md).

## Configuracion y secretos

Se elimina la necesidad de mantener archivos `.env` por cada tipo de prueba:

- `.env.example`: contrato versionado de variables no sensibles
- `.env`: valores locales no sensibles, ignorado por Git
- `secrets/certificado.pfx`: certificado local, ignorado por Git
- `secrets/pfx-password.txt`: password local, ignorado por Git

El PFX y password nunca se copian a la imagen ni se pasan como argumentos de
build. En produccion se inyectan mediante el mecanismo de secretos del host.
`CERTIFICACION` queda fijado en Compose y validado nuevamente por el test.

## Evidencia

Los builds ejecutados, conteos de pruebas e hitos reales contra el SII se
registran exclusivamente en [current-status.md](./current-status.md).

## Criterios de cierre

- la misma revision de codigo genera `runtime` y `acceptance`
- produccion funciona sin Jest ni archivos de prueba
- certificacion funciona en Windows y Linux sin GUI
- los tests locales no requieren credenciales ni servicios AWS reales
- PFX, password, CAF y XML firmados no quedan en Git ni en capas Docker
- el flujo con CAF existente no solicita ni reserva rangos nuevos
- logs salen por `stdout`/`stderr` y no exponen secretos ni XML sensibles

## Migracion

1. Crear Dockerfile multi-stage y los tres archivos Compose.
2. Incorporar healthchecks, usuario no root y manejo de `SIGTERM`.
3. Migrar secretos a `secrets/`.
4. Validar custodia, boleta 39 y factura 33 en el nuevo flujo.
5. Retirar los runners MiniStack y loaders `.env` antiguos.

La migracion esta completa: `bootstrap.cjs` recibe solo variables inyectadas por
Compose y no existe una ruta de ejecucion basada en archivos `.env` legacy.
