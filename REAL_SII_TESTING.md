# Pruebas reales SII

Esta carpeta usa dos tipos de pruebas:

- `test/fiscal-ministack-custody.smoke-spec.ts`: valida custodia real sobre MiniStack (`S3 + SSM + DynamoDB`) sin depender del SII.
- `test/fiscal-real-sii.smoke-spec.ts`: valida flujo real en certificacion SII usando custodia en MiniStack.

## Hito actual

Al 2026-06-01, el smoke real ya permite validar este recorrido base sobre certificacion SII:

- custodia por emisor en `business-app-sii`
- token real SII
- reutilizacion u obtencion de `CAF`
- emision real de boleta `39`
- obtencion de `trackId`
- consulta de estado por `trackId`

Este hito confirma que el vertical boleta ya es operativo para certificacion. Lo que sigue ya no es "hacer que llegue al SII", sino endurecer persistencia, RVD, evidencia formal, XSD y automatizacion del programa completo.

## Assets locales

Colocar archivos sensibles bajo:

```text
secure/real-sii-tests/
```

Archivo esperado por defecto:

```text
secure/real-sii-tests/certificado.pfx
```

Si `REAL_SII_TEST_PFX_PATH` no esta definido y no existe ese archivo, el smoke real intenta ademas:

```text
secure/certificado.pfx
```

Artefactos de cada corrida real:

```text
secure/real-sii-tests/artifacts/<folio>/
```

Ahi quedan `ted`, DTE/envelope firmados y metadata util para depurar una corrida real sin volver a adivinar.

## Variables

Copiar:

```text
.env.real-sii-tests.example
```

a:

```text
.env.real-sii-tests
```

y completar al menos:

- `REAL_SII_TEST_RUT_EMISOR`
- `REAL_SII_TEST_RUT_FIRMANTE`
- `REAL_SII_TEST_FECHA_RESOLUCION`
- `REAL_SII_TEST_NRO_RESOLUCION`
- `REAL_SII_TEST_PFX_PATH`
- `REAL_SII_TEST_PFX_PASSWORD`
- `REAL_SII_TEST_SKIP_CAF_REQUEST`

`REAL_SII_TEST_FECHA_RESOLUCION` y `REAL_SII_TEST_NRO_RESOLUCION` deben corresponder a la resolucion DTE real del emisor en certificacion SII. El smoke real no usa defaults de ejemplo para esos campos. `REAL_SII_TEST_NRO_RESOLUCION` debe ser un entero mayor o igual a `0`, porque algunos emisores autorizados por SII efectivamente usan `0`.

La custodia local usa ademas `.env.ministack`.

Si ya tienes un setup previo en `.env` con `SII_RUT_EMISOR`, `SII_RUT_FIRMANTE`, `SII_FECHA_RESOLUCION`, `SII_NRO_RESOLUCION`, `SII_PFX_PATH` o `SII_PFX_PASSWORD`, el loader de smoke los hereda como fallback antes de limpiar el bootstrap local de la app.

## Secuencia recomendada

```powershell
pnpm run ministack:start
pnpm run ministack:bootstrap
pnpm run test:ministack-custody
pnpm run test:real-sii
```

Para reutilizar un CAF ya cargado y evitar scraping o solicitudes nuevas al SII durante desarrollo:

```text
REAL_SII_TEST_SKIP_CAF_REQUEST=true
```

Con esa bandera, el smoke omite el test dedicado de adquisicion de CAF y la prueba de emision exige que ya exista un CAF activo para el tenant de prueba.

Tambien puedes usar el script listo para eso:

```powershell
pnpm run test:real-sii:existing-caf
```

Ese comando es la regresion manual mas corta para el hito actual de boleta real, porque evita pedir CAF nuevo cuando ya existe uno activo en el entorno de pruebas.

## Notas

- Las pruebas reales del SII no son unitarias; son smoke/integration tests.
- Si ya existe un CAF activo en MiniStack para el tenant de prueba, la prueba real intenta reutilizarlo antes de pedir uno nuevo al SII.
- Si `REAL_SII_TEST_SKIP_CAF_REQUEST=true`, el smoke no solicita CAF nuevo y falla explicitamente si no encuentra uno activo.
- El preflight del smoke real falla de forma explicita si falta el archivo PFX, si falta la password del PFX, si la password no corresponde al archivo entregado, o si la resolucion DTE no esta configurada o es invalida.
- No subir `secure/real-sii-tests` ni `.env.real-sii-tests` al repositorio.
