#!/bin/sh
set -eu

load_secret() {
  target_name="$1"
  file_name="$2"

  if [ ! -r "$file_name" ]; then
    echo "No se puede leer el secret requerido para ${target_name}: ${file_name}" >&2
    exit 1
  fi

  secret_value="$(cat "$file_name")"
  if [ -z "$secret_value" ]; then
    echo "El secret requerido para ${target_name} esta vacio: ${file_name}" >&2
    exit 1
  fi

  export "${target_name}=${secret_value}"
  unset secret_value
}

if [ -n "${API_KEY_FRONTEND_FILE:-}" ]; then
  load_secret API_KEY_FRONTEND "$API_KEY_FRONTEND_FILE"
fi

if [ -n "${REAL_SII_TEST_PFX_PASSWORD_FILE:-}" ]; then
  load_secret REAL_SII_TEST_PFX_PASSWORD "$REAL_SII_TEST_PFX_PASSWORD_FILE"
fi

exec "$@"
