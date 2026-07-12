# Pruebas fiscales

Actualizado: 2026-07-12

Las pruebas unitarias y E2E internas no contactan al SII. Las pruebas reales se
ejecutan exclusivamente en Docker contra SII Certificacion y usan MiniStack para
la custodia local compatible con S3, DynamoDB y SSM.

El estado y los hitos vigentes se mantienen en [current-status.md](./current-status.md).
La arquitectura Docker se documenta en [docker-testing-production.md](./docker-testing-production.md).

## Preparacion

- `.env`: configuracion local no sensible basada en `.env.example`
- `secrets/certificado.pfx`: certificado del firmante
- `secrets/pfx-password.txt`: password del PFX
- `secrets/api-key.txt`: API key para el runtime productivo

No se admiten passwords, PFX ni CAF privados dentro de `.env` o de la imagen.
`CERTIFICACION` esta fijado por Compose y validado otra vez por cada smoke.

## Pruebas sin SII

```powershell
pnpm.cmd run sii:cert -- custody test
pnpm.cmd run sii:cert -- caf check --type=33
pnpm.cmd run sii:cert -- caf check --type=39
```

`custody test` valida MiniStack con datos sinteticos. `caf check` confirma que
existe un CAF activo con folios disponibles, sin contactar al SII ni emitir.

## Pruebas con SII Certificacion

```powershell
pnpm.cmd run sii:cert -- caf acquire --type=33
pnpm.cmd run sii:cert -- caf acquire --type=39 --quantity=5
pnpm.cmd run sii:cert -- emit --type=factura
pnpm.cmd run sii:cert -- emit --type=boleta
```

- `caf acquire` solicita folios y no debe ejecutarse como regresion comun
- `emit` exige CAF custodiado y consume un folio; nunca adquiere CAF implicitamente
- `--quantity` es un maximo entre 1 y 50; la disponibilidad real puede reducirlo
- las suites no deben ejecutarse en paralelo para el mismo emisor
- `pnpm.cmd run sii:cert -- down` detiene contenedores pero conserva la custodia
- no usar `docker-compose down -v`: elimina el volumen fiscal local

## Criterio de aprobacion

Todos los comandos `sii:cert` y smokes reales de este documento se ejecutan solo
en `CERTIFICACION`. La composicion Docker fija el valor y las precondiciones del
test fallan si se configura otro ambiente.

- upload con `trackId`
- estado de envio sin rechazo ni reparos
- estadisticas sin documentos rechazados ni reparados
- factura con estado DTE final `DOK`, `AND` o `ANC`
- estados transitorios se reintentan con timeout acotado
- `RSC`, `RCT`, `RCH`, `RFR`, `RPR` y errores DTE definitivos fallan de inmediato
- respuestas y logs sin PFX, password, token, CAF completo ni XML firmado

Boleta usa el contrato REST dedicado sin fallback. En Certificacion obtiene el
token de boleta en `apicert.sii.cl`, envia a `pangal.sii.cl` y consulta en
Apicert. En Produccion usa `api.sii.cl` y `rahue.sii.cl`. Maullin y Palena se
reservan para los flujos DTE que correspondan. RVD conserva su transporte DTE y
factura conserva `DteSiiClient`.

El polling de factura usa por defecto 120 segundos, con intervalos de 10
segundos. Puede ajustarse mediante `SII_CERT_POLL_TIMEOUT_MS` y
`SII_CERT_POLL_INTERVAL_MS` en `.env`.

## Recuperacion de folios

Validar offline un envelope ya reservado:

```powershell
pnpm.cmd run sii:cert -- retry validate --type=33 --folio=16
pnpm.cmd run sii:cert -- retry validate --type=39 --folio=34
```

Para boleta 39, confirmar primero que el SII no la recibio, preparar un sobre
nuevo y validarlo antes del unico upload:

```powershell
docker compose -f compose.yaml -f compose.certification.yaml build emit-boleta39
pnpm.cmd run sii:cert -- retry reconcile --type=39 --folio=34
pnpm.cmd run sii:cert -- retry prepare --type=39 --folio=34
pnpm.cmd run sii:cert -- retry validate --type=39 --folio=34
pnpm.cmd run sii:cert -- retry send --type=39 --folio=34
```

`retry prepare` solo admite boleta 39 y requiere `confirmed_not_received`.
Conserva byte a byte el TED ya validado y renueva `TmstFirma`, `TmstFirmaEnv` y
ambas XMLDSig con hora `America/Santiago`. No necesita la clave privada `RSASK`
del CAF, no contacta al SII y no modifica `nextFolio`. El resultado queda
versionado junto a `retry-preparation.json`; `retry send` verifica su hash, XSD y
firmas, y lo rechaza si tiene mas de 15 minutos.

Si el artefacto pertenece a un contexto historico distinto, se puede indicar de
forma explicita sin cambiar `.env`:

```powershell
pnpm.cmd run sii:cert -- retry reconcile --type=39 --folio=34 --tenant=real-sii-smoke
```

Nunca se buscan CAF o certificados automaticamente entre tenants.

Factura 33 conserva la recuperacion exacta existente:

```powershell
pnpm.cmd run sii:cert -- retry reconcile --type=33 --folio=16
pnpm.cmd run sii:cert -- retry send --type=33 --folio=16
```

Antes del upload se persiste `retry-attempt.json`. Si no se obtiene un `trackId`,
el estado queda `outcome_unknown` y los siguientes reenvios se bloquean hasta
confirmar externamente si el SII recibio el documento. La respuesta anomala se
guarda de forma protegida junto al artefacto y nunca se imprime en logs.
`retry reconcile` consulta el documento por RUT, tipo, folio, fecha, monto y
receptor. Solo un estado oficial `FAU` habilita `retry prepare` para boleta.
La trazabilidad sanitizada se agrega a `retry-trace.jsonl`; contiene hashes,
tamanos, canal, estados y siguiente comando, nunca XML, token, PFX ni password.
Los errores HTTP de boleta agregan endpoint, status, content-type y bytes sin
exponer la cookie ni el cuerpo de la peticion.

## Artefactos

Los XML y metadatos de diagnostico permanecen fuera de Git en:

```text
secure/real-sii-tests/artifacts/
```

El volumen Docker `business-app-sii_ministack-state` conserva perfiles, PFX,
password, CAF y reservas entre ejecuciones.
