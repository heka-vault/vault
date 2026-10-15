# Agent notes

- Deno 2 + Hono + `node:sqlite`. No build step and no client framework; the pages are
  server-rendered with a little vanilla JS.
- All authorization lives in `src/vault.ts`. API and web routes are thin. Every new operation takes
  the caller's `Principal` and checks it there.
- Never log or return secret values except from the explicit read endpoints. Audit entries record
  locations, not values.
- Before committing, run `deno task check && deno task test`.
- This repo is public. Host names, IPs, tokens, and deployment details belong in the private ops
  repo, not here.
