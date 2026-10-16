import type { Context, Hono } from "@hono/hono";
import type { Child } from "@hono/hono/jsx";
import { type Vault, VaultError } from "../vault.ts";
import {
  EmptyState,
  EnvBadge,
  Field,
  Icon,
  Layout,
  PageHeader,
  SearchField,
  Time,
} from "./layout.tsx";
import { back, type Env, Flash } from "./shared.tsx";

export const css = `
.p-projects col.c-envs{width:32%}
.p-projects col.c-created{width:14%}
.p-projects .env-list{display:flex;flex-wrap:wrap;gap:var(--s-1)}
.p-projects .presets{display:flex;flex-wrap:wrap;gap:var(--s-2) var(--s-6);margin:0 0 var(--s-4)}
.p-projects .presets>label{margin:0}
.p-projects .hint code{white-space:nowrap}
.p-projects .rule>svg{display:none;vertical-align:text-bottom;margin-right:var(--s-1)}
.p-projects .field:has(:user-invalid) .rule{color:var(--danger-fg)}
.p-projects .field:has(:user-invalid) .rule>svg{display:inline}
.p-projects :user-invalid{border-color:var(--danger)}
`;

const PRESETS = ["dev", "staging", "prod"];
/** Below this many projects the whole list fits on a screen and a filter is noise. */
const FILTER_MIN = 10;
const CRUMBS = [{ label: "Projects", href: "/" }, { label: "New project" }];
const NAME_PATTERN = "[a-z0-9][a-z0-9\\-]*";
const LIST_PATTERN = `[\\s,]*(${NAME_PATTERN}[\\s,]*)*`;
/** Set by this module, not the vault: the vault would quietly create `dev` instead. */
const NO_ENVS = "choose at least one environment";

/** The admin's project list and project creation. Project keys are sent to their project. */
export function projectRoutes(web: Hono<Env>, vault: Vault): void {
  web.get("/", (c) => {
    const who = c.get("who");
    if (who.project) return c.redirect(`/p/${who.project}`);
    const projects = vault.listProjects(who);
    const create = (
      <a class="btn" href="/projects/new">
        <Icon name="plus" />New project
      </a>
    );
    return c.html(
      <Layout
        title="Projects"
        who={who}
        css={css}
        active="projects"
        page="p-projects"
        heading={false}
      >
        <PageHeader
          title="Projects"
          description="Each project has its own environments, folders, and keys."
          actions={projects.length > 0 && create}
        />
        <Flash c={c} />
        {projects.length === 0
          ? (
            <EmptyState icon="folder" title="No projects yet" actions={create}>
              A project keeps secrets for each of its environments. Create one, then add a project
              key for each host or agent that reads them.
            </EmptyState>
          )
          : (
            <>
              {projects.length >= FILTER_MIN && (
                <div class="table-toolbar">
                  <SearchField
                    filter=".p-projects tbody tr"
                    empty="#no-match"
                    label="Filter projects"
                    placeholder="Filter by name or environment"
                  />
                </div>
              )}
              <div class="table-wrap">
                <table class="fixed">
                  <colgroup>
                    <col />
                    <col class="c-envs hide-sm" />
                    <col class="c-created hide-sm" />
                    <col class="actions" />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>Project</th>
                      <th class="hide-sm">Environments</th>
                      <th class="hide-sm">Created</th>
                      <th class="actions">
                        <span class="sr-only">Open</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {projects.map((p) => (
                      <tr
                        class="row-link"
                        data-filter-text={`${p.name} ${p.slug} ${p.environments.join(" ")}`}
                      >
                        <td>
                          <div class="cell-2">
                            <a
                              href={`/p/${p.slug}`}
                              class={p.name === p.slug ? "cell-main mono" : "cell-main"}
                            >
                              {p.name}
                            </a>
                            {p.name !== p.slug && <span class="cell-meta mono">{p.slug}</span>}
                          </div>
                        </td>
                        <td class="hide-sm">
                          <span class="env-list">
                            {p.environments.map((e) => <EnvBadge env={e} />)}
                          </span>
                        </td>
                        <td class="hide-sm">
                          <Time at={p.createdAt} />
                        </td>
                        <td class="actions">
                          <Icon name="chevron-right" class="row-chevron" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <EmptyState plain icon="search" title="No matching projects" id="no-match" hidden>
                Try another name, slug, or environment.
              </EmptyState>
            </>
          )}
      </Layout>,
    );
  });

  web.get("/projects/new", (c) => {
    const who = c.get("who");
    if (who.project) return c.redirect(`/p/${who.project}`);
    const q = (k: string) => c.req.query(k) ?? "";
    const err = q("err");
    const slug = q("slug");
    const envs = c.req.queries("env") ?? (err ? [] : PRESETS);
    const errors = fieldErrors(err, slug);
    return c.html(
      <Layout
        title="New project"
        who={who}
        css={css}
        active="projects"
        current="true"
        page="p-projects"
        heading={false}
      >
        <div class="form-page">
          <PageHeader
            crumbs={CRUMBS}
            title="New project"
            description="Each environment keeps its own secrets. Project keys for hosts and agents come next."
          />
          {!errors.slug && !errors.other && <Flash c={c} />}
          <form method="post" action="/projects">
            <Field
              id="slug"
              label="Slug"
              hint={
                <>
                  <span class="rule">
                    <Icon name="alert" />Lowercase letters, digits, and hyphens.
                  </span>{" "}
                  Used in <code>/p/billing-api</code> and the API. Can't be changed.
                </>
              }
              error={errors.slug}
              input={{
                name: "slug",
                value: slug,
                class: "mono",
                required: true,
                pattern: NAME_PATTERN,
                maxlength: 63,
                title: "Lowercase letters, digits, and hyphens",
                placeholder: "billing-api",
                autocomplete: "off",
                spellcheck: false,
                autofocus: !errors.other,
              }}
            />
            <Field
              id="name"
              label="Display name"
              optional
              hint="Defaults to the slug."
              input={{
                name: "name",
                value: q("name"),
                placeholder: "Billing service",
                autocomplete: "off",
              }}
            />
            <fieldset>
              <legend>Environments</legend>
              <div class="presets">
                {PRESETS.map((e) => (
                  <label class="check">
                    <input type="checkbox" name="env" value={e} checked={envs.includes(e)} />
                    <EnvBadge env={e} />
                  </label>
                ))}
              </div>
              <Field
                id="other"
                label="Other environments"
                optional
                hint="Separate names with commas. You can change environments later in settings."
                error={errors.other}
                input={{
                  name: "other",
                  value: q("other"),
                  class: "mono",
                  pattern: LIST_PATTERN,
                  title: "Lowercase names separated by commas",
                  placeholder: "qa, preview",
                  autocomplete: "off",
                  spellcheck: false,
                  autofocus: !!errors.other,
                }}
              />
            </fieldset>
            <div class="form-actions">
              <button type="submit">Create project</button>
              <a class="btn secondary" href="/">Cancel</a>
            </div>
          </form>
        </div>
      </Layout>,
    );
  });

  web.post("/projects", async (c) => {
    const f = await c.req.parseBody({ all: true });
    const input = {
      slug: String(f.slug ?? "").trim(),
      name: String(f.name ?? ""),
      env: [f.env ?? []].flat().map(String),
      other: String(f.other ?? ""),
    };
    const environments = [...input.env, ...input.other.split(/[\s,]+/)].filter(Boolean);
    if (!environments.length) return redisplay(c, input, NO_ENVS);
    try {
      const p = vault.createProject(c.get("who"), {
        slug: input.slug,
        name: input.name,
        environments,
      });
      return back(c, `/p/${p.slug}`, { msg: `Project created: ${p.slug}` });
    } catch (e) {
      if (!(e instanceof VaultError) || e.status === 403) throw e;
      return redisplay(c, input, e.message);
    }
  });
}

/** Errors that belong under a field. Anything else is left to the flash. */
function fieldErrors(err: string, slug: string): { slug?: Child; other?: Child } {
  const badEnv = /^invalid env: (.*)$/.exec(err)?.[1];
  if (err === "project already exists") {
    return {
      slug: (
        <span>
          A project called <code>{slug}</code> already exists.
        </span>
      ),
    };
  }
  if (err === "invalid project slug") {
    return { slug: <Invalid value={slug} lead="Not a valid slug." /> };
  }
  if (err === NO_ENVS) return { other: <span>Choose at least one environment.</span> };
  if (badEnv === undefined) return {};
  return {
    other: (
      <Invalid
        value={badEnv}
        lead={
          <>
            <code>{badEnv}</code> isn't a valid environment name.
          </>
        }
      />
    ),
  };
}

/** "Billing API" -> "billing-api": a valid name to offer when one is rejected. */
const suggest = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 63);

/** "Not a valid slug. Try billing-api." in one inline run, so the error wraps as a sentence. */
function Invalid({ value, lead }: { value: string; lead: Child }) {
  const fix = suggest(value);
  return (
    <span>
      {lead}
      {fix && (
        <>
          {" "}Try <code>{fix}</code>.
        </>
      )}
    </span>
  );
}

/** Back to the form with what was typed (never secret: slugs and names) and the error. */
function redisplay(
  c: Context,
  input: { slug: string; name: string; env: string[]; other: string },
  err: string,
) {
  const q = new URLSearchParams({ slug: input.slug, name: input.name, other: input.other });
  for (const e of input.env) q.append("env", e);
  return back(c, `/projects/new?${q}`, { err });
}
