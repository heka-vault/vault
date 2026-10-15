---
name: heka-vault-secrets
description: Read and write this project's secrets in Heka Vault, the internal secrets API. Use when .env is missing, an env var seems absent, a new worktree or clone was created, the app fails on missing config, or you need to add or change a secret. Never print secret values.
---

# Heka Vault secrets

Secrets live in the internal Heka Vault service, under this repo's project. The project name is
`HEKA_VAULT_PROJECT` in `scripts/heka-vault-env.sh`. Each project has environments (usually `dev`,
sometimes `staging` and `prod`) and folder paths (`/`, `/backend`, …).

| Situation                                             | Action                                                      |
| ----------------------------------------------------- | ----------------------------------------------------------- |
| New worktree or fresh clone                           | `./scripts/heka-vault-env.sh unlock`                        |
| Missing `.env`, or the app fails on a missing env var | `./scripts/heka-vault-env.sh status`, then `unlock`         |
| The branch already has a working `.env`               | Do nothing                                                  |
| Another environment                                   | `HEKA_VAULT_ENV=staging ./scripts/heka-vault-env.sh unlock` |

## Credentials

The host's key for this project is in `$HOME/.config/heka-vault/<project>.env` (mode 600):

```
HEKA_VAULT_URL=http://…
HEKA_VAULT_PROJECT=<project>
HEKA_VAULT_TOKEN=hvk_…
```

Load it with `set -a; source "$HOME/.config/heka-vault/<project>.env"; set +a`. Keys are `read` or
`readwrite` on one project. A `403 this key is read-only` means this host can't write; ask the
operator.

## Rules

1. **Never** print, log, commit, or paste secret values, `.env` contents, or the token. Send values
   into files or pipes, not into your context.
2. Don't invent values. If the credentials file is missing, tell the operator to provision a Heka
   Vault key for this project on this host.
3. A missing secret that the vault already holds is **not** a reason for `needs-info`. Unlock it and
   continue.
4. Never pull `prod` onto a dev machine.

## API

Full OpenAPI spec: `$HEKA_VAULT_URL/api/v1/openapi.json`. Swagger UI: `$HEKA_VAULT_URL/docs`. Every
call sends `Authorization: Bearer $HEKA_VAULT_TOKEN`. Query params `env` (default `dev`) and `path`
(default `/`) select the location.

```bash
H="Authorization: Bearer $HEKA_VAULT_TOKEN"
API="$HEKA_VAULT_URL/api/v1/projects/$HEKA_VAULT_PROJECT"

# Who am I / which project and role
curl -fsS -H "$H" "$HEKA_VAULT_URL/api/v1/whoami"

# Write a .env file (values go straight to disk)
curl -fsS -H "$H" "$API/secrets?env=dev&path=/&format=dotenv" > .env

# List key names only (no values)
curl -fsS -H "$H" "$API/secrets?env=dev&path=/" | jq -r '.secrets[].key'

# Use one value without printing it
DATABASE_URL="$(curl -fsS -H "$H" "$API/secrets/DATABASE_URL?env=dev&path=/&format=raw")"

# Set one secret (readwrite keys). Read the value from a file or variable, never a literal in logs.
jq -n --arg v "$NEW_VALUE" '{value: $v}' |
  curl -fsS -X PUT -H "$H" -H 'content-type: application/json' --data-binary @- "$API/secrets/MY_KEY?env=dev&path=/"

# Bulk upsert from a .env file (add &replace=true to delete keys not in the file)
curl -fsS -X PUT -H "$H" -H 'content-type: text/plain' --data-binary @new.env "$API/secrets?env=dev&path=/"

# Delete a secret
curl -fsS -X DELETE -H "$H" "$API/secrets/MY_KEY?env=dev&path=/"
```
