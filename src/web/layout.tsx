import type { Child, JSX } from "@hono/hono/jsx";
import { raw as html } from "@hono/hono/html";
import type { Principal, Project, Role } from "../vault.ts";
import { CLIENT_JS } from "./client.ts";
import { CSS } from "./styles.ts";

export type Section = "projects" | "keys" | "audit" | "docs";

/**
 * The app shell. Pages pass their own `css` (appended after the shared styles) and a `page` class
 * to scope it. `heading={false}` drops the default <h1> so the page can render its own PageHeader.
 * `active` marks the top-nav section: `aria-current="page"` when this page is that section's root,
 * pass `current="true"` on pages inside it (a project's secrets or settings). Without `who` (signed
 * out) the minimal centered shell is used, unless `next` is set: then the full top bar shows a
 * "Sign in" link that returns to `next`. `head` goes after the shared CSS and before the page `css`;
 * `layer` puts the shared CSS in that cascade layer (so third-party CSS in `head` can win).
 */
export function Layout(
  { title, who, css, active, current, page, heading = true, next, head, layer, children }: {
    title: string;
    who?: Principal;
    css?: string;
    active?: Section;
    current?: "page" | "true";
    page?: string;
    heading?: boolean;
    next?: string;
    head?: Child;
    layer?: string;
    children: Child;
  },
) {
  return (
    <>
      {html("<!doctype html>")}
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <meta name="color-scheme" content="light dark" />
          <title>{title} · Heka Vault</title>
          <style>{html(layer ? `@layer ${layer}{${CSS}}` : CSS)}</style>
          <script>{html(CLIENT_JS)}</script>
          {head}
          {css && <style>{html(css)}</style>}
        </head>
        <body class={who || next !== undefined ? "shell" : "shell-min"}>
          <a class="skip" href="#main">Skip to content</a>
          <AppHeader who={who} active={active} current={current} next={next} />
          <main id="main" class={page} tabindex={-1}>
            {heading && <PageHeader title={title} />}
            {children}
          </main>
          <ConfirmDialog />
          <div id="toast" class="toast" role="status" aria-live="polite"></div>
        </body>
      </html>
    </>
  );
}

/**
 * Top bar: brand, primary nav (admins only; a project key has one place to go, which the brand links
 * to), API docs, and the signed-in key's menu. Signed out with `next`: a "Sign in" link back to it.
 */
export function AppHeader(
  { who, active, current = "page", next }: {
    who?: Principal;
    active?: Section;
    current?: "page" | "true";
    next?: string;
  },
) {
  const nav: [Section, string, string][] = who?.role === "admin"
    ? [["projects", "/", "Projects"], ["keys", "/keys", "Keys"], [
      "audit",
      "/audit",
      "Audit",
    ]]
    : [];
  return (
    <header class="topbar">
      <div class="topbar-in">
        <a href="/" class="brand">
          <BrandMark />
          <span class="brand-name">Heka Vault</span>
        </a>
        {who && (
          <>
            {nav.length > 0 && (
              <nav class="nav" aria-label="Primary">
                {nav.map(([key, href, label]) => (
                  <a
                    href={href}
                    aria-current={active === key ? current : undefined}
                  >
                    {label}
                  </a>
                ))}
              </nav>
            )}
            <div class="topbar-end">
              <a
                href="/docs"
                class="topbar-link topbar-docs"
                aria-current={active === "docs" ? "page" : undefined}
              >
                <Icon name="book" />API docs
              </a>
              <AccountMenu who={who} />
            </div>
          </>
        )}
        {!who && next !== undefined && (
          <div class="topbar-end">
            <a href={`/login?next=${encodeURIComponent(next)}`} class="topbar-link">Sign in</a>
          </div>
        )}
      </div>
    </header>
  );
}

function AccountMenu({ who }: { who: Principal }) {
  return (
    <details class="menu-wrap account">
      <summary
        aria-label={`Account: ${who.name}, ${who.role}${who.project ? `, ${who.project}` : ""}`}
      >
        <span class="avatar" aria-hidden="true">
          <Icon name="key" size={14} />
        </span>
        <span class="account-name">{who.name}</span>
        <RoleBadge role={who.role} />
        <Icon name="chevron-down" />
      </summary>
      <div class="menu">
        <div class="menu-head">
          <div class="menu-title">{who.name}</div>
          <div class="menu-meta">
            <RoleBadge role={who.role} />
            {who.project ? <span class="mono">{who.project}</span> : <span>All projects</span>}
          </div>
        </div>
        <div class="menu-sep"></div>
        <a href="/docs" class="menu-item">
          <Icon name="book" />API docs
        </a>
        <form method="post" action="/logout">
          <button type="submit" class="menu-item">
            <Icon name="logout" />Sign out
          </button>
        </form>
      </div>
    </details>
  );
}

/**
 * Admins: breadcrumb (Projects / slug), project name, Secrets / Settings tabs. Project keys: the
 * project name with its slug underneath (no one-item breadcrumb, no tabs).
 */
export function ProjectHeader(
  { who, project, tab, description, actions }: {
    who: Principal;
    project: Project;
    tab: "secrets" | "settings";
    description?: Child;
    actions?: Child;
  },
) {
  const isAdmin = who.role === "admin";
  const base = `/p/${project.slug}`;
  return (
    <div class="project-head">
      <PageHeader
        title={project.name}
        crumbs={isAdmin
          ? [
            { label: "Projects", href: "/" },
            { label: <span class="mono">{project.slug}</span>, current: false },
          ]
          : undefined}
        description={description ??
          (isAdmin ? undefined : <span class="mono">{project.slug}</span>)}
        actions={actions}
      />
      {isAdmin && (
        <nav class="tabnav" aria-label="Project">
          <a href={base} aria-current={tab === "secrets" ? "page" : undefined}>
            Secrets
          </a>
          <a
            href={`${base}/settings`}
            aria-current={tab === "settings" ? "page" : undefined}
          >
            Settings
          </a>
        </nav>
      )}
    </div>
  );
}

/** The last crumb is `aria-current="page"` unless `current: false` (when a tab marks the page). */
export type Crumb = { label: Child; href?: string; current?: boolean };

/** Page title with optional breadcrumb, one-line description, and right-aligned actions. */
export function PageHeader(
  { title, description, actions, crumbs }: {
    title: Child;
    description?: Child;
    actions?: Child;
    crumbs?: Crumb[];
  },
) {
  return (
    <div class="page-head">
      {crumbs && (
        <nav class="crumbs" aria-label="Breadcrumb">
          <ol>
            {crumbs.map((c, i) => (
              <li>
                {c.href && i < crumbs.length - 1 ? <a href={c.href}>{c.label}</a> : (
                  <span
                    aria-current={c.current === false ? undefined : "page"}
                  >
                    {c.label}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      )}
      <div class="page-head-row">
        <div class="page-head-text">
          <h1>{title}</h1>
          {description && <p class="page-desc">{description}</p>}
        </div>
        {actions && <div class="page-actions">{actions}</div>}
      </div>
    </div>
  );
}

/** An <h2> section title with optional description and actions. */
export function SectionHeader(
  { title, description, actions, id }: {
    title: Child;
    description?: Child;
    actions?: Child;
    id?: string;
  },
) {
  return (
    <div class="section-head">
      <div>
        <h2 id={id}>{title}</h2>
        {description && <p class="section-desc">{description}</p>}
      </div>
      {actions && <div class="section-actions">{actions}</div>}
    </div>
  );
}

export type Tone =
  | "neutral"
  | "outline"
  | "strong"
  | "accent"
  | "ok"
  | "danger"
  | "warn"
  | "prod";

export function Badge(
  { tone = "neutral", mono, dot, title, children }: {
    tone?: Tone;
    mono?: boolean;
    dot?: boolean;
    title?: string;
    children: Child;
  },
) {
  const cls = ["badge", tone !== "neutral" && tone, mono && "mono"].filter(
    Boolean,
  ).join(" ");
  return (
    <span class={cls} title={title}>
      {dot && <span class="dot" aria-hidden="true"></span>}
      {children}
    </span>
  );
}

const ROLE_TONE: Record<Role, Tone> = {
  admin: "accent",
  readwrite: "neutral",
  read: "outline",
};

export function RoleBadge({ role }: { role: Role }) {
  return <Badge tone={ROLE_TONE[role]}>{role}</Badge>;
}

export const isProd = (env: string) => /^(prod|production|live)$/i.test(env);

/** Environment name; production-like environments get the prod emphasis. */
export function EnvBadge({ env }: { env: string }) {
  return isProd(env) ? <Badge tone="prod" mono dot>{env}</Badge> : <Badge mono>{env}</Badge>;
}

export type FlashTone = "ok" | "err" | "warn" | "info" | "prod";

const FLASH_ICON: Record<FlashTone, IconName> = {
  ok: "check-circle",
  err: "alert",
  warn: "warning",
  info: "info",
  prod: "shield",
};

/**
 * A message block. `ok` and `info` can be dismissed (JS only); `err`, `warn`, and `prod` stay until
 * the page changes because they describe something the user still has to act on.
 */
export function FlashMessage(
  { tone = "ok", dismissible, children }: {
    tone?: FlashTone;
    dismissible?: boolean;
    children: Child;
  },
) {
  const canDismiss = dismissible ?? (tone === "ok" || tone === "info");
  return (
    <div class={`flash ${tone}`} role={tone === "err" ? "alert" : "status"}>
      <Icon name={FLASH_ICON[tone]} />
      <div class="flash-text">{children}</div>
      {canDismiss && (
        <button
          type="button"
          class="ghost small icon flash-close js-only"
          data-dismiss
          aria-label="Dismiss"
        >
          <Icon name="x" />
        </button>
      )}
    </div>
  );
}

/**
 * Icon, title, one sentence, at most one action. `plain` drops the dashed border (inside a table or
 * card); `center` centres it vertically when a grid row stretches it; `page` makes it the page's
 * content with the title as its <h1> (error pages). `eyebrow` is a muted mono status line above the
 * title (`404`); `detail` is a muted mono line under the actions for the raw vault message.
 */
export function EmptyState(
  { icon, eyebrow, title, children, actions, detail, plain, center, page, id, hidden }: {
    icon?: IconName;
    eyebrow?: Child;
    title: Child;
    children?: Child;
    actions?: Child;
    detail?: Child;
    plain?: boolean;
    center?: boolean;
    page?: boolean;
    id?: string;
    hidden?: boolean;
  },
) {
  const Title = page ? "h1" : "p";
  const cls = ["empty", page ? "page" : plain && "plain", center && "center"].filter(Boolean);
  return (
    <div class={cls.join(" ")} id={id} hidden={hidden}>
      {icon && (
        <span class="empty-icon">
          <Icon name={icon} size={20} />
        </span>
      )}
      {eyebrow && <p class="empty-eyebrow">{eyebrow}</p>}
      <Title class="empty-title">{title}</Title>
      {children && <p class="empty-text">{children}</p>}
      {actions && <div class="empty-actions">{actions}</div>}
      {detail && <p class="empty-detail">{detail}</p>}
    </div>
  );
}

/**
 * Copies `text` (or the text of the element matched by `from`). Icon-only by default with `label`
 * as its accessible name; `withLabel` shows the label next to the icon.
 */
export function CopyButton(
  { text, from, label = "Copy", withLabel, class: cls = "ghost small" }: {
    text?: string;
    from?: string;
    label?: string;
    withLabel?: boolean;
    class?: string;
  },
) {
  return (
    <button
      type="button"
      class={withLabel ? cls : `${cls} icon`}
      data-copy={text}
      data-copy-from={from}
      aria-label={withLabel ? undefined : label}
      title={withLabel ? undefined : label}
    >
      <Icon name="copy" class="i-copy" />
      <Icon name="check" class="i-check" />
      {withLabel && label}
    </button>
  );
}

/** A pre block with a header label and a copy button. */
export function CodeBlock({ code, label }: { code: string; label?: Child }) {
  return (
    <div class="codeblock">
      <div class="codeblock-head">
        <span>{label}</span>
        <CopyButton text={code} label="Copy" withLabel />
      </div>
      <pre><code>{code}</code></pre>
    </div>
  );
}

type InputProps = JSX.IntrinsicElements["input"];
type TextareaProps = JSX.IntrinsicElements["textarea"] & { value?: string };

/**
 * Label + control + hint + error. Pass `input={{…}}` or `textarea={{…}}` and Field renders the control
 * with `id`, `aria-describedby`, and `aria-invalid` wired. A custom control (e.g. <select>) can be
 * passed as children with the same `id`; client.ts then wires the aria attributes.
 */
export function Field(
  { id, label, hint, error, optional, input, textarea, children }: {
    id: string;
    label: Child;
    hint?: Child;
    error?: Child;
    optional?: boolean;
    input?: InputProps;
    textarea?: TextareaProps;
    children?: Child;
  },
) {
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(" ") ||
    undefined;
  const aria = {
    id,
    "aria-describedby": describedBy,
    "aria-invalid": error ? "true" : undefined,
  };
  let control: Child = children;
  if (input) control = <input {...aria} {...input} />;
  if (textarea) {
    const { value, ...rest } = textarea;
    control = <textarea {...aria} {...rest}>{value}</textarea>;
  }
  return (
    <div class="field">
      <label for={id}>
        <span>
          {label}
          {optional && <span class="label-opt">(optional)</span>}
        </span>
      </label>
      {control}
      {hint && <p class="hint" id={`${id}-hint`}>{hint}</p>}
      {error && (
        <p class="field-error" id={`${id}-error`}>
          <Icon name="alert" />
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * A masked secret: plain muted dots, an eye toggle (aria-pressed; its name stays "Show KEY"), and a
 * copy button (JS only). The value is fetched from `src` on first reveal or copy, so the page never
 * carries it, into a span hidden by CSS until revealed. In a table cell it fills the cell, so the eye
 * and copy stay pinned at the right edge in both states. Pages provide their own no-JS link to `src`.
 */
export function SecretValue({ id, label, src }: { id: string; label: string; src: string }) {
  return (
    <span class="secret" data-src={src}>
      <code class="secret-chip" id={id}>
        <span class="secret-mask">
          <span aria-hidden="true">••••••••</span>
          <span class="sr-only">hidden</span>
        </span>
        <span class="secret-value" id={`${id}-value`}></span>
      </code>
      <button
        type="button"
        class="ghost small icon js-only"
        data-reveal={`#${id}`}
        aria-pressed="false"
        aria-controls={id}
        aria-label={`Show ${label}`}
        title={`Show ${label}`}
      >
        <Icon name="eye" class="i-eye" />
        <Icon name="eye-off" class="i-eye-off" />
      </button>
      <CopyButton from={`#${id}-value`} label={`Copy ${label}`} class="ghost small js-only" />
    </span>
  );
}

/**
 * Text with break opportunities after `_`, `/`, `.`, and `-` (keys, paths), so a narrow column wraps
 * STRIPE_WEBHOOK_/SECRET at a separator instead of mid-word. <wbr> is not copied with the text.
 */
export function Breakable({ text }: { text: string }) {
  const parts = text.split(/(?<=[_/.-])/);
  return <>{parts.flatMap((p, i) => (i ? [<wbr />, p] : [p]))}</>;
}

/**
 * One-time token: a read-only mono field (selects all on focus) with an attached Copy button. It is a
 * one-row textarea that grows, so a long token wraps instead of hiding under an ellipsis.
 */
export function TokenField(
  { id, value, label = "API token" }: {
    id: string;
    value: string;
    label?: string;
  },
) {
  return (
    <div class="token-field">
      <textarea
        id={id}
        rows={1}
        readonly
        aria-label={label}
        autocomplete="off"
        spellcheck={false}
        data-select-all
      >
        {value}
      </textarea>
      <CopyButton from={`#${id}`} label="Copy" withLabel class="secondary" />
    </div>
  );
}

/**
 * Trailing "…" menu for secondary row actions. Children are `.menu-item` links/buttons, forms holding
 * a `button.menu-item` (add `danger` for destructive items; `data-confirm` works), and `.menu-sep`.
 */
export function RowMenu(
  { label, children }: { label: string; children: Child },
) {
  return (
    <details class="menu-wrap row-menu">
      <summary class="btn ghost small icon" aria-label={label} title={label}>
        <Icon name="more" />
      </summary>
      <div class="menu">{children}</div>
    </details>
  );
}

/**
 * Client-side filter for a table toolbar (JS only, so it is not rendered as a dead input without JS).
 * `filter` selects the rows; give each row `data-filter-text` (key name and path). `empty` is shown
 * when nothing matches. "/" focuses it.
 */
export function SearchField(
  { filter, empty, label, placeholder = "Filter…", id }: {
    filter: string;
    empty?: string;
    label: string;
    placeholder?: string;
    id?: string;
  },
) {
  return (
    <div class="search-field js-only">
      <Icon name="search" />
      <input
        type="search"
        id={id}
        data-filter={filter}
        data-filter-empty={empty}
        aria-label={label}
        aria-keyshortcuts="/"
        placeholder={placeholder}
        autocomplete="off"
        spellcheck={false}
      />
      <kbd aria-hidden="true">/</kbd>
    </div>
  );
}

/** Previous / next foot for a long list. Put it inside `.table-wrap` after the table. */
export function Pager(
  { label, prev, next }: { label: Child; prev?: string; next?: string },
) {
  return (
    <nav class="pager" aria-label="Pagination">
      <span>{label}</span>
      <span class="pager-nav">
        {prev
          ? (
            <a class="btn secondary small" href={prev} rel="prev">
              <Icon name="chevron-left" />Previous
            </a>
          )
          : (
            <button type="button" class="secondary small" disabled>
              <Icon name="chevron-left" />Previous
            </button>
          )}
        {next
          ? (
            <a class="btn secondary small" href={next} rel="next">
              Next<Icon name="chevron-right" />
            </a>
          )
          : (
            <button type="button" class="secondary small" disabled>
              Next<Icon name="chevron-right" />
            </button>
          )}
      </span>
    </nav>
  );
}

const MONTHS = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");
const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"} ago`;

const DAYS = "Sun Mon Tue Wed Thu Fri Sat".split(" ");

/**
 * A UTC timestamp (`2026-10-15T21:02:33Z`) as `<time class="tnum">` with the exact time in `title`.
 * Under 7 days old it reads relative ("16 hours ago"), older ones read "Oct 8" (or "Oct 8, 2025" in
 * another year). `absolute` always shows `2026-10-15 21:02`; `clock` shows `21:02:33` and `day` shows
 * "Thu, Oct 15" (a day-grouped log: the day heads the group, rows show the clock). `empty` is shown
 * when `at` is missing (e.g. "Never" for an unused key).
 */
export function Time(
  { at, absolute, clock, day, empty = "—", now = new Date() }: {
    at?: string | null;
    absolute?: boolean;
    clock?: boolean;
    day?: boolean;
    empty?: string;
    now?: Date;
  },
) {
  if (!at) return <span class="muted">{empty}</span>;
  const d = new Date(at);
  if (isNaN(d.getTime())) return <span class="tnum">{at}</span>;
  const exact = d.toISOString().replace("T", " ").slice(0, 19) + " UTC";
  const s = Math.round((now.getTime() - d.getTime()) / 1000);
  const date = `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
  const dated = d.getUTCFullYear() === now.getUTCFullYear()
    ? date
    : `${date}, ${d.getUTCFullYear()}`;
  const label = absolute
    ? exact.slice(0, 16)
    : clock
    ? exact.slice(11, 19)
    : day
    ? `${DAYS[d.getUTCDay()]}, ${dated}`
    : s < 0 || s >= 7 * 86400
    ? dated
    : s < 60
    ? "just now"
    : s < 3600
    ? plural(Math.floor(s / 60), "minute")
    : s < 86400
    ? plural(Math.floor(s / 3600), "hour")
    : plural(Math.floor(s / 86400), "day");
  return <time class="tnum" datetime={at} title={day ? undefined : exact}>{label}</time>;
}

/**
 * The no-JS confirmation page: the same card as the dialog, as page content. Link a RowMenu's
 * destructive item to a GET route that renders this (`<a class="menu-item danger nojs-only">`), next
 * to the JS form (`<form class="js-only" data-confirm…>`). `children` are the hidden fields. The
 * action is red unless `tone="primary"` (a non-destructive confirm such as sign out).
 */
export function ConfirmPage(
  { title, body, warning, action, href, cancel, tone = "danger", children }: {
    title: string;
    body: Child;
    warning?: Child;
    action: string;
    href: string;
    cancel: string;
    tone?: "danger" | "primary";
    children?: Child;
  },
) {
  return (
    <div class="confirm-page">
      <form method="post" action={href} class="dialog static">
        <div class="dialog-body">
          <h1 class="dialog-title">{title}</h1>
          <p class="dialog-text">{body}</p>
          {warning && (
            <div class="flash err">
              <Icon name="alert" />
              <div class="flash-text">{warning}</div>
            </div>
          )}
          {children}
        </div>
        <div class="dialog-foot">
          <a class="btn secondary" href={cancel}>Cancel</a>
          <button type="submit" class={tone === "danger" ? "danger" : undefined}>{action}</button>
        </div>
      </form>
    </div>
  );
}

/** Filled by client.ts for any `form[data-confirm]`. Inert without JS. */
export function ConfirmDialog() {
  return (
    <dialog
      id="confirm-dialog"
      class="dialog"
      aria-labelledby="confirm-title"
      aria-describedby="confirm-text confirm-warning"
    >
      <form method="dialog">
        <div class="dialog-body">
          <h2 class="dialog-title" id="confirm-title"></h2>
          <p class="dialog-text" id="confirm-text"></p>
          <div class="flash err" id="confirm-warning" hidden>
            <Icon name="alert" />
            <div class="flash-text" data-warning-text></div>
          </div>
          <div class="field" data-typed hidden>
            <div class="typed-label">
              <label for="confirm-input">
                Type <code id="confirm-typed"></code> to confirm
              </label>
              <CopyButton
                from="#confirm-typed"
                label="Copy confirmation text"
              />
            </div>
            <input
              id="confirm-input"
              class="mono"
              autocomplete="off"
              autocapitalize="off"
              spellcheck={false}
            />
          </div>
        </div>
        <div class="dialog-foot">
          <button type="button" class="secondary" data-cancel>Cancel</button>
          <button type="submit" value="ok" class="danger" data-ok>
            Confirm
          </button>
        </div>
      </form>
    </dialog>
  );
}

export function BrandMark() {
  return (
    <svg class="brand-mark" viewBox="0 0 24 24" aria-hidden="true">
      <rect width="24" height="24" rx="6" fill="currentColor" />
      <g
        fill="none"
        stroke="var(--bg)"
        stroke-width="1.75"
        stroke-linecap="round"
      >
        <circle cx="12" cy="12" r="5.25" />
        <path d="M12 12V9" />
        <path d="M12 3.75v1.5M12 18.75v1.5M3.75 12h1.5M18.75 12h1.5" />
      </g>
    </svg>
  );
}

const ICONS = {
  copy:
    `<rect x="5.75" y="5.75" width="7.5" height="7.5" rx="1.5"/><path d="M10.25 5.75v-1.5a1.5 1.5 0 0 0-1.5-1.5h-4.5a1.5 1.5 0 0 0-1.5 1.5v4.5a1.5 1.5 0 0 0 1.5 1.5h1.5"/>`,
  check: `<path d="m3.5 8.5 3 3 6-7"/>`,
  eye:
    `<path d="M1.75 8S4 3.75 8 3.75 14.25 8 14.25 8 12 12.25 8 12.25 1.75 8 1.75 8Z"/><circle cx="8" cy="8" r="2"/>`,
  "eye-off":
    `<path d="M6.6 3.9A6.4 6.4 0 0 1 8 3.75C12 3.75 14.25 8 14.25 8a11 11 0 0 1-1.6 2.2M9.4 9.5a2 2 0 0 1-2.9-2.9M4.3 4.9C2.6 6.1 1.75 8 1.75 8S4 12.25 8 12.25a6 6 0 0 0 3.3-1M2.25 2.25l11.5 11.5"/>`,
  plus: `<path d="M8 3.25v9.5M3.25 8h9.5"/>`,
  trash:
    `<path d="M2.75 4.25h10.5M6.25 4.25v-1.5h3.5v1.5M4.25 4.25l.6 8.1a1 1 0 0 0 1 .9h4.3a1 1 0 0 0 1-.9l.6-8.1M6.75 7v3.5M9.25 7v3.5"/>`,
  pencil: `<path d="m10.25 3.25 2.5 2.5L6 12.5l-3.25.75.75-3.25Z"/>`,
  key:
    `<circle cx="5.5" cy="10.5" r="2.75"/><path d="m7.5 8.5 5.75-5.75M11 5l1.75 1.75M9.25 6.75 10.5 8"/>`,
  folder:
    `<path d="M1.75 4.25a1 1 0 0 1 1-1h3.2l1.5 1.5h5.8a1 1 0 0 1 1 1v6.5a1 1 0 0 1-1 1H2.75a1 1 0 0 1-1-1Z"/>`,
  layers:
    `<path d="M8 2.25 14.25 5.5 8 8.75 1.75 5.5Z"/><path d="m1.75 8.25 6.25 3.25 6.25-3.25M1.75 10.75 8 14l6.25-3.25"/>`,
  lock:
    `<rect x="3.25" y="7.25" width="9.5" height="6.5" rx="1.5"/><path d="M5.25 7.25V5a2.75 2.75 0 0 1 5.5 0v2.25"/>`,
  shield: `<path d="M8 1.75 13.25 3.5v4c0 3.25-2.25 5.5-5.25 6.75C5 13 2.75 10.75 2.75 7.5v-4Z"/>`,
  terminal:
    `<rect x="1.75" y="2.75" width="12.5" height="10.5" rx="1.5"/><path d="M4.75 6.25 6.75 8l-2 1.75M8.5 10h2.75"/>`,
  book:
    `<path d="M2.25 3.25h3.5A2.25 2.25 0 0 1 8 5.5v8a1.5 1.5 0 0 0-1.5-1.5H2.25ZM13.75 3.25h-3.5A2.25 2.25 0 0 0 8 5.5v8a1.5 1.5 0 0 1 1.5-1.5h4.25Z"/>`,
  clock: `<circle cx="8" cy="8" r="6.25"/><path d="M8 4.75V8l2.25 1.5"/>`,
  search: `<circle cx="7" cy="7" r="4.25"/><path d="m10.25 10.25 3.5 3.5"/>`,
  upload: `<path d="M8 10.25v-7.5M5 5.5l3-3 3 3M2.75 10.25v2a1 1 0 0 0 1 1h8.5a1 1 0 0 0 1-1v-2"/>`,
  download:
    `<path d="M8 2.75v7.5M5 7.25l3 3 3-3M2.75 10.25v2a1 1 0 0 0 1 1h8.5a1 1 0 0 0 1-1v-2"/>`,
  external:
    `<path d="M6.5 3.25H3.75a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V9.5M9.25 2.75h4v4M13.25 2.75 7.5 8.5"/>`,
  logout:
    `<path d="M6.25 13.25h-2.5a1 1 0 0 1-1-1v-8.5a1 1 0 0 1 1-1h2.5M10.5 11l3-3-3-3M13.25 8H6.5"/>`,
  x: `<path d="m4 4 8 8M12 4l-8 8"/>`,
  more:
    `<circle cx="3.5" cy="8" r=".75"/><circle cx="8" cy="8" r=".75"/><circle cx="12.5" cy="8" r=".75"/>`,
  "chevron-down": `<path d="M4.5 6.25 8 9.75l3.5-3.5"/>`,
  "chevron-right": `<path d="M6.25 4.5 9.75 8l-3.5 3.5"/>`,
  "chevron-left": `<path d="M9.75 4.5 6.25 8l3.5 3.5"/>`,
  "check-circle": `<circle cx="8" cy="8" r="6.25"/><path d="m5.5 8.25 1.75 1.75 3.25-3.75"/>`,
  alert: `<circle cx="8" cy="8" r="6.25"/><path d="M8 4.75v3.75M8 11h.01"/>`,
  info: `<circle cx="8" cy="8" r="6.25"/><path d="M8 7.25v4M8 5h.01"/>`,
  warning:
    `<path d="M7.1 2.6a1 1 0 0 1 1.8 0l5.2 9.6a1 1 0 0 1-.9 1.5H2.8a1 1 0 0 1-.9-1.5Z"/><path d="M8 6.25v3M8 11.5h.01"/>`,
} as const;

export type IconName = keyof typeof ICONS;

/** An icon as a CSS mask image (`mask:${iconMask("copy")} center/16px no-repeat`). */
export const iconMask = (name: IconName) =>
  `url("data:image/svg+xml,${
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${
        ICONS[name]
      }</svg>`,
    )
  }")`;
export const ICON_NAMES = Object.keys(ICONS) as IconName[];

/**
 * 16px, 1.5px-stroke inline icon. Decorative unless `label` is given. Strokes don't scale, so the
 * two other allowed sizes (14 in the avatar, 20 in empty states) keep a 1.5px line.
 */
export function Icon(
  { name, size = 16, label, class: cls }: {
    name: IconName;
    size?: number;
    label?: string;
    class?: string;
  },
) {
  return (
    <svg
      class={cls ? `ic ${cls}` : "ic"}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden={label ? undefined : "true"}
      role={label ? "img" : undefined}
      aria-label={label}
    >
      {html(ICONS[name])}
    </svg>
  );
}
