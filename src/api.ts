import { Hono } from "@hono/hono";
import type { Context } from "@hono/hono";
import { formatDotenv, parseDotenv } from "./dotenv.ts";
import { openapi } from "./openapi.ts";
import { type Principal, type Role, type Vault, VaultError } from "./vault.ts";

type Env = { Variables: { who: Principal } };

export function apiRoutes(vault: Vault): Hono<Env> {
  const api = new Hono<Env>();

  api.onError((err, c) => {
    if (err instanceof VaultError) return c.json({ error: err.message }, err.status);
    if (err instanceof SyntaxError) return c.json({ error: "invalid JSON body" }, 400);
    console.error(err);
    return c.json({ error: "internal error" }, 500);
  });

  api.get("/health", (c) => c.json({ ok: true }));
  api.get("/openapi.json", (c) => c.json(openapi(new URL(c.req.url).origin)));

  api.use("*", async (c, next) => {
    const header = c.req.header("authorization") ?? "";
    const token = header.match(/^Bearer\s+(\S+)$/i)?.[1];
    const who = vault.authenticate(token);
    if (!who) return c.json({ error: "missing or invalid API token" }, 401);
    c.set("who", who);
    await next();
  });

  api.get("/whoami", (c) => c.json(c.get("who")));

  // Projects
  api.get("/projects", (c) => c.json({ projects: vault.listProjects(c.get("who")) }));
  api.post("/projects", async (c) => {
    const body = await c.req.json<{ slug: string; name?: string; environments?: string[] }>();
    return c.json(vault.createProject(c.get("who"), body), 201);
  });
  api.get(
    "/projects/:project",
    (c) => c.json(vault.getProject(c.get("who"), c.req.param("project"))),
  );
  api.delete("/projects/:project", (c) => {
    vault.deleteProject(c.get("who"), c.req.param("project"));
    return c.body(null, 204);
  });
  api.post("/projects/:project/environments", async (c) => {
    const { slug } = await c.req.json<{ slug: string }>();
    vault.addEnvironment(c.get("who"), c.req.param("project"), slug);
    return c.json(vault.getProject(c.get("who"), c.req.param("project")), 201);
  });
  api.delete("/projects/:project/environments/:env", (c) => {
    vault.deleteEnvironment(c.get("who"), c.req.param("project"), c.req.param("env"));
    return c.body(null, 204);
  });

  // Secrets. env defaults to "dev" and path to "/".
  api.get("/projects/:project/paths", (c) => {
    const { project, env } = loc(c);
    return c.json({ paths: vault.listPaths(c.get("who"), project, env) });
  });
  api.get("/projects/:project/secrets", (c) => {
    const { project, env, path } = loc(c);
    const recursive = ["1", "true"].includes(c.req.query("recursive") ?? "");
    const format = c.req.query("format") ?? "json";
    if (format === "dotenv" && recursive) {
      throw new VaultError(400, "format=dotenv cannot be combined with recursive");
    }
    const secrets = vault.listSecrets(c.get("who"), project, env, path, { recursive });
    if (format === "dotenv") {
      return c.text(formatDotenv(secrets), 200, { "cache-control": "no-store" });
    }
    if (format !== "json") throw new VaultError(400, "format must be json or dotenv");
    return c.json({ project, env, path, secrets }, 200, { "cache-control": "no-store" });
  });
  api.put("/projects/:project/secrets", async (c) => {
    const { project, env, path } = loc(c);
    const replace = ["1", "true"].includes(c.req.query("replace") ?? "");
    const type = c.req.header("content-type") ?? "";
    let values: Record<string, string>;
    if (type.startsWith("application/json")) {
      const body = await c.req.json<{ secrets: Record<string, string> }>();
      if (!body?.secrets || typeof body.secrets !== "object") {
        throw new VaultError(400, 'body must be {"secrets": {"KEY": "value"}}');
      }
      values = body.secrets;
    } else {
      try {
        values = parseDotenv(await c.req.text());
      } catch (e) {
        throw new VaultError(400, (e as Error).message);
      }
    }
    return c.json(vault.setSecrets(c.get("who"), project, env, path, values, { replace }));
  });
  api.get("/projects/:project/secrets/:key", (c) => {
    const { project, env, path } = loc(c);
    const secret = vault.getSecret(c.get("who"), project, env, path, c.req.param("key"));
    if (c.req.query("format") === "raw") {
      return c.text(secret.value, 200, { "cache-control": "no-store" });
    }
    return c.json(secret, 200, { "cache-control": "no-store" });
  });
  api.put("/projects/:project/secrets/:key", async (c) => {
    const { project, env, path } = loc(c);
    const { value } = await c.req.json<{ value: string }>();
    const result = vault.setSecret(c.get("who"), project, env, path, c.req.param("key"), value);
    return c.json({ result }, result === "created" ? 201 : 200);
  });
  api.delete("/projects/:project/secrets/:key", (c) => {
    const { project, env, path } = loc(c);
    vault.deleteSecret(c.get("who"), project, env, path, c.req.param("key"));
    return c.body(null, 204);
  });

  // API keys (admin)
  api.get("/keys", (c) => c.json({ keys: vault.listKeys(c.get("who"), c.req.query("project")) }));
  api.post("/keys", async (c) => {
    const body = await c.req.json<{ name: string; role: Role; project?: string }>();
    return c.json(vault.createKey(c.get("who"), body), 201);
  });
  api.delete("/keys/:id", (c) => {
    vault.revokeKey(c.get("who"), Number(c.req.param("id")));
    return c.body(null, 204);
  });

  api.get("/audit", (c) =>
    c.json({
      entries: vault.listAudit(c.get("who"), {
        project: c.req.query("project"),
        limit: Number(c.req.query("limit") ?? 200),
      }),
    }));

  return api;
}

function loc(c: Context<Env>) {
  return {
    project: c.req.param("project")!,
    env: c.req.query("env") || "dev",
    path: c.req.query("path") || "/",
  };
}
