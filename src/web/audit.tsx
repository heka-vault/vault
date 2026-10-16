import type { Hono } from "@hono/hono";
import type { Child } from "@hono/hono/jsx";
import type { AuditEntry, AuditQuery, Role, Vault } from "../vault.ts";
import {
  Badge,
  Breakable,
  EmptyState,
  EnvBadge,
  Icon,
  Layout,
  PageHeader,
  Pager,
  RoleBadge,
  Time,
  type Tone,
} from "./layout.tsx";
import type { Env } from "./shared.tsx";

export const css = `
.p-audit .audit-filters>select{width:var(--w-search-min)}
.p-audit col.c-time{width:calc(var(--s-16) + var(--s-16))}
.p-audit col.c-actor{width:24%}
.p-audit col.c-action{width:calc(var(--s-16) + var(--s-16) + var(--s-6))}
.p-audit tr.day>th{color:var(--fg)}
.p-audit tbody+tbody tr.day>th{border-top:1px solid var(--border)}
.p-audit .actor{font-weight:500}
.p-audit .verb{white-space:nowrap}
.p-audit .count{margin-left:var(--s-1);color:var(--fg-muted)}
.p-audit .loc{display:flex;flex-wrap:wrap;align-items:center;gap:var(--s-1) var(--s-2)}
.p-audit .path{color:var(--fg-muted)}
.p-audit .apikey{display:inline-flex;align-items:center;gap:var(--s-1_5);min-width:0}
.p-audit .apikey>svg{flex:none;color:var(--fg-muted)}
@media (max-width:640px){
  .p-audit .audit-filters>select{flex:1 1 calc(50% - var(--s-2));width:auto;min-width:0}
  .p-audit col.c-actor{width:auto}
  .p-audit thead th{padding-block:0;border:0;font-size:0;line-height:0}
  .p-audit :is(th,td):nth-child(2){padding-left:var(--s-4);padding-right:var(--s-4)}
  .p-audit .line{display:flex;flex-wrap:wrap;align-items:center;gap:var(--s-1) var(--s-2);margin-bottom:var(--s-1)}
  .p-audit .when{margin-left:auto;color:var(--fg-muted);font-size:var(--text-sm)}
}
`;

const PAGE = 50;

/** Folder listings: every page view and agent poll writes them, so they are opt-in. */
const LISTS = ["secrets.list"];

/** The Action select. Without `action` the log shows reads and changes (everything but lists). */
const ACTIONS: Record<string, [string, AuditQuery]> = {
  reads: ["Secret reads", { actions: ["secret.read"] }],
  changes: ["Changes", {
    actions: [
      "secret.create",
      "secret.update",
      "secret.delete",
      "secrets.bulk",
      "project.",
      "env.",
      "key.",
    ],
  }],
  keys: ["API keys", { actions: ["key."] }],
  projects: ["Projects and envs", { actions: ["project.", "env."] }],
  lists: ["Folder listings", { actions: LISTS }],
  all: ["All activity", {}],
};

/**
 * How an action reads in the log: a verb (plus the object when it isn't a secret) and a badge tone.
 * Lists have no tone: they are background noise, so they stay plain muted text.
 */
const VERBS: Record<string, [string, Tone?]> = {
  "secret.read": ["Read", "outline"],
  "secrets.list": ["Listed"],
  "secrets.list.recursive": ["Listed"],
  "secret.create": ["Created", "neutral"],
  "secret.update": ["Updated", "neutral"],
  "secret.delete": ["Deleted", "danger"],
  "secrets.bulk": ["Imported", "neutral"],
  "project.create": ["Created project", "neutral"],
  "project.delete": ["Deleted project", "danger"],
  "env.create": ["Created environment", "neutral"],
  "env.delete": ["Deleted environment", "danger"],
  "key.create": ["Created key", "neutral"],
  "key.revoke": ["Revoked key", "danger"],
};

type Filter = { project?: string; actor?: string; action?: string };

/** `/audit` with the given filters (and cursor), dropping empty ones. */
function auditUrl(f: Filter & { before?: number; after?: number }): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v !== undefined && v !== "") q.set(k, String(v));
  return q.size ? `/audit?${q}` : "/audit";
}

const cursor = (v: string | undefined) => {
  const n = Number(v);
  return Number.isSafeInteger(n) && n > 0 ? n : undefined;
};

/** The admin audit log: who touched what, where. Never values. */
export function auditRoutes(web: Hono<Env>, vault: Vault): void {
  web.get("/audit", (c) => {
    const who = c.get("who");
    const q = (k: string) => c.req.query(k) || undefined;
    const action = Object.hasOwn(ACTIONS, q("action") ?? "") ? q("action") : undefined;
    const f: Filter = { project: q("project"), actor: q("actor"), action };
    const query: AuditQuery = {
      project: f.project,
      actor: f.actor,
      ...(action ? ACTIONS[action][1] : { except: LISTS }),
    };
    const before = cursor(q("before"));
    const after = before === undefined ? cursor(q("after")) : undefined;
    // Keep URLs shareable: the filter form submits every select, so drop empty values, unknown
    // actions, and bad cursors with a redirect to the clean URL.
    const clean = auditUrl({ ...f, before, after });
    const given = new URL(c.req.url).searchParams;
    const want = new URLSearchParams(clean.split("?")[1]);
    if (given.size !== want.size || [...given].some(([k, v]) => want.get(k) !== v)) {
      return c.redirect(clean);
    }
    const entries = vault.listAudit(who, { ...query, before, after, limit: PAGE });
    // A cursor past either end has nothing to show: go to the newest page of the same view.
    if (!entries.length && (before || after)) return c.redirect(auditUrl(f));
    const total = vault.countAudit(who, query);
    const newer = entries.length ? vault.countAudit(who, { ...query, after: entries[0].id }) : 0;
    const older = total - newer - entries.length;
    const filtered = !!(f.project || f.actor || action);
    const empty = !filtered && !total && !vault.countAudit(who);

    const facets = vault.auditFacets(who);
    const live = new Set(vault.listProjects(who).map((p) => p.slug));
    const logged = !f.project || facets.projects.includes(f.project);
    const fmt = (n: number) => n.toLocaleString("en-US");

    return c.html(
      <Layout title="Audit log" who={who} css={css} active="audit" page="p-audit" heading={false}>
        <PageHeader
          title="Audit log"
          description={
            <>
              {f.project && logged
                ? (
                  <>
                    Activity in {live.has(f.project)
                      ? (
                        <a href={`/p/${encodeURIComponent(f.project)}`}>
                          <code>{f.project}</code>
                        </a>
                      )
                      : (
                        <>
                          <code>{f.project}</code> (deleted)
                        </>
                      )}.{" "}
                  </>
                )
                : "Every read and change, by key. "}
              Values are never recorded.
            </>
          }
        />
        {empty
          ? (
            <EmptyState icon="clock" title="No activity yet">
              Secret reads, changes, and key events will appear here.
            </EmptyState>
          )
          : (
            <>
              <form class="table-toolbar audit-filters" method="get" action="/audit">
                <Select name="project" label="Project" first="All projects">
                  {!logged && <option value={f.project} selected>{f.project} (not in log)</option>}
                  {facets.projects.map((p) => (
                    <option value={p} selected={p === f.project}>
                      {live.has(p) ? p : `${p} (deleted)`}
                    </option>
                  ))}
                </Select>
                <Select name="actor" label="Actor" first="All actors">
                  {facets.actors.map((a) => (
                    <option value={a} selected={a === f.actor}>{a}</option>
                  ))}
                </Select>
                <Select name="action" label="Action" first="Reads and changes">
                  {Object.entries(ACTIONS).map(([v, [label]]) => (
                    <option value={v} selected={v === action}>{label}</option>
                  ))}
                </Select>
                <button type="submit" class="secondary">Apply</button>
                {filtered && entries.length > 0 && (
                  <a class="btn ghost" href="/audit">
                    <span>
                      Clear <span class="hide-sm">filters</span>
                    </span>
                  </a>
                )}
              </form>
              {entries.length
                ? (
                  <div class="table-wrap">
                    <table class="fixed">
                      <colgroup>
                        <col class="c-time hide-sm" />
                        <col class="c-actor" />
                        <col class="c-action hide-sm" />
                        <col class="hide-sm" />
                      </colgroup>
                      <thead>
                        <tr>
                          <th class="hide-sm">Time (UTC)</th>
                          <th>Actor</th>
                          <th class="hide-sm">Action</th>
                          <th class="hide-sm">Location</th>
                        </tr>
                      </thead>
                      {days(runs(entries)).map(([day, rs]) => (
                        <tbody>
                          <tr class="day">
                            {/* Mobile shows one stacked column, so the day header has one cell per layout. */}
                            <th colspan={4} scope="rowgroup" class="hide-sm">
                              <Time at={day} day />
                            </th>
                            <th scope="rowgroup" class="show-sm">
                              <Time at={day} day />
                            </th>
                          </tr>
                          {rs.map((r) => <Row r={r} f={f} />)}
                        </tbody>
                      ))}
                    </table>
                    {(newer > 0 || older > 0) && (
                      <Pager
                        label={`Showing ${fmt(newer + 1)}–${fmt(newer + entries.length)} of ${
                          fmt(total)
                        }`}
                        prev={newer > 0
                          ? auditUrl(newer > PAGE ? { ...f, after: entries[0].id } : f)
                          : undefined}
                        next={older > 0
                          ? auditUrl({ ...f, before: entries.at(-1)!.id })
                          : undefined}
                      />
                    )}
                  </div>
                )
                : !filtered
                ? (
                  <EmptyState
                    plain
                    icon="clock"
                    title="No reads or changes yet"
                    actions={
                      <a class="btn secondary" href="/audit?action=all">Show all activity</a>
                    }
                  >
                    So far keys have only listed folders.
                  </EmptyState>
                )
                : (
                  <EmptyState
                    plain
                    icon="search"
                    title={logged ? "No matching activity" : (
                      <>
                        No activity for <code>{f.project}</code>
                      </>
                    )}
                    actions={<a class="btn secondary" href="/audit">Clear filters</a>}
                  >
                    {logged
                      ? "Try another project, actor, or action."
                      : "No project by that name appears in the log."}
                  </EmptyState>
                )}
            </>
          )}
      </Layout>,
    );
  });
}

function Select(
  { name, label, first, children }: { name: string; label: string; first: string; children: Child },
) {
  return (
    <select name={name} aria-label={label}>
      <option value="">{first}</option>
      {children}
    </select>
  );
}

/** Consecutive identical folder listings (an agent polling) collapse into one row with a count. */
type Run = { e: AuditEntry; n: number; from: string };

const day = (at: string) => new Date(at).toISOString().slice(0, 10);
const same = (a: AuditEntry, b: AuditEntry) =>
  a.action.startsWith("secrets.list") && a.actor === b.actor && a.action === b.action &&
  a.project === b.project && a.env === b.env && a.path === b.path && day(a.at) === day(b.at);

function runs(entries: AuditEntry[]): Run[] {
  const out: Run[] = [];
  for (const e of entries) {
    const last = out.at(-1);
    if (last && same(last.e, e)) {
      last.n++;
      last.from = e.at;
    } else out.push({ e, n: 1, from: e.at });
  }
  return out;
}

function days(rs: Run[]): [string, Run[]][] {
  const out: [string, Run[]][] = [];
  for (const r of rs) {
    const d = day(r.e.at);
    if (out.at(-1)?.[0] === d) out.at(-1)![1].push(r);
    else out.push([d, [r]]);
  }
  return out;
}

function Verb({ r }: { r: Run }) {
  const action = r.e.action.replace(/\(.*\)$/, "");
  const [verb, tone] = VERBS[action] ?? [r.e.action, "outline"];
  return (
    <span class="verb">
      {tone
        ? <Badge tone={tone} mono={!VERBS[action]}>{verb}</Badge>
        : <span class="muted">{verb}</span>}
      {r.n > 1 && (
        <span class="count tnum">
          <span aria-hidden="true">×{r.n}</span>
          <span class="sr-only">{r.n} times</span>
        </span>
      )}
    </span>
  );
}

/**
 * Desktop: time, actor, action, location in columns. Mobile: one stacked cell, actor · action ·
 * time over the location, so nothing is truncated.
 */
function Row({ r, f }: { r: Run; f: Filter }) {
  const { e } = r;
  // A run of listings that spans minutes says when it started.
  const long = Date.parse(e.at) - Date.parse(r.from) >= 60_000;
  return (
    <tr>
      <td class="hide-sm">
        {long
          ? (
            <div class="cell-2">
              <Time at={e.at} clock />
              <span class="cell-meta">
                from <Time at={r.from} clock />
              </span>
            </div>
          )
          : <Time at={e.at} clock />}
      </td>
      <td>
        <div class="line">
          <span class="actor">
            <Breakable text={e.actor} />
          </span>
          <span class="show-sm">
            <Verb r={r} />
          </span>
          <span class="show-sm when">
            {long && (
              <>
                <Time at={r.from} clock />–
              </>
            )}
            <Time at={e.at} clock />
          </span>
        </div>
        <div class="show-sm">
          <Location e={e} f={f} />
        </div>
      </td>
      <td class="hide-sm">
        <Verb r={r} />
      </td>
      <td class="hide-sm">
        <Location e={e} f={f} />
      </td>
    </tr>
  );
}

/** Project, env, then the object: `/folder/KEY`, a folder glob, an import, or an API key. */
function Location({ e, f }: { e: AuditEntry; f: Filter }) {
  const action = e.action.replace(/\(.*\)$/, "");
  const arg = /\((.*)\)$/.exec(e.action)?.[1];
  const scoped = f.project === e.project;
  const folder = e.path === "/" ? "/" : `${e.path}/`;
  return (
    <div class="loc">
      {e.project && !scoped && (
        <a
          class="mono"
          href={auditUrl({ ...f, project: e.project })}
          title={`Show only ${e.project}`}
          aria-label={`Show only ${e.project}`}
        >
          <Breakable text={e.project} />
        </a>
      )}
      {e.project && scoped && !e.env && !e.key && <code>{e.project}</code>}
      {e.env && <EnvBadge env={e.env} />}
      {e.path && action.startsWith("secrets.list") && (
        <code class="path">
          <Breakable text={folder + (action === "secrets.list.recursive" ? "**" : "*")} />
        </code>
      )}
      {e.path && action === "secrets.bulk" && (
        <span>
          <span class="muted">{counts(arg ?? "")} in</span> <code>{e.path}</code>
        </span>
      )}
      {e.path && e.key && (
        <code>
          <span class="path">
            <Breakable text={folder} />
          </span>
          <wbr />
          <Breakable text={e.key} />
        </code>
      )}
      {!e.path && e.key && (
        <span class="apikey">
          <Icon name="key" label="API key" />
          <span>
            <Breakable text={e.key} />
          </span>
        </span>
      )}
      {action === "key.create" && arg && <RoleBadge role={arg as Role} />}
    </div>
  );
}

/** `+8 ~1 -0` as "8 added, 1 updated". */
function counts(arg: string): string {
  const [added, updated, deleted] = arg.split(" ").map((s) => Number(s.slice(1)));
  const parts = [[added, "added"], [updated, "updated"], [deleted, "deleted"]] as const;
  return parts.filter(([n]) => n > 0).map(([n, w]) => `${n} ${w}`).join(", ") || "No changes";
}
