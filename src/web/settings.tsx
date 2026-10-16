import type { Hono } from "@hono/hono";
import { type Vault, VaultError } from "../vault.ts";
import { KeyTable, keyTableCss } from "./keys.tsx";
import {
  Breakable,
  CodeBlock,
  ConfirmPage,
  EmptyState,
  Field,
  Icon,
  isProd,
  Layout,
  ProjectHeader,
  RowMenu,
  SectionHeader,
} from "./layout.tsx";
import { back, type Env, Flash, plural } from "./shared.tsx";

export const css = keyTableCss + `
.p-settings .envs,.p-settings .steps,.p-settings .panel.danger{max-width:var(--w-form)}
.p-settings .envs col.actions{--actions:2}
.p-settings a.env{overflow-wrap:anywhere}
.p-settings a.env.prod::before{content:"";display:inline-block;width:6px;height:6px;margin-right:var(--s-1_5);border-radius:50%;background:var(--prod);vertical-align:middle}
.p-settings .env-add{display:flex;gap:var(--s-2)}
.p-settings .env-add>input{flex:1;min-width:0}
.p-settings .steps{margin:0;padding-left:var(--s-5)}
.p-settings .steps>li{padding-left:var(--s-1)}
.p-settings .steps>li+li{margin-top:var(--s-2)}
.p-settings .steps>li::marker{color:var(--fg-muted)}
.p-settings .steps p{margin:0 0 var(--s-2)}
.p-settings .steps .codeblock{margin:0}
.p-settings .danger-row{display:flex;flex-wrap:wrap;align-items:center;gap:var(--s-4)}
.p-settings .danger-row>div:first-child{flex:1 1 0;min-width:min(100%,var(--w-narrow))}
.p-settings .danger-row h3{margin:0 0 var(--s-1)}
.p-settings .danger-row p{margin:0}
.p-settings .danger-row>.nojs-only{flex-basis:100%}
.p-settings .danger-row .field{margin:0}
.p-settings .danger-row>button{margin-left:auto}
`;

const ENV_PATTERN = "[a-z0-9][a-z0-9\\-]{0,62}";
const ENV_WARNING = "Agents that read it will fail on their next fetch. This cannot be undone.";

/**
 * What deleting the project takes with it, without the parts that are zero: "its 3 environments,
 * every secret in them, and 2 API keys". A single environment is named as `{where}`.
 */
function lost(envs: number, keys: number): string {
  const parts = envs === 1
    ? ["its environment {where}", "every secret in it"]
    : envs
    ? [`its ${plural(envs, "environment")}`, "every secret in them"]
    : [];
  if (keys) parts.push(`${parts.length ? "" : "its "}${plural(keys, "API key")}`);
  return parts.length > 2 ? `${parts[0]}, ${parts[1]}, and ${parts[2]}` : parts.join(" and ");
}

/** Admin-only project settings: environments, project keys, connecting a host, and deletion. */
export function settingsRoutes(web: Hono<Env>, vault: Vault): void {
  web.get("/p/:slug/settings", (c) => {
    const who = c.get("who");
    const slug = c.req.param("slug");
    const project = vault.getProject(who, slug);
    const keys = vault.listKeys(who, slug); // admin only; throws 403 for project keys
    const envs = project.environments;
    const active = keys.filter((k) => !k.revokedAt).length;
    const what = lost(envs.length, active);
    const [before, after] = what.split("{where}");
    const enverr = c.req.query("enverr");
    const typed = enverr ? c.req.query("env") ?? "" : "";
    const addError = enverr === "exists"
      ? (
        <>
          <code>{typed}</code> already exists.
        </>
      )
      : enverr && "Use only lowercase letters, digits, and hyphens, and don't start with a hyphen.";
    const enc = encodeURIComponent(slug);

    return c.html(
      <Layout
        title={`Settings · ${project.name}`}
        who={who}
        css={css}
        active="projects"
        current="true"
        page="p-settings"
        heading={false}
      >
        <ProjectHeader
          who={who}
          project={project}
          tab="settings"
          actions={
            <a class="btn secondary" href={`/audit?project=${enc}`}>
              <Icon name="clock" />Audit log
            </a>
          }
        />
        <Flash c={c} />

        <SectionHeader
          id="environments"
          title="Environments"
          description="Each has its own folders and secrets."
        />
        <div class="envs">
          {envs.length
            ? (
              <div class="table-wrap">
                <table class="fixed" aria-labelledby="environments">
                  <colgroup>
                    <col />
                    <col class="actions" />
                  </colgroup>
                  <tbody>
                    {envs.map((e) => (
                      <tr class="row-link">
                        <td>
                          <a
                            class={isProd(e) ? "env mono prod" : "env mono"}
                            href={`/p/${slug}?env=${encodeURIComponent(e)}`}
                          >
                            <Breakable text={e} />
                          </a>
                        </td>
                        <td class="actions">
                          <Icon name="chevron-right" class="row-chevron" />
                          <EnvMenu slug={slug} env={e} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
            : (
              <EmptyState icon="layers" title="No environments yet">
                Add one, such as <code>dev</code>, to start storing secrets.
              </EmptyState>
            )}
          <form method="post" action={`/p/${slug}/envs`} id="add-env">
            <Field
              id="new-env"
              label="New environment"
              hint="Lowercase letters, digits, and hyphens."
              error={addError}
            >
              <div class="env-add">
                <input
                  id="new-env"
                  name="env"
                  class="mono"
                  value={typed}
                  required
                  pattern={ENV_PATTERN}
                  maxlength={63}
                  autofocus={!!addError}
                  aria-describedby={addError ? "new-env-hint new-env-error" : "new-env-hint"}
                  aria-invalid={addError ? "true" : undefined}
                  autocomplete="off"
                  autocapitalize="off"
                  spellcheck={false}
                />
                <button type="submit" class="secondary">
                  <Icon name="plus" />Add environment
                </button>
              </div>
            </Field>
          </form>
        </div>

        <SectionHeader
          id="keys"
          title="Project API keys"
          description={
            <>
              Keys that can only reach <code>{slug}</code>. Give each host or agent its own.
            </>
          }
          actions={keys.length > 0 && (
            <a class="btn secondary" href={`/keys/new?project=${enc}`}>
              <Icon name="plus" />New key
            </a>
          )}
        />
        <KeyTable keys={keys} who={who} project={slug} />

        <SectionHeader id="connect" title="Connect a host" />
        <ol class="steps">
          <li>Create a key above for the host. Its token and host file are shown once.</li>
          <li>
            <p>
              Save the host file as <code>~/.config/heka-vault/{slug}.env</code>, then run:
            </p>
            <CodeBlock label="Shell" code={`chmod 600 ~/.config/heka-vault/${slug}.env`} />
          </li>
          <li>
            <p>
              For agents, copy <code>skill/heka-vault/</code> into the repo and its script to{" "}
              <code>scripts/</code>, with <code>HEKA_VAULT_PROJECT</code> set to{" "}
              <code>{slug}</code>. Then run:
            </p>
            <CodeBlock label="Shell" code="./scripts/heka-vault-env.sh unlock" />
          </li>
        </ol>

        <SectionHeader id="danger" title="Danger zone" />
        <form
          method="post"
          action={`/p/${slug}/delete`}
          class="panel danger"
          data-confirm="Delete project"
          data-confirm-subject={slug}
          data-confirm-where={envs.length === 1 ? envs[0] : undefined}
          data-confirm-body={what
            ? `{subject} will be deleted with ${what}.`
            : "{subject} will be deleted."}
          data-confirm-warning={active
            ? "Hosts and agents using its keys lose access. This cannot be undone."
            : "This cannot be undone."}
          data-confirm-type={slug}
          data-confirm-action="Delete project"
        >
          <div class="panel-body danger-row">
            <div>
              <h3>Delete project</h3>
              <p class="muted">
                Deletes <code>{slug}</code>
                {what && (
                  <>
                    {" "}with {before}
                    {after !== undefined && (
                      <>
                        <code>{envs[0]}</code>
                        {after}
                      </>
                    )}
                  </>
                )}.
              </p>
            </div>
            <div class="nojs-only">
              <TypedField text={slug} error={!!c.req.query("mismatch")} />
            </div>
            <button type="submit" class="danger">Delete project</button>
          </div>
        </form>
      </Layout>,
    );
  });

  web.post("/p/:slug/envs", async (c) => {
    const f = await c.req.parseBody<Record<string, string>>();
    const slug = c.req.param("slug");
    const env = String(f.env ?? "").trim();
    try {
      vault.addEnvironment(c.get("who"), slug, env);
    } catch (e) {
      if (!(e instanceof VaultError) || (e.status !== 400 && e.status !== 409)) throw e;
      // Back to the field with the typed name kept and the error under it.
      const q = new URLSearchParams({ env, enverr: e.status === 409 ? "exists" : "invalid" });
      return c.redirect(`/p/${slug}/settings?${q}`, 303);
    }
    return back(c, `/p/${slug}/settings`, { msg: `Environment created: ${env}` });
  });

  // The no-JS confirmation for the row menu's Delete (with JS a <dialog> confirms the POST).
  web.get("/p/:slug/envs/delete", (c) => {
    const who = c.get("who");
    const slug = c.req.param("slug");
    const project = vault.getProject(who, slug);
    vault.listKeys(who, slug); // admin only; throws 403 for project keys
    const env = c.req.query("env") ?? "";
    if (!project.environments.includes(env)) {
      throw new VaultError(404, `environment not found: ${env}`);
    }
    return c.html(
      <Layout
        title="Delete environment"
        who={who}
        css={css}
        active="projects"
        current="true"
        page="p-settings"
        heading={false}
      >
        <ConfirmPage
          title="Delete environment"
          href={`/p/${slug}/envs/delete`}
          cancel={`/p/${slug}/settings`}
          body={
            <>
              <code>{env}</code> will be deleted from <code>{slug}</code> with every secret in it.
            </>
          }
          warning={ENV_WARNING}
          action="Delete environment"
        >
          <input type="hidden" name="env" value={env} />
          <TypedField text={env} error={!!c.req.query("mismatch")} />
        </ConfirmPage>
      </Layout>,
    );
  });

  web.post("/p/:slug/envs/delete", async (c) => {
    const f = await c.req.parseBody<Record<string, string>>();
    const slug = c.req.param("slug");
    const env = String(f.env ?? "");
    if (!env) throw new VaultError(400, "environment required");
    if (String(f.confirm ?? "") !== env) {
      // Only reachable without JS (the dialog won't submit until the text matches).
      return c.redirect(`/p/${slug}/envs/delete?env=${encodeURIComponent(env)}&mismatch=1`, 303);
    }
    vault.deleteEnvironment(c.get("who"), slug, env);
    return back(c, `/p/${slug}/settings`, { msg: `Environment deleted: ${env}` });
  });

  web.post("/p/:slug/delete", async (c) => {
    const f = await c.req.parseBody<Record<string, string>>();
    const slug = c.req.param("slug");
    if (String(f.confirm ?? "") !== slug) {
      // Only reachable without JS: back to the danger zone's typed field, marked invalid.
      return c.redirect(`/p/${slug}/settings?mismatch=1`, 303);
    }
    vault.deleteProject(c.get("who"), slug);
    return back(c, "/", { msg: `Project deleted: ${slug}` });
  });
}

function EnvMenu({ slug, env }: { slug: string; env: string }) {
  return (
    <RowMenu label={`More actions for ${env}`}>
      <form
        class="js-only"
        method="post"
        action={`/p/${slug}/envs/delete`}
        data-confirm="Delete environment"
        data-confirm-subject={env}
        data-confirm-where={slug}
        data-confirm-body="{subject} will be deleted from {where} with every secret in it."
        data-confirm-warning={ENV_WARNING}
        data-confirm-type={env}
        data-confirm-action="Delete environment"
      >
        <input type="hidden" name="env" value={env} />
        <input type="hidden" name="confirm" data-confirm-input />
        <button type="submit" class="menu-item danger">
          <Icon name="trash" />Delete environment
        </button>
      </form>
      <a
        class="menu-item danger nojs-only"
        href={`/p/${slug}/envs/delete?env=${encodeURIComponent(env)}`}
      >
        <Icon name="trash" />Delete environment
      </a>
    </RowMenu>
  );
}

/** The visible typed confirmation for the no-JS path; the server compares it again. */
function TypedField({ text, error }: { text: string; error?: boolean }) {
  return (
    <Field
      id="confirm"
      error={error && "That doesn't match. Type it exactly as shown."}
      label={
        <>
          Type <code>{text}</code> to confirm
        </>
      }
      input={{
        name: "confirm",
        class: "mono",
        required: true,
        autofocus: error,
        autocomplete: "off",
        autocapitalize: "off",
        spellcheck: false,
        "data-confirm-input": true,
      }}
    />
  );
}
