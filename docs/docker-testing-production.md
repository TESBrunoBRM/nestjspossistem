# Docker para certificacion y produccion

Estado: propuesta aprobada, pendiente de implementacion.

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

## Comandos objetivo

```powershell
docker compose -f compose.yaml -f compose.certification.yaml run --rm acceptance
docker compose -f compose.yaml -f compose.certification.yaml run --rm caf-acquisition
docker compose -f compose.yaml -f compose.production.yaml up -d
```

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
3. Migrar secretos desde `.env.real-sii-tests` a `secrets/`.
4. Validar custodia, boleta 39 y factura 33 en el nuevo flujo.
5. Retirar los runners MiniStack y loaders `.env` antiguos.

Los scripts MiniStack actuales se mantienen solo hasta completar los pasos 1 a
4, para no interrumpir las pruebas reales existentes.
