import type { Context, Hono } from "@hono/hono";
import type { Child } from "@hono/hono/jsx";
import { deleteCookie, getCookie, setCookie } from "@hono/hono/cookie";
import { raw as html } from "@hono/hono/html";
import type { Principal, Vault, VaultError } from "../vault.ts";
import {
  ConfirmPage,
  CopyButton,
  EmptyState,
  Field,
  FlashMessage,
  Icon,
  iconMask,
  type IconName,
  Layout,
  PageHeader,
} from "./layout.tsx";
import { back, COOKIE, type Env, referer, safePath } from "./shared.tsx";

export const css = `
.p-login .login-help{margin:var(--s-6) 0 0;color:var(--fg-muted);font-size:var(--text-sm);line-height:var(--lh-sm);text-align:center;text-wrap:balance}
.p-login .login-help code{white-space:nowrap}
.p-login input[aria-invalid=true]:focus-visible{outline-color:var(--danger)}
.p-error .empty-actions form{display:contents}
`;

/** Pinned: the DOCS_CSS overrides key on its class names, and the SRI hashes must change with it. */
const SWAGGER = "https://unpkg.com/swagger-ui-dist@5.33.3";
const SWAGGER_CSS_SRI = "sha384-Ov4/wv3j2bmct8cDc5X4ngJZohVPzEmc6uDPH8WeljUxO5vtoykvMEfbu9Vh6RaW";
const SWAGGER_JS_SRI = "sha384-h00llMzD1afyNow1pDmnZKlHsUZgp9KE9HXLFXF2CvbwsBY0+WBO4f75SfGwvM4K";

/** Sign in, sign out, and the API docs. These routes run before authentication. */
export function accessRoutes(web: Hono<Env>, vault: Vault): void {
  web.get("/login", (c) => {
    const next = safePath(c.req.query("next")) ?? "/";
    if (vault.authenticate(getCookie(c, COOKIE))) return c.redirect(next);
    return c.html(<LoginPage msg={c.req.query("msg")} next={next} />);
  });

  web.post("/login", async (c) => {
    const { token, next } = await c.req.parseBody<{ token: string; next: string }>();
    const t = String(token ?? "").trim();
    if (!vault.authenticate(t)) {
      return c.html(
        <LoginPage next={safePath(next) ?? "/"} error="This token is invalid or revoked" />,
        401,
      );
    }
    setCookie(c, COOKIE, t, {
      httpOnly: true,
      sameSite: "Strict",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    return c.redirect(safePath(next) ?? "/");
  });

  web.get("/logout", (c) => {
    const who = vault.authenticate(getCookie(c, COOKIE));
    if (!who) return c.redirect("/login");
    return c.html(
      <Layout title="Sign out" who={who} css={css} page="p-logout" heading={false}>
        <ConfirmPage
          title="Sign out"
          body="You'll need your API token to sign in again."
          action="Sign out"
          tone="primary"
          href="/logout"
          cancel={referer(c, "/")}
        />
      </Layout>,
    );
  });

  web.post("/logout", async (c) => {
    const next = safePath(String((await c.req.parseBody()).next ?? "")) ?? "/";
    deleteCookie(c, COOKIE, { path: "/" });
    const to = next === "/" ? "/login" : `/login?next=${encodeURIComponent(next)}`;
    return back(c, to, { msg: "Signed out" });
  });

  web.get("/docs", (c) =>
    c.html(
      <DocsPage
        who={vault.authenticate(getCookie(c, COOKIE))}
        base={`${new URL(c.req.url).origin}/api/v1`}
      />,
    ));
}

/**
 * Only the app's own sign-out messages are shown, in fixed words: nothing from the URL is echoed, so
 * a link can't put its own text above the token field. Revoking your own key lands here (keys.tsx).
 */
function SignedOut({ msg = "" }: { msg?: string }) {
  if (msg === "Signed out") return <FlashMessage tone="ok">Signed out</FlashMessage>;
  if (!msg.startsWith("Key revoked: ")) return null;
  return (
    <FlashMessage tone="ok">
      You revoked the key you were signed in with. Sign in with another key.
    </FlashMessage>
  );
}

function LoginPage({ msg, next, error }: { msg?: string; next: string; error?: string }) {
  return (
    <Layout title="Sign in" css={css} page="p-login" heading={false}>
      <PageHeader title="Sign in to Heka Vault" />
      <SignedOut msg={msg} />
      <form method="post" action="/login">
        <Field
          id="token"
          label="API token"
          hint={
            <>
              Paste an <code>hvk_</code> token. You stay signed in on this browser for 30 days.
            </>
          }
          error={error}
          input={{
            name: "token",
            type: "password",
            class: "mono",
            required: true,
            autofocus: true,
            autocomplete: "current-password",
            spellcheck: false,
            placeholder: "hvk_…",
          }}
        />
        {next !== "/" && <input type="hidden" name="next" value={next} />}
        <button type="submit" class="block large">Sign in</button>
      </form>
      <p class="login-help">
        No token? Ask your vault admin, or run <code>create-admin-key</code> on the vault host.
      </p>
    </Layout>
  );
}

/** Where a page needs admin rights, what it is for ("Sign in with an admin key to …"). */
const ADMIN_PURPOSE: [RegExp, string][] = [
  [/^\/keys/, "manage API keys"],
  [/^\/audit/, "see the audit log"],
  [/^\/p\/[^/]+\/settings/, "change project settings"],
];

const STATUS: Record<number, { title: string; icon: IconName }> = {
  400: { title: "Bad request", icon: "alert" },
  403: { title: "No access", icon: "lock" },
  404: { title: "Not found", icon: "search" },
};

/** decodeURIComponent that leaves a malformed escape (`/p/%zz`) as it is instead of throwing. */
function decode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/**
 * Full-page error for GET requests that fail with a VaultError: the status code as an eyebrow, a
 * human h1, one sentence, the way back, and the vault message verbatim as the muted detail.
 */
export function errorPage(c: Context, err: VaultError, who: Principal) {
  const path = c.req.path;
  const raw = /^\/p\/([^/]+)/.exec(path)?.[1];
  const slug = raw && decode(raw);
  const noun = /^(\w+) not found/.exec(err.message)?.[1] ?? "page";
  const switchKey = (
    <form method="post" action="/logout">
      <input type="hidden" name="next" value={path + new URL(c.req.url).search} />
      <button type="submit" class="ghost">Sign in with another key</button>
    </form>
  );
  let title = "Something went wrong";
  let text: Child = "Go back and try again.";
  let extra: Child;
  const env = /^environment not found: (\S+)$/.exec(err.message)?.[1];
  if (err.status === 404) {
    title = `We can't find that ${noun}`;
    text = noun === "project"
      ? (
        <>
          There is no project called <code>{slug}</code>
          {who.project ? ", or this key can't see it." : "."}
        </>
      )
      : env && slug
      ? (
        <>
          <code>{slug}</code> has no environment called <code>{env}</code>.
        </>
      )
      : noun === "page"
      ? "Check the address for typos."
      : "It may have been deleted, or the link is out of date.";
  } else if (err.status === 403 && err.message === "admin key required") {
    const purpose = ADMIN_PURPOSE.find(([re]) => re.test(path))?.[1] ?? "open it";
    title = "This page is for admin keys";
    text = who.project
      ? (
        <>
          This key can only use <code>{who.project}</code>. Sign in with an admin key to {purpose}.
        </>
      )
      : `Sign in with an admin key to ${purpose}.`;
    extra = switchKey;
  } else if (err.status === 403) {
    title = "This key can't make changes";
    text =
      "It can read this project but not edit it. Sign in with a readwrite key to make changes.";
    extra = switchKey;
  } else if (err.status === 400) {
    title = "That address isn't valid";
    text = "Part of the link is malformed.";
  }
  // A missing project or an unknown page under /p/<slug> can't go back to that project.
  const projectGone = err.status === 404 && (noun === "project" || noun === "page");
  const home = who.project
    ? { href: `/p/${who.project}`, label: `Back to ${who.project}` }
    : noun === "key"
    ? { href: "/keys", label: "Back to API keys" }
    : raw && !projectGone
    ? { href: `/p/${raw}`, label: `Back to ${slug}` }
    : { href: "/", label: "Back to projects" };
  const s = STATUS[err.status] ?? { title: "Error", icon: "alert" };
  return c.html(
    <Layout title={s.title} who={who} css={css} page="p-error" heading={false}>
      <EmptyState
        page
        icon={s.icon}
        eyebrow={String(err.status)}
        title={title}
        detail={err.message}
        actions={
          <>
            <a class="btn secondary" href={home.href}>
              <Icon name="chevron-left" />
              {home.label}
            </a>
            {extra}
          </>
        }
      >
        {text}
      </EmptyState>
    </Layout>,
    err.status,
  );
}

const COPY = iconMask("copy");
const CHECK = iconMask("check-circle");

/**
 * Swagger UI (the one external asset) under the app's own top bar. The shared CSS goes in a cascade
 * layer whose element styles are reverted inside #ui, so Swagger's unlayered CSS renders as designed
 * and only the overrides below touch it: our type scale, colours, buttons, inputs and dialog.
 */
const DOCS_CSS = `
html.dark-mode{background:var(--bg)}
.p-docs:has(.swagger-ui) .docs-loading{display:none}
.p-docs .docs-base{display:flex;flex-wrap:wrap;align-items:center;gap:var(--s-2);margin:var(--s-2) 0 0}
.p-docs .docs-base code{overflow-wrap:anywhere}
#ui .swagger-ui{background:none;color:var(--fg)}
#ui *{font-family:var(--font-sans)}
#ui :is(code,pre,textarea,.parameters-col_name :is(.parameter__name,.parameter__type,.parameter__in),.opblock-summary-method,.opblock-summary-path),#ui :is(code,pre,.opblock-summary-path) *{font-family:var(--font-mono)}
#ui :is(.information-container,.schemes-server-container,.opblock-tag,.opblock-summary :is(.authorization__btn,.copy-to-clipboard),.response-col_links,.download-contents,.close-modal,.auth-container h4,.parameter__name.required>span){display:none}
#ui :is(i,em){font-style:normal}
#ui :is(b,strong){font-weight:600}
#ui .wrapper{max-width:none;padding:0}
#ui .scheme-container{margin:0 0 var(--s-4);padding:0;background:none;box-shadow:none}
#ui .opblock{margin:0;border:1px solid var(--border);border-width:0 1px 1px;border-radius:0;background:var(--surface);box-shadow:none}
#ui .operation-tag-content>span:first-child>.opblock{border-top-width:1px;border-top-left-radius:var(--r-lg);border-top-right-radius:var(--r-lg)}
#ui .operation-tag-content>span:last-child>.opblock{border-bottom-left-radius:var(--r-lg);border-bottom-right-radius:var(--r-lg)}
#ui .opblock-summary{padding:var(--s-1_5) var(--s-2);border-color:var(--border)}
#ui .opblock-summary-method{min-width:var(--s-16);padding:var(--s-0_5) var(--s-1_5);border-radius:var(--r-sm);background:var(--bg-muted);color:var(--fg);font-size:var(--text-xs);line-height:var(--lh-xs);font-weight:600;text-shadow:none}
#ui .opblock-delete .opblock-summary-method{background:var(--danger-subtle);color:var(--danger-fg)}
#ui .opblock-summary-path{color:var(--fg);font-size:var(--text-sm);font-weight:500}
#ui .opblock-summary-description{color:var(--fg-muted);font-size:var(--text-sm)}
#ui svg.arrow{width:16px;height:16px;color:var(--fg-muted)}
#ui .opblock-section-header{min-height:0;padding:var(--s-2) var(--s-5);border-color:var(--border);background:var(--bg-subtle);box-shadow:none}
#ui .opblock-section-header :is(h4,label){color:var(--fg);font-size:var(--text-base);line-height:var(--lh-base);font-weight:600}
#ui .tab-item.active h4 span::after{background:var(--fg)}
#ui :is(p,td,li,.renderedMarkdown,.opblock-description-wrapper){color:var(--fg);font-size:var(--text-base);line-height:var(--lh-base)}
#ui .responses-inner :is(h4,h5){margin:var(--s-4) 0 var(--s-2);color:var(--fg);font-size:var(--text-sm);line-height:var(--lh-sm);font-weight:500}
#ui .response-col_status{color:var(--fg);font-size:var(--text-base);font-variant-numeric:tabular-nums}
#ui .col_header{border-color:var(--border);color:var(--fg-muted);font-size:var(--text-xs);line-height:var(--lh-xs);font-weight:500}
#ui small{display:block;margin:0 0 var(--s-1_5);color:var(--fg-muted);font-size:var(--text-xs);line-height:var(--lh-xs)}
#ui .response-control-media-type__accept-message{color:var(--fg-muted);font-size:var(--text-xs)}
#ui .tab li{color:var(--fg-muted);font-size:var(--text-sm);font-weight:500}
#ui .tab li.active{color:var(--fg)}
#ui .tab li button{color:inherit}
#ui .parameters-col_name .parameter__name{color:var(--fg);font-size:var(--text-sm);font-weight:500}
#ui .parameters-col_name :is(.parameter__type,.parameter__in){color:var(--fg-muted);font-size:var(--text-xs);font-style:normal;font-weight:400}
#ui .parameter__name.required::after{position:static;padding:0 0 0 var(--s-1_5);color:var(--fg-muted);font-family:var(--font-sans);font-size:var(--text-xs);font-weight:400}
#ui .headerline{display:block;white-space:nowrap}
#ui pre{border-radius:var(--r);background:var(--bg-subtle)!important;color:var(--fg);font-size:var(--text-sm);font-weight:400;white-space:pre;overflow-x:auto}
#ui :is(.markdown,.renderedMarkdown) code{padding:0 var(--s-1);border-radius:var(--r-sm);background:var(--bg-muted);color:var(--fg);font-size:var(--text-sm);font-weight:400}
#ui .live-responses-table{table-layout:fixed;width:100%}
#ui .live-responses-table .response-col_status{width:var(--s-16)}
#ui .highlight-code{max-width:100%}
#ui :is(.curl-command,.highlight-code){position:relative}
#ui .curl-command{margin-top:var(--s-4)}
#ui .curl-command h4{margin-top:0}
#ui .copy-to-clipboard{inset:auto;top:calc((var(--lh-sm) - var(--h-sm)) / 2);right:0;width:var(--h-sm);height:var(--h-sm);border-radius:var(--r);background:none}
#ui .highlight-code>.copy-to-clipboard{top:calc(0px - var(--s-2) - (var(--lh-sm) + var(--h-sm)) / 2)}
#ui .copy-to-clipboard:hover{background:var(--bg-hover)}
#ui .copy-to-clipboard button{width:100%;height:100%;border-radius:var(--r);background:var(--fg-muted);mask:${COPY} center/16px no-repeat}
#ui .btn{display:inline-flex;align-items:center;justify-content:center;gap:var(--s-1_5);height:var(--h);padding:0 var(--s-3);border:1px solid var(--border-strong);border-radius:var(--r);background:var(--surface);color:var(--fg);box-shadow:var(--shadow-xs);font-size:var(--text-base);font-weight:500;transition:none}
#ui .btn:hover{background:var(--bg-hover)}
#ui :is(.btn.execute,.auth-btn-wrapper .authorize){border-color:transparent;background:var(--inverse);color:var(--fg-on-inverse)}
#ui :is(.btn.execute,.auth-btn-wrapper .authorize):hover{background:var(--inverse-hover)}
#ui :is(.btn-group,.execute-wrapper){justify-content:flex-start;gap:var(--s-2);padding:var(--s-5);text-align:left}
#ui :is(.btn-group,.execute-wrapper) .btn{flex:none;width:auto;border-radius:var(--r)}
#ui .btn svg{width:16px;height:16px;color:var(--fg-muted)}
#ui .auth-wrapper .authorize :is(span,svg){order:1;float:none;margin:0;padding:0}
#ui .auth-wrapper .authorize svg{order:0}
#ui :is(input:not([type=checkbox]),textarea,select){border:1px solid var(--border-input);border-radius:var(--r);background-color:var(--surface);color:var(--fg);box-shadow:none;font-size:var(--text-base);font-weight:400}
#ui textarea{font-size:var(--text-sm)}
#ui select{height:var(--h);padding:0 var(--s-8) 0 var(--s-3);background:var(--surface) var(--chevron) no-repeat right var(--s-2) center/16px}
#ui :focus-visible{outline:2px solid var(--focus);outline-offset:2px}
#ui :focus:not(:focus-visible){outline:none}
#ui :is(input,textarea,select):focus-visible{outline-offset:-1px}
#ui .dialog-ux .backdrop-ux{background:var(--backdrop)}
#ui .dialog-ux .modal-ux{width:min(var(--w-narrow),calc(100vw - var(--s-8)));min-width:0;overflow:hidden;border:1px solid var(--border);border-radius:var(--r-xl);background:var(--surface-raised);color:var(--fg);box-shadow:var(--shadow-lg)}
#ui .dialog-ux .modal-ux-header{padding:var(--s-5) var(--s-5) 0;border:0}
#ui .dialog-ux .modal-ux-header h3{padding:0;color:var(--fg);font-size:var(--text-md);line-height:var(--lh-md);font-weight:600}
#ui .dialog-ux .modal-ux-content{padding:0}
#ui .dialog-ux .auth-container{margin:0;padding:0;border:0}
#ui .auth-container form>div:first-child{padding:var(--s-4) var(--s-5)}
#ui .dialog-ux .auth-container :is(label,p){display:block;margin:0 0 var(--s-1_5);color:var(--fg);font-size:var(--text-sm);line-height:var(--lh-sm);font-weight:500}
#ui .dialog-ux .auth-container h6{display:flex;align-items:center;gap:var(--s-1_5);margin:0;color:var(--fg);font-size:var(--text-base);line-height:var(--lh-base);font-weight:500}
#ui .auth-container h6::before{content:"";width:16px;height:16px;background:var(--success);mask:${CHECK} center/16px no-repeat}
#ui .auth-container .wrapper:has(>code){display:none}
#ui .auth-container input{width:100%;min-width:0;max-width:none;height:var(--h);padding:0 var(--s-3);font-family:var(--font-mono);font-size:var(--text-sm)}
#ui .auth-btn-wrapper{justify-content:flex-end;gap:var(--s-2);padding:var(--s-3) var(--s-5);border-top:1px solid var(--border);background:var(--bg-subtle)}
#ui .auth-btn-wrapper .btn-done{order:-1;margin:0}
@media (max-width:480px){#ui .auth-btn-wrapper .btn{flex:1}}
`;

/**
 * Swagger's dark mode follows the OS. Its Authorize modal becomes a labelled dialog in our words: a
 * masked "API token" field, then one "Token applied" line and "Remove token" (it only forgets the
 * token Swagger holds; it doesn't sign you out). Swagger's aria-labels go, so each button's name is
 * its visible text. Tab stays inside the dialog and focus returns to the Authorize button when it
 * closes (Swagger drops it on <body>). The wrapper is observed only while the dialog is open.
 */
const DOCS_JS = `
{
  const dark = matchMedia("(prefers-color-scheme: dark)");
  const sync = () => document.documentElement.classList.toggle("dark-mode", dark.matches);
  sync();
  dark.addEventListener("change", sync);
}
{
  const dialog = () => document.querySelector("#ui .modal-ux");
  const trap = (e) => {
    const d = dialog();
    if (e.key !== "Tab" || !d) return;
    const items = [...d.querySelectorAll("button, input, a[href]")]
      .filter((el) => el.offsetParent && !el.disabled);
    const [first, last] = [items[0], items.at(-1)];
    const at = document.activeElement;
    if (!d.contains(at) || at === (e.shiftKey ? first : last)) {
      e.preventDefault();
      (e.shiftKey ? last : first).focus();
    }
  };
  const say = (el, text) => {
    if (el && el.textContent !== text) el.textContent = text;
  };
  const dress = (d) => {
    if (!d.hasAttribute("role")) {
      const title = d.querySelector(".modal-ux-header h3");
      title.id = "auth-title";
      d.setAttribute("role", "dialog");
      d.setAttribute("aria-modal", "true");
      d.setAttribute("aria-labelledby", title.id);
    }
    say(d.querySelector(".modal-ux-header h3"), "Authorize");
    d.querySelectorAll("label").forEach((label) => say(label, "API token"));
    say(d.querySelector("h6"), "Token applied");
    say(d.querySelector(".auth-btn-wrapper button:not(.authorize, .btn-done)"), "Remove token");
    d.querySelectorAll("[aria-label]").forEach((el) => el.removeAttribute("aria-label"));
    for (const input of d.querySelectorAll("input:not([type=password])")) {
      Object.assign(input, {
        type: "password",
        placeholder: "hvk_…",
        autocomplete: "off",
        spellcheck: false,
      });
    }
    if (!d.contains(document.activeElement)) d.querySelector("input, button")?.focus();
  };
  addEventListener("click", (e) => {
    const wrap = e.target.closest?.(".auth-wrapper > .authorize")?.parentElement;
    if (!wrap || dialog()) return;
    let seen = false;
    const watch = new MutationObserver(() => {
      const d = wrap.querySelector(".modal-ux");
      if (d) {
        seen = true;
        dress(d);
      } else if (seen) {
        watch.disconnect();
        removeEventListener("keydown", trap);
        wrap.querySelector(":scope > .authorize")?.focus();
      }
    });
    watch.observe(wrap, { childList: true, subtree: true });
    addEventListener("keydown", trap);
  }, true);
}
`;

function DocsPage({ who, base }: { who: Principal | null; base: string }) {
  return (
    <Layout
      title="API docs"
      who={who ?? undefined}
      css={DOCS_CSS}
      active="docs"
      page="p-docs"
      heading={false}
      next={who ? undefined : "/docs"}
      layer="app"
      head={
        <>
          <style>{html("@layer app{#ui,#ui *{all:revert-layer}}")}</style>
          <link
            rel="stylesheet"
            href={`${SWAGGER}/swagger-ui.css`}
            integrity={SWAGGER_CSS_SRI}
            crossorigin="anonymous"
          />
          <script>{html(DOCS_JS)}</script>
        </>
      }
    >
      <PageHeader
        title="API docs"
        description={
          <>
            Send <code>Authorization: Bearer hvk_…</code>{" "}
            with every request. Admin keys can do everything; project keys are <code>read</code> or
            {" "}
            <code>readwrite</code> on one project. The spec is at{" "}
            <a href="/api/v1/openapi.json">
              <code>/api/v1/openapi.json</code>
            </a>.
            <span class="docs-base">
              Base URL <code>{base}</code>
              <CopyButton text={base} withLabel class="ghost small js-only" />
            </span>
          </>
        }
      />
      <p class="docs-loading muted">
        The interactive reference loads from{" "}
        <code>unpkg.com</code>. If it doesn't appear, open the spec above.
      </p>
      <div id="ui"></div>
      <script
        src={`${SWAGGER}/swagger-ui-bundle.js`}
        integrity={SWAGGER_JS_SRI}
        crossorigin="anonymous"
      >
      </script>
      <script>
        {html(
          `self.SwaggerUIBundle?.({ url: "/api/v1/openapi.json", dom_id: "#ui", defaultModelsExpandDepth: -1, syntaxHighlight: false, onComplete: () => document.querySelector("#ui main")?.setAttribute("role", "none") });`,
        )}
      </script>
    </Layout>
  );
}
