import { Hono } from "@hono/hono";
import type { Context } from "@hono/hono";
import { deleteCookie, getCookie, setCookie } from "@hono/hono/cookie";
import type { Child } from "@hono/hono/jsx";
import { raw as html } from "@hono/hono/html";
import { parseDotenv } from "./dotenv.ts";
import {
  type ApiKey,
  normalizePath,
  type Principal,
  type Role,
  type Vault,
  VaultError,
} from "./vault.ts";

const COOKIE = "hv_token";
type Env = { Variables: { who: Principal } };

export function webRoutes(vault: Vault): Hono<Env> {
  const web = new Hono<Env>();

  web.get("/login", (c) =>
    c.html(
      <Layout title="Sign in">
        <Flash c={c} />
        <form method="post" action="/login" class="card narrow">
          <label>
            API token
            <input type="password" name="token" autofocus required placeholder="hvk_…" />
          </label>
          <button type="submit">Sign in</button>
        </form>
      </Layout>,
    ));

  web.post("/login", async (c) => {
    const { token } = await c.req.parseBody<{ token: string }>();
    if (!vault.authenticate(String(token ?? "").trim())) {
      return back(c, "/login", { err: "Invalid token" });
    }
    setCookie(c, COOKIE, String(token).trim(), {
      httpOnly: true,
      sameSite: "Strict",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    return c.redirect("/");
  });

  web.post("/logout", (c) => {
    deleteCookie(c, COOKIE, { path: "/" });
    return c.redirect("/login");
  });

  web.get("/docs", (c) => c.html(swaggerPage()));

  web.use("*", async (c, next) => {
    const who = vault.authenticate(getCookie(c, COOKIE));
    if (!who) return c.redirect("/login");
    c.set("who", who);
    await next();
  });

  // Render VaultErrors from form posts as a flash on the page they came from.
  web.onError((err, c) => {
    if (err instanceof VaultError && c.req.method === "GET") {
      return c.html(
        <Layout title="Error" who={c.get("who")}>
          <div class="flash err">{err.message}</div>
          <a href="/">Back</a>
        </Layout>,
        err.status,
      );
    }
    if (err instanceof VaultError) {
      const ref = c.req.header("referer");
      const to = ref ? new URL(ref).pathname + new URL(ref).search : "/";
      return back(c, to, { err: err.message });
    }
    console.error(err);
    return c.text("internal error", 500);
  });

  web.get("/", (c) => {
    const who = c.get("who");
    if (who.project) return c.redirect(`/p/${who.project}`);
    const projects = vault.listProjects(who);
    return c.html(
      <Layout title="Projects" who={who}>
        <Flash c={c} />
        <table>
          <thead>
            <tr>
              <th>Project</th>
              <th>Name</th>
              <th>Environments</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {projects.map((p) => (
              <tr>
                <td>
                  <a href={`/p/${p.slug}`}>{p.slug}</a>
                </td>
                <td>{p.name}</td>
                <td>{p.environments.join(", ")}</td>
                <td>{p.createdAt.slice(0, 10)}</td>
              </tr>
            ))}
            {projects.length === 0 && (
              <tr>
                <td colspan={4} class="muted">No projects yet.</td>
              </tr>
            )}
          </tbody>
        </table>
        <h2>New project</h2>
        <form method="post" action="/projects" class="card row">
          <input
            name="slug"
            required
            placeholder="slug (e.g. rhystic)"
            pattern="[a-z0-9][a-z0-9-]*"
          />
          <input name="name" placeholder="display name" />
          <input name="environments" value="dev" placeholder="dev,staging,prod" />
          <button type="submit">Create</button>
        </form>
      </Layout>,
    );
  });

  web.post("/projects", async (c) => {
    const f = await c.req.parseBody<Record<string, string>>();
    const p = vault.createProject(c.get("who"), {
      slug: String(f.slug).trim(),
      name: String(f.name ?? ""),
      environments: String(f.environments ?? "dev").split(",").map((s) => s.trim()).filter(Boolean),
    });
    return back(c, `/p/${p.slug}`, { msg: "Project created" });
  });

  web.get("/p/:slug", (c) => {
    const who = c.get("who");
    const slug = c.req.param("slug");
    const project = vault.getProject(who, slug);
    const env = c.req.query("env") || project.environments[0];
    const path = normalizePath(c.req.query("path"));
    const paths = vault.listPaths(who, slug, env);
    if (!paths.includes(path)) paths.push(path);
    const secrets = vault.listSecrets(who, slug, env, path);
    const canWrite = who.role !== "read";
    const isAdmin = who.role === "admin";
    const keys = isAdmin ? vault.listKeys(who, slug) : [];

    return c.html(
      <Layout title={project.name} who={who}>
        <p class="crumbs">
          {isAdmin && <a href="/">Projects</a>} {isAdmin && "/"} <strong>{project.slug}</strong>
        </p>
        <Flash c={c} />
        <nav class="tabs">
          {project.environments.map((e) => (
            <a class={e === env ? "on" : ""} href={`/p/${slug}?env=${e}`}>{e}</a>
          ))}
        </nav>
        <nav class="tabs paths">
          {paths.map((p) => (
            <a
              class={p === path ? "on" : ""}
              href={`/p/${slug}?env=${env}&path=${encodeURIComponent(p)}`}
            >
              {p}
            </a>
          ))}
        </nav>

        <table>
          <thead>
            <tr>
              <th>Key</th>
              <th>Value</th>
              <th>Updated</th>
              {canWrite && <th></th>}
            </tr>
          </thead>
          <tbody>
            {secrets.map((s) => (
              <tr>
                <td>
                  <code>{s.key}</code>
                </td>
                <td>
                  <details>
                    <summary>reveal</summary>
                    <pre>{s.value}</pre>
                  </details>
                  <button type="button" class="small ghost" data-copy={s.value}>copy</button>
                </td>
                <td class="muted">
                  {s.updatedAt.replace("T", " ").slice(0, 16)} {s.updatedBy && `· ${s.updatedBy}`}
                </td>
                {canWrite && (
                  <td>
                    <form method="post" action={`/p/${slug}/secrets/delete`} class="inline">
                      <Hidden env={env} path={path} />
                      <input type="hidden" name="key" value={s.key} />
                      <button
                        type="submit"
                        class="danger small"
                        onclick="return confirm('Delete this secret?')"
                      >
                        delete
                      </button>
                    </form>
                  </td>
                )}
              </tr>
            ))}
            {secrets.length === 0 && (
              <tr>
                <td colspan={4} class="muted">No secrets at {path} in {env}.</td>
              </tr>
            )}
          </tbody>
        </table>

        {canWrite && (
          <div class="grid">
            <form method="post" action={`/p/${slug}/secrets`} class="card">
              <h3>Set secret</h3>
              <Hidden env={env} />
              <label>
                Path <input name="path" value={path} />
              </label>
              <label>
                Key <input name="key" required placeholder="DATABASE_URL" />
              </label>
              <label>
                Value <textarea name="value" rows={3}></textarea>
              </label>
              <button type="submit">Save</button>
            </form>
            <form method="post" action={`/p/${slug}/import`} class="card">
              <h3>Import .env</h3>
              <Hidden env={env} path={path} />
              <textarea name="dotenv" rows={6} placeholder="KEY=value"></textarea>
              <label class="check">
                <input type="checkbox" name="replace" value="1" /> replace (delete keys at {path}
                {" "}
                not in this file)
              </label>
              <button type="submit">Import into {env}:{path}</button>
            </form>
          </div>
        )}

        <h2>Use from an agent</h2>
        <pre class="card">{`curl -fsS -H "Authorization: Bearer $HEKA_VAULT_TOKEN" \\
  "$HEKA_VAULT_URL/api/v1/projects/${slug}/secrets?env=${env}&path=${encodeURIComponent(path)}&format=dotenv" > .env`}</pre>

        {isAdmin && (
          <>
            <h2>Project API keys</h2>
            <KeyTable keys={keys} />
            <form method="post" action="/keys" class="card row">
              <input type="hidden" name="project" value={slug} />
              <input name="name" required placeholder="key name (e.g. ep-ai)" />
              <select name="role">
                <option value="read">read</option>
                <option value="readwrite">readwrite</option>
              </select>
              <button type="submit">Generate key</button>
            </form>

            <h2>Environments</h2>
            <div class="grid">
              <form method="post" action={`/p/${slug}/envs`} class="card row">
                <input name="env" required placeholder="staging" />
                <button type="submit">Add environment</button>
              </form>
              <form method="post" action={`/p/${slug}/envs/delete`} class="card row">
                <select name="env">
                  {project.environments.map((e) => <option>{e}</option>)}
                </select>
                <button
                  type="submit"
                  class="danger"
                  onclick="return confirm('Delete this environment and ALL its secrets?')"
                >
                  Delete environment
                </button>
              </form>
            </div>

            <h2>Danger zone</h2>
            <form method="post" action={`/p/${slug}/delete`} class="card row">
              <input name="confirm" required placeholder={`type ${slug} to confirm`} />
              <button type="submit" class="danger">Delete project, secrets, and keys</button>
            </form>
          </>
        )}
      </Layout>,
    );
  });

  web.post("/p/:slug/secrets", async (c) => {
    const f = await c.req.parseBody<Record<string, string>>();
    const slug = c.req.param("slug");
    const path = normalizePath(f.path);
    const r = vault.setSecret(
      c.get("who"),
      slug,
      f.env,
      path,
      String(f.key).trim(),
      String(f.value ?? ""),
    );
    return back(c, projectUrl(slug, f.env, path), { msg: `Secret ${r}` });
  });

  web.post("/p/:slug/secrets/delete", async (c) => {
    const f = await c.req.parseBody<Record<string, string>>();
    const slug = c.req.param("slug");
    vault.deleteSecret(c.get("who"), slug, f.env, f.path, f.key);
    return back(c, projectUrl(slug, f.env, f.path), { msg: "Secret deleted" });
  });

  web.post("/p/:slug/import", async (c) => {
    const f = await c.req.parseBody<Record<string, string>>();
    const slug = c.req.param("slug");
    let values: Record<string, string>;
    try {
      values = parseDotenv(String(f.dotenv ?? ""));
    } catch (e) {
      throw new VaultError(400, (e as Error).message);
    }
    const r = vault.setSecrets(c.get("who"), slug, f.env, f.path, values, {
      replace: f.replace === "1",
    });
    return back(c, projectUrl(slug, f.env, f.path), {
      msg: `Imported: ${r.created} created, ${r.updated} updated, ${r.deleted} deleted`,
    });
  });

  web.post("/p/:slug/envs", async (c) => {
    const f = await c.req.parseBody<Record<string, string>>();
    const slug = c.req.param("slug");
    vault.addEnvironment(c.get("who"), slug, String(f.env).trim());
    return back(c, projectUrl(slug, f.env, "/"), { msg: "Environment added" });
  });

  web.post("/p/:slug/envs/delete", async (c) => {
    const f = await c.req.parseBody<Record<string, string>>();
    const slug = c.req.param("slug");
    vault.deleteEnvironment(c.get("who"), slug, f.env);
    return back(c, `/p/${slug}`, { msg: `Environment ${f.env} deleted` });
  });

  web.post("/p/:slug/delete", async (c) => {
    const f = await c.req.parseBody<Record<string, string>>();
    const slug = c.req.param("slug");
    if (f.confirm !== slug) {
      throw new VaultError(400, "confirmation did not match the project slug");
    }
    vault.deleteProject(c.get("who"), slug);
    return back(c, "/", { msg: `Project ${slug} deleted` });
  });

  web.get("/keys", (c) => {
    const who = c.get("who");
    const keys = vault.listKeys(who);
    const projects = vault.listProjects(who);
    return c.html(
      <Layout title="API keys" who={who}>
        <Flash c={c} />
        <KeyTable keys={keys} showProject />
        <h2>New key</h2>
        <form method="post" action="/keys" class="card row">
          <input name="name" required placeholder="name" />
          <select name="role">
            <option value="read">read</option>
            <option value="readwrite">readwrite</option>
            <option value="admin">admin</option>
          </select>
          <select name="project">
            <option value="">(admin keys: no project)</option>
            {projects.map((p) => <option value={p.slug}>{p.slug}</option>)}
          </select>
          <button type="submit">Generate key</button>
        </form>
      </Layout>,
    );
  });

  web.post("/keys", async (c) => {
    const who = c.get("who");
    const f = await c.req.parseBody<Record<string, string>>();
    const { key, token } = vault.createKey(who, {
      name: f.name,
      role: f.role as Role,
      project: f.project || null,
    });
    return c.html(
      <Layout title="Key created" who={who}>
        <div class="flash ok">
          Copy this token now. It is not stored and cannot be shown again.
        </div>
        <div class="card">
          <p>
            <strong>{key.name}</strong> · {key.role} {key.project && `· ${key.project}`}
          </p>
          <pre class="token">{token}</pre>
          <button type="button" data-copy={token}>Copy token</button>
          {key.project && (
            <>
              <p>
                Host file <code>~/.config/heka-vault/{key.project}.env</code> (mode 600):
              </p>
              <pre>{`HEKA_VAULT_URL=${new URL(c.req.url).origin}
HEKA_VAULT_PROJECT=${key.project}
HEKA_VAULT_TOKEN=${token}`}</pre>
            </>
          )}
        </div>
        <p>
          <a href={key.project ? `/p/${key.project}` : "/keys"}>Done</a>
        </p>
      </Layout>,
    );
  });

  web.post("/keys/:id/revoke", (c) => {
    vault.revokeKey(c.get("who"), Number(c.req.param("id")));
    const ref = c.req.header("referer");
    return back(c, ref ? new URL(ref).pathname + new URL(ref).search : "/keys", {
      msg: "Key revoked",
    });
  });

  web.get("/audit", (c) => {
    const who = c.get("who");
    const project = c.req.query("project") || undefined;
    const entries = vault.listAudit(who, { project, limit: 500 });
    return c.html(
      <Layout title="Audit log" who={who}>
        <table>
          <thead>
            <tr>
              <th>When (UTC)</th>
              <th>Actor</th>
              <th>Action</th>
              <th>Project</th>
              <th>Env</th>
              <th>Path</th>
              <th>Key</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr>
                <td class="muted">{e.at.replace("T", " ").slice(0, 19)}</td>
                <td>{e.actor}</td>
                <td>{e.action}</td>
                <td>{e.project && <a href={`/audit?project=${e.project}`}>{e.project}</a>}</td>
                <td>{e.env}</td>
                <td>{e.path}</td>
                <td>
                  <code>{e.key}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Layout>,
    );
  });

  return web;
}

function projectUrl(slug: string, env: string, path: string): string {
  return `/p/${slug}?env=${encodeURIComponent(env)}&path=${
    encodeURIComponent(normalizePath(path))
  }`;
}

/** Redirect with a flash message in the query string (messages never contain secret values). */
function back(c: Context, to: string, flash: { msg?: string; err?: string }) {
  const url = new URL(to, "http://x");
  url.searchParams.delete("msg");
  url.searchParams.delete("err");
  if (flash.msg) url.searchParams.set("msg", flash.msg);
  if (flash.err) url.searchParams.set("err", flash.err);
  return c.redirect(url.pathname + url.search, 303);
}

function Flash({ c }: { c: Context }) {
  const msg = c.req.query("msg");
  const err = c.req.query("err");
  return (
    <>
      {msg && <div class="flash ok">{msg}</div>}
      {err && <div class="flash err">{err}</div>}
    </>
  );
}

function Hidden({ env, path }: { env: string; path?: string }) {
  return (
    <>
      <input type="hidden" name="env" value={env} />
      {path !== undefined && <input type="hidden" name="path" value={path} />}
    </>
  );
}

function KeyTable({ keys, showProject }: { keys: ApiKey[]; showProject?: boolean }) {
  return (
    <table>
      <thead>
        <tr>
          <th>Name</th>
          <th>Role</th>
          {showProject && <th>Project</th>}
          <th>Token</th>
          <th>Created</th>
          <th>Last used</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {keys.map((k) => (
          <tr class={k.revokedAt ? "revoked" : ""}>
            <td>{k.name}</td>
            <td>{k.role}</td>
            {showProject && <td>{k.project && <a href={`/p/${k.project}`}>{k.project}</a>}</td>}
            <td>
              <code>{k.hint}</code>
            </td>
            <td class="muted">{k.createdAt.slice(0, 10)}</td>
            <td class="muted">{k.lastUsedAt?.replace("T", " ").slice(0, 16) ?? "never"}</td>
            <td>
              {k.revokedAt
                ? <span class="muted">revoked {k.revokedAt.slice(0, 10)}</span>
                : (
                  <form method="post" action={`/keys/${k.id}/revoke`} class="inline">
                    <button
                      type="submit"
                      class="danger small"
                      onclick="return confirm('Revoke this key?')"
                    >
                      revoke
                    </button>
                  </form>
                )}
            </td>
          </tr>
        ))}
        {keys.length === 0 && (
          <tr>
            <td colspan={7} class="muted">No keys.</td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

function Layout({ title, who, children }: { title: string; who?: Principal; children: Child }) {
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{title} · Heka Vault</title>
        <style>{html(CSS)}</style>
        <script>{html(COPY_JS)}</script>
      </head>
      <body>
        <header>
          <a href="/" class="brand">Heka Vault</a>
          {who && (
            <nav>
              {who.role === "admin" && <a href="/">Projects</a>}
              {who.role === "admin" && <a href="/keys">Keys</a>}
              {who.role === "admin" && <a href="/audit">Audit</a>}
              <a href="/docs">API docs</a>
              <span class="muted">
                {who.name} ({who.role}
                {who.project && ` · ${who.project}`})
              </span>
              <form method="post" action="/logout" class="inline">
                <button type="submit" class="link">Sign out</button>
              </form>
            </nav>
          )}
        </header>
        <main>
          <h1>{title}</h1>
          {children}
        </main>
      </body>
    </html>
  );
}

function swaggerPage(): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Heka Vault API</title>
<link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css"></head>
<body><div id="ui"></div><script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
<script>SwaggerUIBundle({ url: "/api/v1/openapi.json", dom_id: "#ui", persistAuthorization: true });</script>
</body></html>`;
}

// navigator.clipboard needs a secure context, which a LAN http:// origin is not; fall back to execCommand.
const COPY_JS = `
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-copy]");
  if (!b) return;
  const text = b.dataset.copy;
  const done = () => { const t = b.textContent; b.textContent = "copied"; setTimeout(() => b.textContent = t, 1200); };
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text).then(done);
  const ta = document.createElement("textarea");
  ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
  document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove(); done();
});
`;

const CSS = `
*{box-sizing:border-box}
body{margin:0;font:14px/1.5 system-ui,sans-serif;color:#1d1f23;background:#f6f7f9}
header{display:flex;gap:16px;align-items:center;justify-content:space-between;padding:10px 24px;background:#1d1f23;color:#fff}
header a{color:#fff;text-decoration:none}
header nav{display:flex;gap:16px;align-items:center}
header .muted{color:#aab}
.brand{font-weight:700}
main{max-width:1100px;margin:0 auto;padding:16px 24px 64px}
h1{font-size:22px;margin:8px 0 16px}
h2{font-size:16px;margin:28px 0 8px}
h3{font-size:14px;margin:0 0 8px}
a{color:#2457c5}
table{width:100%;border-collapse:collapse;background:#fff;border:1px solid #e1e4e8}
th,td{text-align:left;padding:6px 10px;border-bottom:1px solid #eef0f2;vertical-align:top}
th{background:#fafbfc;font-weight:600;font-size:12px;text-transform:uppercase;color:#555}
tr.revoked td{opacity:.5}
code,pre{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12.5px}
pre{white-space:pre-wrap;word-break:break-all;margin:4px 0;background:#f3f4f6;padding:6px 8px;border-radius:4px}
pre.token{font-size:15px;background:#fff8d6;padding:12px}
details summary{cursor:pointer;color:#2457c5}
.card{background:#fff;border:1px solid #e1e4e8;border-radius:6px;padding:12px;margin:8px 0}
.narrow{max-width:420px}
.row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
label{display:block;margin:0 0 8px;font-weight:600;font-size:12px}
label.check{font-weight:400}
input,select,textarea{font:inherit;padding:6px 8px;border:1px solid #c9ced6;border-radius:4px}
label input,label textarea,form>textarea{display:block;width:100%;margin-top:2px}
label.check input{display:inline;width:auto}
button{font:inherit;padding:6px 12px;border:0;border-radius:4px;background:#2457c5;color:#fff;cursor:pointer}
button.danger{background:#c53030}
button.small{padding:2px 8px;font-size:12px}
button.ghost{background:#e9ecf1;color:#333;margin-top:4px}
button.link{background:none;color:#fff;padding:0;text-decoration:underline}
form.inline{display:inline}
.muted{color:#777}
.flash{padding:8px 12px;border-radius:4px;margin:0 0 12px}
.flash.ok{background:#e6f4ea;color:#1e5e2f}
.flash.err{background:#fde8e8;color:#9b1c1c}
.tabs{display:flex;gap:4px;margin:0 0 8px;flex-wrap:wrap}
.tabs a{padding:4px 10px;border-radius:4px;background:#e9ecf1;text-decoration:none;color:#333}
.tabs a.on{background:#1d1f23;color:#fff}
.tabs.paths a{font-family:ui-monospace,monospace;font-size:12px}
.crumbs{margin:-8px 0 12px;color:#555}
`;
