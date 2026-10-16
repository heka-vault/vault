import type { Context } from "@hono/hono";
import { normalizePath, type Principal } from "../vault.ts";
import { FlashMessage } from "./layout.tsx";

export const COOKIE = "hv_token";
export type Env = { Variables: { who: Principal } };

export function projectUrl(slug: string, env: string, path: string): string {
  return `/p/${slug}?env=${encodeURIComponent(env)}&path=${
    encodeURIComponent(normalizePath(path))
  }`;
}

/**
 * `to` as a same-origin path and query, or undefined, so a query or form field can't send the user
 * off-site (`//host`, `/\\host`, and control characters all resolve to another origin and fail).
 */
export function safePath(to?: string): string | undefined {
  if (!to?.startsWith("/")) return undefined;
  const url = new URL(to, "http://x");
  return url.origin === "http://x" ? url.pathname + url.search : undefined;
}

/** Path and query of the referring page, or `fallback`. */
export function referer(c: Context, fallback: string): string {
  const ref = c.req.header("referer");
  if (!ref) return fallback;
  const url = new URL(ref);
  return url.pathname + url.search;
}

/** Redirect with a flash message in the query string (messages never contain secret values). */
export function back(
  c: Context,
  to: string,
  flash: { msg?: string; err?: string },
) {
  const url = new URL(to, "http://x");
  url.searchParams.delete("msg");
  url.searchParams.delete("err");
  if (flash.msg) url.searchParams.set("msg", flash.msg);
  if (flash.err) url.searchParams.set("err", flash.err);
  return c.redirect(url.pathname + url.search, 303);
}

/** Sentence case: vault errors start in lowercase ("invalid secret key: 1BAD"). */
export const sentence = (s?: string) => s && s.charAt(0).toUpperCase() + s.slice(1);

/** "1 secret", "3 secrets". */
export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** "Invalid secret key: 1BAD" sets the trailing identifier in mono; other text stays plain. */
function FlashText({ text }: { text: string }) {
  const m = /^([A-Za-z' ]+): (\S+)$/.exec(text);
  return m
    ? (
      <>
        {m[1]}: <code>{m[2]}</code>
      </>
    )
    : <>{text}</>;
}

/** The `?msg=` / `?err=` flash set by `back()`, in sentence case. */
export function Flash({ c }: { c: Context }) {
  const msg = sentence(c.req.query("msg"));
  const err = sentence(c.req.query("err"));
  return (
    <>
      {msg && (
        <FlashMessage tone="ok">
          <FlashText text={msg} />
        </FlashMessage>
      )}
      {err && (
        <FlashMessage tone="err">
          <FlashText text={err} />
        </FlashMessage>
      )}
    </>
  );
}

export function Hidden({ env, path }: { env: string; path?: string }) {
  return (
    <>
      <input type="hidden" name="env" value={env} />
      {path !== undefined && <input type="hidden" name="path" value={path} />}
    </>
  );
}
