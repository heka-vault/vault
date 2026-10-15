#!/usr/bin/env bash
# Materialize Heka Vault secrets into this worktree's .env files.
# Credentials live on the host only: $HOME/.config/heka-vault/<project>.env
# Never commit those files. Never print secret values.
#
# Usage:
#   ./scripts/heka-vault-env.sh status
#   ./scripts/heka-vault-env.sh unlock
#
# Override:
#   HEKA_VAULT_CONFIG_DIR   default: $HOME/.config/heka-vault
#   HEKA_VAULT_ENV          default: dev
#   HEKA_VAULT_MAPS         default: per repo below

set -euo pipefail

# --- repo-specific (edit per repo) ---
HEKA_VAULT_PROJECT="${HEKA_VAULT_PROJECT:-CHANGE-ME}"
# folder:relpath, separated by , or ; — "/:." → .env; "/:FILE" → FILE at repo root; "dir:dir" → dir/.env
HEKA_VAULT_MAPS="${HEKA_VAULT_MAPS:-/:.}"
# Also write the fleet-wide `shared` project here when the host has shared.env ("" to disable).
HEKA_VAULT_SHARED_FILE="${HEKA_VAULT_SHARED_FILE-.env.shared}"
# --- end repo-specific ---

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

CFG="${HEKA_VAULT_CONFIG_DIR:-${HOME}/.config/heka-vault}"
ENV_SLUG="${HEKA_VAULT_ENV:-dev}"
CRED_FILE="${CFG}/${HEKA_VAULT_PROJECT}.env"

load_credentials() {
  if [[ ! -f "$CRED_FILE" ]]; then
    echo "missing credentials file: $CRED_FILE" >&2
    echo "Ask the operator to provision a Heka Vault key for '$HEKA_VAULT_PROJECT' on this host." >&2
    return 1
  fi
  # shellcheck disable=SC1090
  set -a; source "$CRED_FILE"; set +a
  : "${HEKA_VAULT_URL:?missing HEKA_VAULT_URL in $CRED_FILE}"
  : "${HEKA_VAULT_TOKEN:?missing HEKA_VAULT_TOKEN in $CRED_FILE}"
}

# GET an API path. Writes the body to stdout; fails with the server's error message on non-2xx.
api_get() {
  local tmp code
  tmp="$(mktemp)"
  code="$(curl -sS -o "$tmp" -w '%{http_code}' -H "Authorization: Bearer ${HEKA_VAULT_TOKEN}" \
    "${HEKA_VAULT_URL}/api/v1$1")" || { rm -f "$tmp"; echo "cannot reach $HEKA_VAULT_URL" >&2; return 1; }
  if [[ "$code" != 2* ]]; then
    echo "HTTP $code from $1: $(head -c 300 "$tmp")" >&2
    rm -f "$tmp"
    return 1
  fi
  cat "$tmp"
  rm -f "$tmp"
}

# Split HEKA_VAULT_MAPS into "folder rel" lines; folder always starts with "/".
maps() {
  local m folder
  for m in ${HEKA_VAULT_MAPS//;/ }; do
    m="${m//,/ }"
    for m in $m; do
      folder="${m%%:*}"
      [[ "$folder" == /* ]] || folder="/$folder"
      echo "$folder ${m#*:}"
    done
  done
}

outfile_for() {
  local folder="$1" rel="$2"
  if [[ "$folder" == "/" ]]; then
    if [[ "$rel" == "." ]]; then echo "${ROOT}/.env"; else echo "${ROOT}/${rel}"; fi
  else
    echo "${ROOT}/${rel}/.env"
  fi
}

urlencode() {
  local s="$1" out="" c i
  for ((i = 0; i < ${#s}; i++)); do
    c="${s:i:1}"
    case "$c" in [a-zA-Z0-9.~_-]) out+="$c" ;; *) out+="$(printf '%%%02X' "'$c")" ;; esac
  done
  echo "$out"
}

cmd_status() {
  echo "project=$HEKA_VAULT_PROJECT"
  echo "env=$ENV_SLUG"
  echo "maps=$HEKA_VAULT_MAPS"
  if [[ -f "$CRED_FILE" ]]; then echo "credentials=$CRED_FILE (present)"; else echo "credentials=$CRED_FILE (MISSING)"; fi
  load_credentials || return 1
  echo "url=$HEKA_VAULT_URL"
  local who folder rel out n
  who="$(api_get /whoami)" || return 1
  echo "whoami=$who"
  while read -r folder rel; do
    out="$(outfile_for "$folder" "$rel")"
    n="$(api_get "/projects/${HEKA_VAULT_PROJECT}/secrets?env=${ENV_SLUG}&path=$(urlencode "$folder")&format=dotenv" | grep -c '^[A-Za-z_]' || true)"
    if [[ -f "$out" ]]; then echo "$folder -> ${out#"$ROOT"/} (exists, vault has $n keys)"; else echo "$folder -> ${out#"$ROOT"/} (MISSING, vault has $n keys)"; fi
  done < <(maps)
  if [[ -n "$HEKA_VAULT_SHARED_FILE" ]]; then
    if [[ -f "$CFG/shared.env" ]]; then echo "shared -> $HEKA_VAULT_SHARED_FILE (credentials present)"; else echo "shared -> skipped (no $CFG/shared.env)"; fi
  fi
}

# Fetch one folder as dotenv into $2 atomically (mode 600). Skips folders with no keys.
write_folder() {
  local project="$1" folder="$2" out="$3" tmp n
  mkdir -p "$(dirname "$out")"
  tmp="$(mktemp "$(dirname "$out")/.heka-vault.XXXXXX")"
  chmod 600 "$tmp"
  if ! api_get "/projects/${project}/secrets?env=${ENV_SLUG}&path=$(urlencode "$folder")&format=dotenv" >"$tmp"; then
    rm -f "$tmp"
    return 1
  fi
  n="$(grep -c '^[A-Za-z_]' "$tmp" || true)"
  if [[ "$n" == 0 ]]; then
    rm -f "$tmp"
    echo "SKIP ${out#"$ROOT"/} (no keys in $project $ENV_SLUG:$folder)"
    return 0
  fi
  mv "$tmp" "$out"
  echo "wrote ${out#"$ROOT"/} ($n keys from $project $ENV_SLUG:$folder)"
}

cmd_unlock() {
  load_credentials || return 1
  local folder rel
  while read -r folder rel; do
    write_folder "$HEKA_VAULT_PROJECT" "$folder" "$(outfile_for "$folder" "$rel")" || return 1
  done < <(maps)
  if [[ -n "$HEKA_VAULT_SHARED_FILE" && -f "$CFG/shared.env" ]]; then
    # shellcheck disable=SC1091
    ( set -a; source "$CFG/shared.env"; set +a
      write_folder shared / "${ROOT}/${HEKA_VAULT_SHARED_FILE}" )
  fi
}

case "${1:-status}" in
  status) cmd_status ;;
  unlock) cmd_unlock ;;
  *) echo "usage: $0 status|unlock" >&2; exit 2 ;;
esac
