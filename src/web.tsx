import { Hono } from "@hono/hono";
import { getCookie } from "@hono/hono/cookie";
import { type Vault, VaultError } from "./vault.ts";
import { accessRoutes, errorPage } from "./web/access.tsx";
import { auditRoutes } from "./web/audit.tsx";
import { keyRoutes } from "./web/keys.tsx";
import { projectRoutes } from "./web/projects.tsx";
import { secretRoutes } from "./web/secrets.tsx";
import { settingsRoutes } from "./web/settings.tsx";
import { back, COOKIE, type Env, referer } from "./web/shared.tsx";

/** Server-rendered admin UI. Each feature registers its routes from src/web/. */
export function webRoutes(vault: Vault): Hono<Env> {
  const web = new Hono<Env>();

  accessRoutes(web, vault);

  web.use("*", async (c, next) => {
    const who = vault.authenticate(getCookie(c, COOKIE));
    if (!who) {
      const { pathname, search } = new URL(c.req.url);
      const keep = c.req.method === "GET" && pathname !== "/";
      return c.redirect(keep ? `/login?next=${encodeURIComponent(pathname + search)}` : "/login");
    }
    c.set("who", who);
    await next();
  });

  // Render VaultErrors from form posts as a flash on the page they came from.
  web.onError((err, c) => {
    if (err instanceof VaultError && c.req.method === "GET") {
      return errorPage(c, err, c.get("who"));
    }
    if (err instanceof VaultError) {
      return back(c, referer(c, "/"), { err: err.message });
    }
    console.error(err);
    return c.text("internal error", 500);
  });

  projectRoutes(web, vault);
  secretRoutes(web, vault);
  settingsRoutes(web, vault);
  keyRoutes(web, vault);
  auditRoutes(web, vault);

  // Registered last; a mounted app's notFound handler never runs, so catch unknown pages here.
  web.get("*", () => {
    throw new VaultError(404, "page not found");
  });

  return web;
}
