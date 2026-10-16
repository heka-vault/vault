import type { Context, Hono } from "@hono/hono";
import type { Child } from "@hono/hono/jsx";
import { formatDotenv, parseDotenv } from "../dotenv.ts";
import {
  normalizePath,
  type Principal,
  type Project,
  type Secret,
  type Vault,
  VaultError,
} from "../vault.ts";
import {
  Breakable,
  CodeBlock,
  ConfirmPage,
  EmptyState,
  EnvBadge,
  Field,
  FlashMessage,
  Icon,
  isProd,
  Layout,
  PageHeader,
  ProjectHeader,
  RowMenu,
  SearchField,
  SecretValue,
  SectionHeader,
  Time,
} from "./layout.tsx";
import { back, type Env, Flash, Hidden, plural, projectUrl, sentence } from "./shared.tsx";

export const css = `
.p-secrets .location{display:flex;flex-wrap:wrap;align-items:center;gap:var(--s-2) var(--s-4);margin:0 0 var(--s-4)}
.p-secrets .location>.tabs{margin:0}
.p-secrets .folder-path{display:flex;align-items:flex-start;gap:var(--s-1);min-width:0;color:var(--fg-muted)}
.p-secrets .folder-path>svg{flex:none;margin-top:calc((var(--h-sm) - 16px) / 2)}
.p-secrets .folder-path ol{display:flex;flex-wrap:wrap;min-width:0;margin:0;padding:0;list-style:none;font-family:var(--font-mono);font-size:var(--text-sm);line-height:var(--lh-sm)}
.p-secrets .folder-path li{display:flex;align-items:flex-start;min-width:0}
.p-secrets .folder-path li:nth-child(n+3)::before{content:"/";flex:none;padding:calc((var(--h-sm) - var(--lh-sm)) / 2) var(--s-1_5);color:var(--border-input)}
.p-secrets .folder-path :is(a,span){min-width:0;padding:calc((var(--h-sm) - var(--lh-sm)) / 2) var(--s-1_5);border-radius:var(--r);overflow-wrap:anywhere}
.p-secrets .folder-path a{color:var(--fg-muted);text-decoration:none}
.p-secrets .folder-path a:hover{background:var(--bg-hover);color:var(--fg)}
.p-secrets .folder-path span{color:var(--fg);font-weight:500}
.p-secrets tr.folder .cell-2{grid-template-columns:auto minmax(0,1fr);column-gap:var(--s-2);align-items:center}
.p-secrets tr.folder .cell-2>svg{grid-row:span 2;color:var(--fg-muted)}
.p-secrets tr.folder .row-chevron{margin-right:calc((var(--h-sm) - 16px) / 2)}
.p-secrets .cell-meta a{color:inherit}
.p-secrets tr.deep{display:none}
.p-secrets:has([data-filter]:not(:placeholder-shown)) tr.deep:not([hidden]){display:table-row}
.p-secrets .value-cell{display:flex;align-items:center;gap:var(--s-1)}
@media (min-width:641px){.p-secrets col.c-value{width:30%}.p-secrets col.c-updated{width:22%}.p-secrets .updated{text-align:right}}
@media (max-width:640px){.p-secrets .table-toolbar-end svg{display:none}}
.p-secrets .import-replace{margin:0 0 var(--s-4)}
.p-secrets .import-replace>label{margin:0}
.p-secrets .import-replace .hint{margin:var(--s-1) 0 0 calc(var(--s-4) + var(--s-2))}
.p-secrets .import-replace:has(:checked) .hint{color:var(--danger-fg)}
.p-secrets form:not(:has([name=replace]:checked)) .when-replace,.p-secrets form:has([name=replace]:checked) .when-merge{display:none}
@media (max-width:480px){.p-secrets .dialog-foot{flex-wrap:wrap}.p-secrets .dialog-foot>button{flex:1 1 auto}}
.p-secrets .gone{max-height:calc(8 * var(--lh-sm) + 2 * var(--s-2) + 2px);margin:var(--s-3) 0 0;padding:var(--s-2) var(--s-3);overflow:auto;border:1px solid var(--border);border-radius:var(--r);background:var(--bg-subtle);list-style:none;line-height:var(--lh-sm);overflow-wrap:anywhere}
`;

const KEY_PATTERN = "[A-Za-z_][A-Za-z0-9_.\\-]*";
/** Optional leading slash, then segments the vault accepts (PATH_SEGMENT_RE). */
const FOLDER_PATTERN = "/?(?:[A-Za-z0-9_.\\-]+(?:/[A-Za-z0-9_.\\-]+)*/?)?";
const q = (o: Record<string, string>) => new URLSearchParams(o).toString();
/** A folder typed without a leading slash goes inside the folder the user came from. */
const resolve = (from: string, typed: string) =>
  normalizePath(typed.trim().startsWith("/") ? typed : `${from}/${typed}`);

type Folder = { name: string; path: string; count: number; latest: Secret; below: Set<string> };
type FormErrors = { key?: Child; path?: Child; field?: string; form?: string };

const FOLDER_RULE = (
  <span>
    Folder names can use letters, digits, <code>_</code> <code>.</code> <code>-</code>.
  </span>
);

/** Immediate sub-folders of `path` with their secret count, latest change, and nested paths. */
function childFolders(all: Secret[], path: string): Folder[] {
  const base = path === "/" ? "/" : `${path}/`;
  const folders = new Map<string, Folder>();
  for (const s of all) {
    if (s.path === path || !s.path.startsWith(base)) continue;
    const rel = s.path.slice(base.length);
    const name = rel.split("/")[0];
    const f = folders.get(name) ??
      { name, path: base + name, count: 0, latest: s, below: new Set<string>() };
    f.count++;
    f.below.add(rel);
    if (s.updatedAt > f.latest.updatedAt) f.latest = s;
    folders.set(name, f);
  }
  return [...folders.values()].sort((a, b) => a.name < b.name ? -1 : 1);
}

/** Browse, set, import, export, and delete secrets in one project's environments and folders. */
export function secretRoutes(web: Hono<Env>, vault: Vault): void {
  web.get("/p/:slug", (c) => {
    const who = c.get("who");
    const slug = c.req.param("slug");
    const project = vault.getProject(who, slug);
    const env = c.req.query("env") || project.environments[0];
    const page = (body: Child) => (
      <Layout
        title={project.name}
        who={who}
        css={css}
        active="projects"
        current="true"
        page="p-secrets"
        heading={false}
      >
        <ProjectHeader who={who} project={project} tab="secrets" />
        <Flash c={c} />
        {body}
      </Layout>
    );
    if (!env) {
      return c.html(page(
        <EmptyState icon="layers" title="No environments yet">
          Secrets live in an environment. An admin can add one in this project's settings.
        </EmptyState>,
      ));
    }
    let path: string;
    try {
      path = normalizePath(c.req.query("path"));
    } catch (e) {
      return back(c, projectUrl(slug, env, "/"), { err: (e as Error).message });
    }
    const all = vault.listSecrets(who, slug, env, path, { recursive: true });
    const secrets = all.filter((s) => s.path === path);
    const deeper = all.filter((s) => s.path !== path);
    const folders = childFolders(all, path);
    const canWrite = who.role !== "read";
    const actions = canWrite || folders.length > 0;
    const where = `${env}:${path}`;
    const loc = { env, path };
    const envEmpty = path === "/" && all.length === 0;
    const filter = folders.length + all.length > 5;
    // Switching environment keeps the folder when it (or a sub-folder) exists there too.
    const keepPath = (e: string) =>
      e === env ||
      vault.listPaths(who, slug, e).some((p) => p === path || p.startsWith(`${path}/`));
    const row = (s: Secret, i: number, deep?: boolean) => (
      <SecretRow slug={slug} env={env} s={s} id={`s-${i}`} deep={deep} write={canWrite}>
        {!canWrite && actions && <td class="actions"></td>}
      </SecretRow>
    );

    return c.html(page(
      <>
        {(project.environments.length > 1 || !envEmpty) && (
          <div class="location">
            {project.environments.length > 1
              ? (
                <nav class="tabs envs" aria-label="Environment">
                  {project.environments.map((e) => (
                    <a
                      href={projectUrl(slug, e, keepPath(e) ? path : "/")}
                      class={isProd(e) ? "prod" : undefined}
                      aria-current={e === env ? "true" : undefined}
                    >
                      {e}
                    </a>
                  ))}
                </nav>
              )
              : <EnvBadge env={env} />}
            {!envEmpty && <FolderPath slug={slug} env={env} path={path} />}
          </div>
        )}
        {canWrite && isProd(env) && <ProdNotice env={env} />}

        {(canWrite || filter) && (
          <div class="table-toolbar">
            {filter && (
              <SearchField
                filter=".p-secrets tbody tr"
                empty="#no-match"
                label={folders.length ? "Filter secrets and folders" : "Filter secrets"}
                placeholder={folders.length ? "Filter by key or folder" : "Filter by key"}
              />
            )}
            {canWrite && (
              <div class="table-toolbar-end">
                <a
                  class="btn secondary"
                  href={`/p/${slug}/secrets/new?${q({ ...loc, folder: "new" })}`}
                >
                  <Icon name="folder" />New folder
                </a>
                <a class="btn secondary" href={`/p/${slug}/import?${q(loc)}`}>
                  <Icon name="upload" />Import .env
                </a>
                <a class="btn" href={`/p/${slug}/secrets/new?${q(loc)}`}>
                  <Icon name="plus" />Add secret
                </a>
              </div>
            )}
          </div>
        )}

        {envEmpty && (
          <EmptyState
            icon="key"
            title={
              <>
                No secrets in <code>{env}</code> yet
              </>
            }
          >
            {canWrite
              ? (
                <>
                  Add a secret, or import a <code>.env</code> file.
                </>
              )
              : "Nothing has been stored in this environment."}
          </EmptyState>
        )}
        {!envEmpty && !all.length && (
          <EmptyState
            icon="folder"
            title={
              <>
                No secrets in <code>{path}</code>
              </>
            }
          >
            {canWrite
              ? "Folders exist only while they hold secrets. Add one here to create it."
              : "Nothing is stored in this folder."}
          </EmptyState>
        )}
        {all.length > 0 && (
          <>
            <div class="table-wrap">
              <table class="fixed">
                <colgroup>
                  <col />
                  <col class="masked c-value" />
                  <col class="c-updated hide-sm" />
                  {actions && <col class="actions" />}
                </colgroup>
                <thead>
                  <tr>
                    <th>{folders.length ? "Name" : "Key"}</th>
                    <th>Value</th>
                    <th class="hide-sm updated">Updated</th>
                    {actions && (
                      <th class="actions">
                        <span class="sr-only">Actions</span>
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {folders.map((f) => (
                    <tr class="row-link folder" data-filter-text={[...f.below].join(" ")}>
                      <td colspan={2}>
                        <div class="cell-2">
                          <Icon name="folder" />
                          <a href={projectUrl(slug, env, f.path)} class="cell-main">
                            <code>
                              <Breakable text={f.name} />
                            </code>
                          </a>
                          <span class="cell-meta">{plural(f.count, "secret")}</span>
                        </div>
                      </td>
                      <td class="muted hide-sm updated">
                        <Updated s={f.latest} />
                      </td>
                      <td class="actions">
                        <Icon name="chevron-right" class="row-chevron" />
                      </td>
                    </tr>
                  ))}
                  {secrets.map((s, i) => row(s, i))}
                  {deeper.map((s, i) => row(s, secrets.length + i, true))}
                </tbody>
              </table>
            </div>
            {filter && (
              <EmptyState plain icon="search" title="No matching secrets" id="no-match" hidden>
                {folders.length
                  ? (
                    <>
                      No key or folder in <code>{where}</code> or below contains that text.
                    </>
                  )
                  : (
                    <>
                      No key in <code>{where}</code> contains that text.
                    </>
                  )}
              </EmptyState>
            )}
          </>
        )}
        {secrets.length > 0 && (
          <>
            <SectionHeader
              title="Use from an agent"
              description={
                <>
                  Fetch <code>{where}</code> as a <code>.env</code> file with a project key.
                </>
              }
              actions={
                <a class="btn secondary small" href={`/p/${slug}/export?${q(loc)}`}>
                  <Icon name="download" />Download .env
                </a>
              }
            />
            <CodeBlock label="Shell" code={agentSnippet(slug, env, path)} />
          </>
        )}
      </>,
    ));
  });

  // One value as text/plain: the reveal and copy buttons fetch it (audited as secret.read).
  web.get("/p/:slug/secrets/value", (c) => {
    const { env, path, key } = c.req.query();
    const s = vault.getSecret(c.get("who"), c.req.param("slug"), env, path, key);
    return c.text(s.value, 200, {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    });
  });

  web.get("/p/:slug/export", (c) => {
    const slug = c.req.param("slug");
    const env = c.req.query("env") ?? "";
    const path = normalizePath(c.req.query("path"));
    const secrets = vault.listSecrets(c.get("who"), slug, env, path);
    const name = [slug, env, ...path.split("/").filter(Boolean)].join("-");
    return c.text(formatDotenv(secrets), 200, {
      "cache-control": "no-store",
      "content-disposition": `attachment; filename="${name}.env"`,
      "x-content-type-options": "nosniff",
    });
  });

  // Add, new folder, and edit post back to their own URL; the query keeps env and the folder the
  // user came from, so a 400 re-render can be reloaded or bookmarked.
  web.get("/p/:slug/secrets/new", (c) => {
    const newFolder = c.req.query("folder") === "new";
    return secretForm(c, { path: newFolder ? "" : normalizePath(c.req.query("path")) });
  });

  web.get("/p/:slug/secrets/edit", (c) => {
    const { env = "", path, key = "" } = c.req.query();
    const s = vault.getSecret(writer(c), c.req.param("slug"), env, path, key);
    return secretForm(c, { path: s.path, key, value: s.value });
  });

  const save = async (c: Context<Env>) => {
    const f = await c.req.parseBody<Record<string, string>>();
    const who = c.get("who");
    const slug = c.req.param("slug") ?? "";
    const env = c.req.query("env") ?? "";
    const edit = c.req.path.endsWith("/edit");
    const v = {
      path: edit ? c.req.query("path") ?? "" : String(f.path ?? ""),
      key: edit ? c.req.query("key") ?? "" : String(f.key ?? "").trim(),
      value: String(f.value ?? ""),
    };
    let path: string;
    try {
      path = edit ? normalizePath(v.path) : resolve(normalizePath(c.req.query("path")), v.path);
    } catch {
      return secretForm(c, v, { path: FOLDER_RULE });
    }
    // Add never overwrites: an existing key is changed through Edit, which says so.
    if (!edit && vault.listSecrets(who, slug, env, path).some((s) => s.key === v.key)) {
      return secretForm(c, v, {
        key: (
          <span>
            <code>{v.key}</code> already exists in <code>{`${env}:${path}`}</code>.{" "}
            <a href={`/p/${slug}/secrets/edit?${q({ env, path, key: v.key })}`}>Edit secret</a>
          </span>
        ),
      });
    }
    try {
      const r = vault.setSecret(who, slug, env, path, v.key, v.value);
      return back(c, projectUrl(slug, env, path), { msg: `Secret ${r}: ${v.key}` });
    } catch (e) {
      if (!(e instanceof VaultError) || e.status !== 400) throw e;
      return secretForm(
        c,
        v,
        e.message.startsWith("invalid secret key")
          ? {
            key: (
              <span>
                <code>{v.key}</code> is not a valid key.
              </span>
            ),
          }
          : { form: e.message },
      );
    }
  };
  web.post("/p/:slug/secrets/new", save);
  web.post("/p/:slug/secrets/edit", save);

  web.get("/p/:slug/secrets/delete", (c) => {
    const who = writer(c);
    const slug = c.req.param("slug");
    const project = vault.getProject(who, slug);
    const { env = "", key = "" } = c.req.query();
    const path = normalizePath(c.req.query("path"));
    return c.html(
      <ConfirmShell who={who} title="Delete secret">
        <ConfirmPage
          title="Delete secret"
          href={`/p/${slug}/secrets/delete`}
          cancel={projectUrl(project.slug, env, path)}
          body={
            <>
              <code>{key}</code> will be deleted from <code>{`${env}:${path}`}</code>.
            </>
          }
          warning="Agents that read it will fail on their next fetch. This cannot be undone."
          action="Delete secret"
        >
          <Hidden env={env} path={path} />
          <input type="hidden" name="key" value={key} />
        </ConfirmPage>
      </ConfirmShell>,
    );
  });

  web.post("/p/:slug/secrets/delete", async (c) => {
    const f = await c.req.parseBody<Record<string, string>>();
    const slug = c.req.param("slug");
    vault.deleteSecret(c.get("who"), slug, f.env, f.path, f.key);
    return back(c, projectUrl(slug, f.env, f.path), { msg: `Secret deleted: ${f.key}` });
  });

  web.get("/p/:slug/import", (c) => importForm(c, { path: normalizePath(c.req.query("path")) }));

  web.post("/p/:slug/import", async (c) => {
    const f = await c.req.parseBody<Record<string, string>>();
    const who = c.get("who");
    const slug = c.req.param("slug");
    const env = c.req.query("env") ?? "";
    const v = { path: String(f.path ?? ""), dotenv: String(f.dotenv ?? ""), replace: !!f.replace };
    if (f.back) return importForm(c, v);
    let path: string;
    try {
      path = resolve(normalizePath(c.req.query("path")), v.path);
    } catch {
      return importForm(c, v, { path: FOLDER_RULE });
    }
    try {
      const values = dotenv(v.dotenv);
      const existing = vault.listSecrets(who, slug, env, path).map((s) => s.key);
      if (v.replace) {
        // Replacing deletes keys that are not in the file: list them and confirm that exact list.
        const gone = existing.filter((k) => !Object.hasOwn(values, k));
        if (gone.length && f.confirm !== gone.join(",")) {
          const updated = Object.keys(values).filter((k) => existing.includes(k)).length;
          const counts = { created: Object.keys(values).length - updated, updated };
          return replaceConfirm(c, { ...v, path }, gone, counts);
        }
      }
      const r = vault.setSecrets(who, slug, env, path, values, { replace: v.replace });
      const counts = [[r.created, "added"], [r.updated, "updated"], [r.deleted, "deleted"]]
        .filter(([n]) => n).map(([n, word]) => `${n} ${word}`);
      return back(c, projectUrl(slug, env, path), { msg: `Imported: ${counts.join(", ")}` });
    } catch (e) {
      if (!(e instanceof VaultError) || e.status !== 400) throw e;
      return importForm(c, v, { field: sentence(e.message) });
    }
  });

  /** The caller, if it may write. The vault re-checks on every write; this only avoids dead forms. */
  function writer(c: Context<Env>): Principal {
    const who = c.get("who");
    if (who.role === "read") throw new VaultError(403, "this key is read-only");
    return who;
  }

  /** Writer, project, the env (which must exist), and the folder the user came from. */
  function formContext(c: Context<Env>) {
    const who = writer(c);
    const project = vault.getProject(who, c.req.param("slug") ?? "");
    const env = c.req.query("env") ?? "";
    if (!project.environments.includes(env)) {
      throw new VaultError(404, `environment not found: ${env}`);
    }
    const from = normalizePath(c.req.query("path"));
    return { who, project, env, from, cancel: projectUrl(project.slug, env, from) };
  }

  /** Form pages can hold a value or a pasted .env, so the browser must not keep them. */
  function noStore(c: Context<Env>, page: string | Promise<string>, status: 200 | 400 = 200) {
    c.header("cache-control", "no-store");
    return c.html(page, status);
  }

  /** Add, edit, or "new folder" (a folder exists once it holds a secret). */
  function secretForm(
    c: Context<Env>,
    v: { path: string; key?: string; value?: string },
    err: FormErrors = {},
  ) {
    const { who, project, env, from, cancel } = formContext(c);
    const edit = c.req.path.endsWith("/edit");
    const newFolder = !edit && c.req.query("folder") === "new";
    const title = edit ? "Edit secret" : newFolder ? "New folder" : "Add secret";
    const focus = err.path ? "path" : err.key ? "key" : edit ? "value" : newFolder ? "path" : "key";
    const folder = (
      <FolderField from={from} value={v.path} error={err.path} required={newFolder} focus={focus} />
    );
    return noStore(
      c,
      <FormPage
        c={c}
        who={who}
        project={project}
        env={env}
        title={title}
        cancel={cancel}
        description={edit
          ? (
            <>
              <code>{v.key}</code> in <code>{`${env}:${v.path}`}</code>
            </>
          )
          : newFolder
          ? (
            <>
              A folder exists once it holds a secret. Add its first one to <code>{env}</code>.
            </>
          )
          : (
            <>
              Adds to <code>{env}</code>.
            </>
          )}
        error={err.form}
      >
        <form method="post">
          {newFolder && folder}
          {!edit && (
            <Field
              id="key"
              label="Key"
              hint={
                <>
                  Letters, digits, <code>_</code> <code>.</code>{" "}
                  <code>-</code>, not starting with a digit.
                </>
              }
              error={err.key}
              input={{
                name: "key",
                value: v.key,
                class: "mono",
                required: true,
                pattern: KEY_PATTERN,
                maxlength: 256,
                placeholder: "DATABASE_URL",
                autocomplete: "off",
                spellcheck: false,
                autofocus: focus === "key",
              }}
            />
          )}
          <Field
            id="value"
            label="Value"
            hint={edit
              ? "Saving replaces the current value."
              : "Stored encrypted. Multi-line values are kept as they are."}
            textarea={{
              name: "value",
              value: v.value,
              class: "mono",
              rows: Math.min(12, Math.max(4, (v.value ?? "").split("\n").length + 1)),
              autocomplete: "off",
              spellcheck: false,
              autofocus: focus === "value",
            }}
          />
          {!edit && !newFolder && folder}
          <div class="form-actions">
            <button type="submit">
              {edit ? "Save secret" : newFolder ? "Create folder" : "Add secret"}
            </button>
            <a class="btn secondary" href={cancel}>Cancel</a>
          </div>
        </form>
      </FormPage>,
      Object.keys(err).length ? 400 : 200,
    );
  }

  function importForm(
    c: Context<Env>,
    v: { path: string; dotenv?: string; replace?: boolean },
    err: FormErrors = {},
  ) {
    const { who, project, env, from, cancel } = formContext(c);
    return noStore(
      c,
      <FormPage
        c={c}
        who={who}
        project={project}
        env={env}
        title="Import .env"
        cancel={cancel}
        description={
          <>
            Into <code>{env}</code>. Keys that already exist are overwritten.
          </>
        }
      >
        <form method="post">
          <Field
            id="dotenv"
            label="Contents"
            hint={
              <>
                One <code>KEY=value</code> per line. Quotes,{" "}
                <code>export</code>, and comments are fine.
              </>
            }
            error={err.field}
            textarea={{
              name: "dotenv",
              value: v.dotenv,
              class: "mono",
              rows: 12,
              required: true,
              placeholder: "DATABASE_URL=postgres://…\nREDIS_URL=redis://…",
              autocomplete: "off",
              spellcheck: false,
              autofocus: !err.path,
            }}
          />
          <FolderField
            from={from}
            value={v.path}
            error={err.path}
            focus={err.path ? "path" : ""}
          />
          <div class="import-replace">
            <label class="check">
              <input
                type="checkbox"
                name="replace"
                value="1"
                checked={v.replace}
                aria-describedby="replace-hint"
              />
              Replace the folder
            </label>
            <p class="hint" id="replace-hint">
              Deletes keys in the folder that are not in this file. You see which ones before
              anything is deleted.
            </p>
          </div>
          <div class="form-actions">
            <button type="submit" class="when-merge">Import</button>
            <button type="submit" class="when-replace">Review and import</button>
            <a class="btn secondary" href={cancel}>Cancel</a>
          </div>
        </form>
      </FormPage>,
      Object.keys(err).length ? 400 : 200,
    );
  }

  /**
   * Lists the keys a replace would delete; confirming posts the same import with that list, and
   * "Back to import" posts the pasted file back to the form.
   */
  function replaceConfirm(
    c: Context<Env>,
    v: { path: string; dotenv: string },
    gone: string[],
    counts: { created: number; updated: number },
  ) {
    const { who, project, env, from } = formContext(c);
    const n = gone.length;
    const parts = [
      counts.created && `adds ${counts.created}`,
      counts.updated && `updates ${counts.updated}`,
      `deletes ${n}`,
    ].filter(Boolean).join(", ");
    return noStore(
      c,
      <ConfirmShell who={who} title="Import and replace">
        <div class="confirm-page">
          <form
            method="post"
            action={`/p/${project.slug}/import?${q({ env, path: from })}`}
            class="dialog static"
          >
            <div class="dialog-body">
              <h1 class="dialog-title">Import and replace</h1>
              <p class="dialog-text">
                {sentence(parts)} in{" "}
                <code>{`${env}:${v.path}`}</code>. These are not in the file and will be deleted:
              </p>
              <ul
                class="gone mono"
                tabindex={n > 8 ? 0 : undefined}
                aria-label={n > 8 ? "Secrets to delete" : undefined}
              >
                {gone.map((k) => <li>{k}</li>)}
              </ul>
              <div class="flash err">
                <Icon name="alert" />
                <div class="flash-text">
                  Agents that read {n === 1 ? "it" : "them"}{" "}
                  will fail on their next fetch. This cannot be undone.
                </div>
              </div>
              <input type="hidden" name="path" value={v.path} />
              <input type="hidden" name="dotenv" value={v.dotenv} />
              <input type="hidden" name="replace" value="1" />
              <input type="hidden" name="confirm" value={gone.join(",")} />
            </div>
            <div class="dialog-foot">
              <button type="submit" class="secondary" name="back" value="1">Back to import</button>
              <button type="submit" class="danger">Delete {plural(n, "secret")} and import</button>
            </div>
          </form>
        </div>
      </ConfirmShell>,
    );
  }
}

/** parseDotenv with its messages as form errors; anything else is a bug and reaches onError. */
function dotenv(text: string): Record<string, string> {
  let values: Record<string, string>;
  try {
    values = parseDotenv(text);
  } catch (e) {
    throw new VaultError(400, (e as Error).message);
  }
  if (!Object.keys(values).length) throw new VaultError(400, "no KEY=value lines found");
  return values;
}

/** The current folder as a mono breadcrumb: `/ workers / email`, each ancestor a link. */
function FolderPath({ slug, env, path }: { slug: string; env: string; path: string }) {
  const parts = path.split("/").filter(Boolean);
  const crumbs = [
    { label: "/", path: "/" },
    ...parts.map((p, i) => ({ label: p, path: `/${parts.slice(0, i + 1).join("/")}` })),
  ];
  return (
    <nav class="folder-path" aria-label="Folder">
      <Icon name="folder" />
      <ol>
        {crumbs.map((f, i) => (
          <li>
            {i < crumbs.length - 1
              ? <a href={projectUrl(slug, env, f.path)}>{f.label}</a>
              : <span aria-current="true">{f.label}</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** Folder field for add, new folder, and import: a bare name resolves inside `from`. */
function FolderField(
  { from, value, error, required, focus }: {
    from: string;
    value: string;
    error?: Child;
    required?: boolean;
    focus: string;
  },
) {
  return (
    <Field
      id="path"
      label="Folder"
      hint={from === "/"
        ? (
          <>
            A name like <code>payments</code> becomes{" "}
            <code>/payments</code>; nest with more slashes.
          </>
        )
        : (
          <>
            A name like <code>payments</code> goes inside <code>{from}</code>; start with{" "}
            <code>/</code> for a path from the root.
          </>
        )}
      error={error}
      input={{
        name: "path",
        value,
        class: "mono",
        required,
        pattern: FOLDER_PATTERN,
        placeholder: "payments",
        autocomplete: "off",
        spellcheck: false,
        autofocus: focus === "path",
      }}
    />
  );
}

/** One secret row. Rows from sub-folders (`deep`) show their folder and appear only when filtering. */
function SecretRow(
  { slug, env, s, id, deep, write, children }: {
    slug: string;
    env: string;
    s: Secret;
    id: string;
    deep?: boolean;
    write: boolean;
    children?: Child;
  },
) {
  const src = `/p/${slug}/secrets/value?${q({ env, path: s.path, key: s.key })}`;
  const key = (
    <code>
      <Breakable text={s.key} />
    </code>
  );
  return (
    <tr class={deep ? "deep" : undefined} data-filter-text={s.key}>
      <td>
        {deep
          ? (
            <div class="cell-2">
              {key}
              <span class="cell-meta mono">
                <a href={projectUrl(slug, env, s.path)}>{s.path}</a>
              </span>
            </div>
          )
          : key}
      </td>
      {s.value === "" ? <td class="muted">Empty</td> : (
        <td>
          <div class="value-cell">
            <SecretValue id={id} label={s.key} src={src} />
            <a class="btn ghost small nojs-only" href={src} aria-label={`Show ${s.key}`}>Show</a>
          </div>
        </td>
      )}
      <td class="muted hide-sm updated">
        <Updated s={s} />
      </td>
      {write
        ? (
          <td class="actions">
            <RowActions slug={slug} env={env} path={s.path} k={s.key} />
          </td>
        )
        : children}
    </tr>
  );
}

function Updated({ s }: { s: Secret }) {
  return (
    <>
      <Time at={s.updatedAt} />
      {s.updatedBy && ` · ${s.updatedBy}`}
    </>
  );
}

function ConfirmShell(
  { who, title, children }: { who: Principal; title: string; children: Child },
) {
  return (
    <Layout
      title={title}
      who={who}
      css={css}
      active="projects"
      current="true"
      page="p-secrets"
      heading={false}
    >
      {children}
    </Layout>
  );
}

/** Shell for the add / edit / import pages: breadcrumb back to the folder, h1, prod notice. */
function FormPage(
  { c, who, project, env, title, description, cancel, error, children }: {
    c: Context<Env>;
    who: Principal;
    project: Project;
    env: string;
    title: string;
    description: Child;
    cancel: string;
    error?: string;
    children: Child;
  },
) {
  const crumbs = [
    ...(who.role === "admin" ? [{ label: "Projects", href: "/" }] : []),
    { label: <span class="mono">{project.slug}</span>, href: cancel },
    { label: title },
  ];
  return (
    <Layout
      title={title}
      who={who}
      css={css}
      active="projects"
      current="true"
      page="p-secrets"
      heading={false}
    >
      <div class="form-page">
        <PageHeader title={title} description={description} crumbs={crumbs} />
        <Flash c={c} />
        {error && <FlashMessage tone="err">{sentence(error)}</FlashMessage>}
        {isProd(env) && <ProdNotice env={env} />}
        {children}
      </div>
    </Layout>
  );
}

function ProdNotice({ env }: { env: string }) {
  return (
    <FlashMessage tone="prod">
      You are editing <code>{env}</code>. Agents pick up changes on their next fetch.
    </FlashMessage>
  );
}

function RowActions(
  { slug, env, path, k }: { slug: string; env: string; path: string; k: string },
) {
  const loc = q({ env, path, key: k });
  return (
    <RowMenu label={`More actions for ${k}`}>
      <a class="menu-item" href={`/p/${slug}/secrets/edit?${loc}`}>
        <Icon name="pencil" />Edit secret
      </a>
      <div class="menu-sep"></div>
      <form
        class="js-only"
        method="post"
        action={`/p/${slug}/secrets/delete`}
        data-confirm="Delete secret"
        data-confirm-subject={k}
        data-confirm-where={`${env}:${path}`}
        data-confirm-body="{subject} will be deleted from {where}."
        data-confirm-warning="Agents that read it will fail on their next fetch. This cannot be undone."
        data-confirm-action="Delete secret"
      >
        <Hidden env={env} path={path} />
        <input type="hidden" name="key" value={k} />
        <button type="submit" class="menu-item danger">
          <Icon name="trash" />Delete secret
        </button>
      </form>
      <a class="menu-item danger nojs-only" href={`/p/${slug}/secrets/delete?${loc}`}>
        <Icon name="trash" />Delete secret
      </a>
    </RowMenu>
  );
}

function agentSnippet(slug: string, env: string, path: string): string {
  return `curl -fsS -H "Authorization: Bearer $HEKA_VAULT_TOKEN" \\
  "$HEKA_VAULT_URL/api/v1/projects/${slug}/secrets?${q({ env, path, format: "dotenv" })}" > .env`;
}
