# Docker para certificacion y produccion

Estado: implementacion en curso.

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
- [ ] Revalidar el smoke completo de factura 33 con polling corregido.
- [ ] Ejecutar boleta 39 con CAF custodiado contra SII Certificacion.
- [x] Retirar runners MiniStack, loaders `.env` y comandos legacy.

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

`compose.certification.yaml` levanta:

- `ministack`: custodia local compatible con S3, SSM y DynamoDB
- `ministack-init`: crea bucket, tabla y parametros requeridos
- `acceptance`: ejecuta una suite explicita contra SII Certificacion y termina

El estado de MiniStack se conserva en un volumen nombrado para reutilizar PFX,
CAF y reservas entre ejecuciones.

## Flujo de testing

1. Construir el target `acceptance`.
2. Levantar MiniStack y esperar su healthcheck.
3. Inicializar la custodia local de manera idempotente.
4. Montar PFX y password desde Docker Secrets.
5. Usar por defecto un CAF activo ya custodiado.
6. Emitir y consultar el estado final en SII Certificacion.
7. Fallar ante rechazo, reparo no esperado, timeout o estado inconcluso.
8. Eliminar los contenedores efimeros y conservar el volumen de custodia.

La solicitud de un CAF nuevo sera un comando separado y explicito. Las suites no
se ejecutaran en paralelo para un mismo emisor y no podran seleccionar el
ambiente de produccion del SII.

## Configuracion y secretos

Se elimina la necesidad de mantener archivos `.env` por cada tipo de prueba:

- `.env.example`: contrato versionado de variables no sensibles
- `.env`: valores locales no sensibles, ignorado por Git
- `secrets/certificado.pfx`: certificado local, ignorado por Git
- `secrets/pfx-password.txt`: password local, ignorado por Git

El PFX y password nunca se copian a la imagen ni se pasan como argumentos de
build. En produccion se inyectan mediante el mecanismo de secretos del host.
`CERTIFICACION` queda fijado en Compose y validado nuevamente por el test.

## Preparacion local

1. Crear `.env` a partir de `.env.example` y completar solo datos no sensibles.
2. Colocar el PFX en `secrets/certificado.pfx`.
3. Colocar solo la password en `secrets/pfx-password.txt`.
4. Para produccion, colocar la API key en `secrets/api-key.txt`.

No se debe copiar `REAL_SII_TEST_PFX_PASSWORD` al nuevo `.env`.

## Comandos disponibles

```powershell
pnpm run docker:build
pnpm run docker:certification:custody
pnpm run docker:certification:custody-check
pnpm run docker:certification:factura33
pnpm run docker:certification:boleta39
pnpm run docker:certification:caf33
pnpm run docker:production:up
```

`factura33` y `boleta39` usan solo CAF custodiado. `caf33` es la unica de estas
operaciones autorizada para solicitar un CAF nuevo.

## Validacion realizada

El 2026-07-11 se verifico sin contactar al SII:

- build Linux de `runtime` y `acceptance`
- runtime productivo saludable como usuario `pwuser` y sin Jest
- Chromium Playwright funcionando en modo headless
- MiniStack 1.3.54 saludable con estado persistente
- bootstrap idempotente de S3, DynamoDB y SSM
- smoke de custodia: 1 suite y 1 test aprobados

El 2026-07-12 se verifico contra SII Certificacion:

- adquisicion CAF 33 y persistencia en custodia Docker
- factura 33 folio 17 aceptada por SII
- el smoke detecto un falso negativo por consultar mientras el SII aun procesaba el envio; se incorporo polling acotado sin relajar rechazos ni reparos

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
