import type { Hono } from "@hono/hono";
import { deleteCookie } from "@hono/hono/cookie";
import { type ApiKey, type Principal, type Role, type Vault, VaultError } from "../vault.ts";
import {
  Badge,
  CodeBlock,
  ConfirmPage,
  type Crumb,
  EmptyState,
  Field,
  FlashMessage,
  Icon,
  Layout,
  PageHeader,
  RoleBadge,
  RowMenu,
  SearchField,
  Time,
  TokenField,
} from "./layout.tsx";
import { back, COOKIE, type Env, Flash, referer, safePath } from "./shared.tsx";

/** KeyTable's column widths, scoped to the table so any page that renders it can append this. */
export const keyTableCss = `
.key-table col.c-role{width:calc(var(--s-16) + var(--s-10))}
.key-table col.c-project{width:18%}
.key-table col.c-time{width:14%}
.key-table col.actions{width:calc(var(--s-16) + var(--s-8))}
`;

export const css = keyTableCss + `
.p-keys .table-toolbar>.tabs{margin:0}
.p-keys .key-form fieldset{display:grid;gap:var(--s-3)}
.p-keys .role-opt{display:grid;grid-template-columns:auto minmax(0,1fr);gap:0 var(--s-2);align-items:center;margin:0;font-size:var(--text-base);line-height:var(--lh-base);cursor:pointer}
.p-keys .role-opt>.hint{grid-column:2;font-weight:400}
.p-keys .role-opt:has(:disabled),.p-keys .role-opt:has(:disabled)>.hint{color:var(--fg-subtle);cursor:default}
.p-keys .key-form:has(#role-admin:checked) .f-project{display:none}
.p-keys .page-desc code{overflow-wrap:anywhere}
.p-keys .codeblock pre{white-space:pre-wrap;overflow-wrap:anywhere}
`;

const ROLES: Role[] = ["read", "readwrite", "admin"];
const ROLE_TEXT: Record<Role, [string, string]> = {
  read: ["Read", "View the secrets of one project."],
  readwrite: ["Read and write", "View and change the secrets of one project."],
  admin: ["Admin", "Everything: every project, all keys, the audit log."],
};
const SHOW = ["active", "revoked", "all"] as const;
const REPLAY_MS = 10 * 60_000;
const LAST_ADMIN = "This is the last admin key. Create another admin key before revoking it.";

/** Admin key management: every key, creation (the token is shown once), and revocation. */
export function keyRoutes(web: Hono<Env>, vault: Vault): void {
  // Nonces of recently submitted new-key forms, so a reload or resubmit can't create a second key.
  const used = new Map<string, { name: string; done: string; at: number }>();

  web.get("/keys", (c) => {
    const who = c.get("who");
    const all = vault.listKeys(who);
    const show = SHOW.find((s) => s === c.req.query("show")) ?? "active";
    const count = { active: 0, revoked: 0, all: all.length };
    for (const k of all) count[k.revokedAt ? "revoked" : "active"]++;
    const keys = show === "all" ? all : all.filter((k) => !k.revokedAt === (show === "active"));
    return c.html(
      <Layout title="API keys" who={who} css={css} active="keys" page="p-keys" heading={false}>
        <PageHeader
          title="API keys"
          description="Admin keys reach every project; project keys reach one. Tokens are shown once, when created."
          actions={
            <a class="btn" href="/keys/new">
              <Icon name="plus" />New key
            </a>
          }
        />
        <Flash c={c} />
        <div class="table-toolbar">
          <SearchField
            filter=".key-table tbody tr"
            empty="#no-match"
            label="Filter keys"
            placeholder="Filter by name, project, or role"
          />
          {count.revoked > 0 && (
            <nav class="tabs" aria-label="Key status">
              {SHOW.map((s) => (
                <a href={`/keys?show=${s}`} aria-current={s === show ? "true" : undefined}>
                  {s.charAt(0).toUpperCase() + s.slice(1)} <span class="tnum">{count[s]}</span>
                </a>
              ))}
            </nav>
          )}
        </div>
        {keys.length
          ? <KeyTable keys={keys} showProject who={who} />
          : (
            <EmptyState plain icon="key" title="No revoked keys">
              Keys you revoke stay listed here.
            </EmptyState>
          )}
        <EmptyState plain icon="search" title="No matching keys" id="no-match" hidden>
          Try another name, project, or role.
        </EmptyState>
      </Layout>,
    );
  });

  web.get("/keys/new", (c) => {
    const who = c.get("who");
    vault.listKeys(who); // admin only; throws 403 for project keys
    const projects = vault.listProjects(who);
    const q = (k: string) => c.req.query(k) ?? "";
    const err = q("err");
    const project = q("project");
    const none = projects.length === 0;
    const known = projects.some((p) => p.slug === project);
    const role = none ? "admin" : ROLES.find((r) => r === q("role")) ?? "read";
    const nameError = err === "name is required" ? "Enter a name." : undefined;
    const projectError = err === "project is required for read/readwrite keys"
      ? "Choose a project. Only admin keys work without one."
      : err === "project not found"
      ? (
        <>
          There is no project called <code>{project}</code>.
        </>
      )
      : undefined;
    return c.html(
      <Layout
        title="New key"
        who={who}
        css={css}
        active={known ? "projects" : "keys"}
        current="true"
        page="p-keys"
        heading={false}
      >
        <div class="form-page">
          <PageHeader
            crumbs={crumbs(known ? project : null, "New key")}
            title="New key"
            description="Create one key per host, agent, or person, so each can be revoked on its own. Its token is shown once."
          />
          {err && !nameError && !projectError && (
            <FlashMessage tone="err">{err.charAt(0).toUpperCase() + err.slice(1)}</FlashMessage>
          )}
          <form method="post" action="/keys" class="key-form">
            <input type="hidden" name="nonce" value={crypto.randomUUID()} />
            <Field
              id="name"
              label="Name"
              hint="The host or agent that will use it. Shown in the audit log."
              error={nameError}
              input={{
                name: "name",
                value: q("name"),
                required: true,
                maxlength: 64,
                placeholder: "ci-runner",
                autocomplete: "off",
                spellcheck: false,
                autofocus: !projectError,
              }}
            />
            <fieldset>
              <legend>Role</legend>
              {ROLES.map((r) => (
                <label class="role-opt">
                  <input
                    type="radio"
                    name="role"
                    id={`role-${r}`}
                    value={r}
                    checked={r === role}
                    disabled={none && r !== "admin"}
                    aria-describedby={`role-${r}-hint`}
                  />
                  {ROLE_TEXT[r][0]}
                  <span class="hint" id={`role-${r}-hint`} aria-hidden="true">
                    {ROLE_TEXT[r][1]}
                  </span>
                </label>
              ))}
              {none && (
                <p class="hint">
                  Only admin keys work without a project.{" "}
                  <a href="/projects/new">Create a project</a> first.
                </p>
              )}
            </fieldset>
            {!none && (
              <div class="f-project">
                <Field
                  id="project"
                  label="Project"
                  hint="The only project this key can see."
                  error={projectError}
                >
                  <select id="project" name="project" autofocus={!!projectError}>
                    <option value="" disabled selected={!known}>
                      Choose a project
                    </option>
                    {projects.map((p) => (
                      <option value={p.slug} selected={p.slug === project}>{p.slug}</option>
                    ))}
                  </select>
                </Field>
              </div>
            )}
            <div class="form-actions">
              <button type="submit">Create key</button>
              <a class="btn secondary" href={known ? `/p/${project}/settings` : "/keys"}>Cancel</a>
            </div>
          </form>
        </div>
      </Layout>,
    );
  });

  web.post("/keys", async (c) => {
    const who = c.get("who");
    const f = await c.req.parseBody<Record<string, string>>();
    const input = {
      name: String(f.name ?? ""),
      role: String(f.role ?? "") as Role,
      // The form hides the project for admin keys (CSS only), so a stale choice is dropped here.
      project: f.role === "admin" ? null : f.project || null,
    };
    const nonce = f.nonce ? `${who.keyId} ${f.nonce}` : "";
    for (const [n, u] of used) if (Date.now() - u.at > REPLAY_MS) used.delete(n);
    const replay = used.get(nonce);
    if (replay) return back(c, replay.done, { err: `Key already created: ${replay.name}` });
    let created;
    try {
      created = vault.createKey(who, input);
    } catch (e) {
      if (!(e instanceof VaultError) || e.status === 403) throw e;
      const q = new URLSearchParams({ name: input.name, role: input.role });
      if (input.project) q.set("project", input.project);
      return back(c, `/keys/new?${q}`, { err: e.message });
    }
    const { key, token } = created;
    const done = key.project ? `/p/${key.project}/settings` : "/keys";
    if (nonce) used.set(nonce, { name: key.name, done, at: Date.now() });
    const file = `~/.config/heka-vault/${key.project}.env`;
    c.header("Cache-Control", "no-store");
    return c.html(
      <Layout
        title="Key created"
        who={who}
        css={css}
        active={key.project ? "projects" : "keys"}
        current="true"
        page="p-keys"
        heading={false}
      >
        <div class="form-page">
          <PageHeader
            crumbs={crumbs(key.project, "Key created")}
            title="Key created"
            description={
              <>
                <code>{key.name}</code> {key.project
                  ? (
                    <>
                      can {key.role === "read" ? "read" : "read and write"} secrets in{" "}
                      <code>{key.project}</code>.
                    </>
                  )
                  : "can do everything: every project, all keys, and the audit log."}
              </>
            }
          />
          <FlashMessage tone="warn">
            Copy the token now. It isn't stored, so it can't be shown again.
          </FlashMessage>
          <TokenField id="new-token" value={token} />
          {key.project && (
            <>
              <h2>Host file</h2>
              <p class="muted">
                Save this on the host, then <code>chmod 600</code> it so only its owner can read it.
              </p>
              <CodeBlock
                label={<span class="mono">{file}</span>}
                code={`HEKA_VAULT_URL=${new URL(c.req.url).origin}
HEKA_VAULT_PROJECT=${key.project}
HEKA_VAULT_TOKEN=${token}`}
              />
            </>
          )}
          <div class="form-actions">
            <a class="btn" href={done}>Done</a>
          </div>
        </div>
      </Layout>,
    );
  });

  // The no-JS confirmation for the row menu's Revoke (with JS a <dialog> confirms the POST).
  web.get("/keys/:id/revoke", (c) => {
    const who = c.get("who");
    const key = findKey(vault, who, c.req.param("id"));
    const to = safePath(c.req.query("back")) ?? referer(c, "/keys");
    if (key.revokedAt) return back(c, to, { err: `Key already revoked: ${key.name}` });
    return c.html(
      <Layout
        title="Revoke key"
        who={who}
        css={css}
        active="keys"
        current="true"
        page="p-keys"
        heading={false}
      >
        <ConfirmPage
          title="Revoke key"
          href={`/keys/${key.id}/revoke`}
          cancel={to}
          body={
            <>
              <code>{key.name}</code> will stop working immediately.
            </>
          }
          warning={revokeWarning(key, who)}
          action="Revoke key"
        >
          <input type="hidden" name="back" value={to} />
        </ConfirmPage>
      </Layout>,
    );
  });

  web.post("/keys/:id/revoke", async (c) => {
    const who = c.get("who");
    const f = await c.req.parseBody<Record<string, string>>();
    const to = safePath(f.back) ?? referer(c, "/keys");
    const key = findKey(vault, who, c.req.param("id"));
    try {
      vault.revokeKey(who, key.id);
    } catch (e) {
      if (!(e instanceof VaultError) || e.status === 403) throw e;
      const err = e.message === "cannot revoke the last admin key" ? LAST_ADMIN : e.message;
      return back(c, to, { err });
    }
    if (key.id !== who.keyId) return back(c, to, { msg: `Key revoked: ${key.name}` });
    // The session's own key is gone: sign out here rather than bounce off the auth check.
    deleteCookie(c, COOKIE, { path: "/" });
    return back(c, "/login", { msg: `Key revoked: ${key.name}` });
  });
}

/** Settings-relative crumbs for a project key (where Done returns), else API keys. */
function crumbs(project: string | null, label: string): Crumb[] {
  return project
    ? [
      { label: "Projects", href: "/" },
      { label: <span class="mono">{project}</span>, href: `/p/${project}/settings` },
      { label },
    ]
    : [{ label: "API keys", href: "/keys" }, { label }];
}

/** The key with this id (admin only, via listKeys), or a 404. */
function findKey(vault: Vault, who: Principal, id: string): ApiKey {
  const key = vault.listKeys(who).find((k) => String(k.id) === id);
  if (!key) throw new VaultError(404, "key not found");
  return key;
}

function revokeWarning(key: ApiKey, who?: Principal): string {
  return key.id === who?.keyId
    ? "You are signed in with this key and will be signed out. This cannot be undone."
    : "Hosts and agents using its token lose access. This cannot be undone.";
}

/**
 * Key list, used here and on project settings (append `keyTableCss` to that page's css). Revoked
 * keys are muted, with a Revoked badge and date. `who` marks the signed-in key ("(you)" and its
 * revoke warning); `project` adds a "New key" action to the empty state.
 */
export function KeyTable(
  { keys, showProject, who, project }: {
    keys: ApiKey[];
    showProject?: boolean;
    who?: Principal;
    project?: string;
  },
) {
  if (keys.length === 0) {
    return (
      <EmptyState
        icon="key"
        title="No keys yet"
        actions={project && (
          <a class="btn secondary" href={`/keys/new?project=${encodeURIComponent(project)}`}>
            <Icon name="plus" />New key
          </a>
        )}
      >
        Create a key for each host or agent that reads this project.
      </EmptyState>
    );
  }
  return (
    <div class="table-wrap">
      <table class="fixed key-table">
        <colgroup>
          <col />
          <col class="c-role" />
          {showProject && <col class="c-project hide-sm" />}
          <col class="c-time hide-sm" />
          <col class="c-time hide-sm" />
          <col class="actions" />
        </colgroup>
        <thead>
          <tr>
            <th>Name</th>
            <th>Role</th>
            {showProject && <th class="hide-sm">Project</th>}
            <th class="hide-sm">Created</th>
            <th class="hide-sm">Last used</th>
            <th class="actions">
              <span class="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {keys.map((k) => (
            <tr
              class={k.revokedAt ? "revoked" : undefined}
              data-filter-text={`${k.name} ${k.project ?? ""} ${k.role}`}
            >
              <td>
                <div class="cell-2">
                  <span class="cell-main">
                    {k.name}
                    {k.id === who?.keyId && <span class="muted">&nbsp;(you)</span>}
                  </span>
                  {k.revokedAt
                    ? (
                      <span class="cell-meta">
                        Revoked <Time at={k.revokedAt} />
                      </span>
                    )
                    : (
                      <>
                        <span class={showProject ? "cell-meta mono hide-sm" : "cell-meta mono"}>
                          {k.hint}
                        </span>
                        {showProject && (
                          <span class={k.project ? "cell-meta show-sm mono" : "cell-meta show-sm"}>
                            {k.project ?? "All projects"}
                          </span>
                        )}
                      </>
                    )}
                </div>
              </td>
              <td>
                <RoleBadge role={k.role} />
              </td>
              {showProject && (
                <td class="hide-sm">
                  {k.project
                    ? <a href={`/p/${k.project}`} class="mono">{k.project}</a>
                    : <span class="muted">All projects</span>}
                </td>
              )}
              <td class="hide-sm">
                <Time at={k.createdAt} />
              </td>
              <td class="hide-sm">
                <Time at={k.lastUsedAt} empty="Never" />
              </td>
              <td class="actions">
                {k.revokedAt ? <Badge tone="danger">Revoked</Badge> : <KeyMenu k={k} who={who} />}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function KeyMenu({ k, who }: { k: ApiKey; who?: Principal }) {
  return (
    <RowMenu label={`More actions for ${k.name}`}>
      <form
        class="js-only"
        method="post"
        action={`/keys/${k.id}/revoke`}
        data-confirm="Revoke key"
        data-confirm-subject={k.name}
        data-confirm-body="{subject} will stop working immediately."
        data-confirm-warning={revokeWarning(k, who)}
        data-confirm-action="Revoke key"
      >
        <button type="submit" class="menu-item danger">
          <Icon name="x" />Revoke key
        </button>
      </form>
      <a class="menu-item danger nojs-only" href={`/keys/${k.id}/revoke`}>
        <Icon name="x" />Revoke key
      </a>
    </RowMenu>
  );
}
