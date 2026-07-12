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
pnpm.cmd run docker:certification:custody
pnpm.cmd run docker:certification:custody-check
```

`custody` valida MiniStack con datos sinteticos. `custody-check` confirma que
existe un CAF 33 activo, sin solicitar folios ni emitir documentos.

## Pruebas con SII Certificacion

```powershell
pnpm.cmd run docker:certification:caf33
pnpm.cmd run docker:certification:factura33
pnpm.cmd run docker:certification:boleta39
```

- `caf33` puede solicitar o reobtener un CAF y no debe ejecutarse como regresion comun
- `factura33` y `boleta39` exigen CAF custodiado y consumen un folio
- las suites no deben ejecutarse en paralelo para el mismo emisor
- `docker:certification:down` detiene contenedores pero conserva la custodia
- no usar `docker-compose down -v`: elimina el volumen fiscal local

## Criterio de aprobacion

- upload con `trackId`
- estado de envio sin rechazo ni reparos
- estadisticas sin documentos rechazados ni reparados
- factura con estado DTE final `DOK`, `AND` o `ANC`
- estados transitorios se reintentan con timeout acotado
- `RSC`, `RCT`, `RCH`, `RFR`, `RPR` y errores DTE definitivos fallan de inmediato
- respuestas y logs sin PFX, password, token, CAF completo ni XML firmado

El polling de factura usa por defecto 120 segundos, con intervalos de 10
segundos. Puede ajustarse mediante `SII_CERT_POLL_TIMEOUT_MS` y
`SII_CERT_POLL_INTERVAL_MS` en `.env`.

## Recuperacion de factura

Validar offline un envelope ya reservado:

```powershell
pnpm.cmd run docker:certification:factura33:retry:validate -- 16
```

Reenviarlo solo cuando se haya confirmado que el upload original no obtuvo
`trackId` y el SII no lo proceso:

```powershell
pnpm.cmd run docker:certification:factura33:retry -- 16
```

El folio debe tener su envelope bajo
`secure/real-sii-tests/artifacts/factura33/<folio>/`. Nunca reenviar un folio ya
aceptado por el SII.

## Artefactos

Los XML y metadatos de diagnostico permanecen fuera de Git en:

```text
secure/real-sii-tests/artifacts/
```

El volumen Docker `business-app-sii_ministack-state` conserva perfiles, PFX,
password, CAF y reservas entre ejecuciones.
