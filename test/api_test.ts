import { assertEquals, assertStringIncludes } from "@std/assert";
import { createApp } from "../main.ts";
import { generateMasterKey, parseMasterKey } from "../src/crypto.ts";
import { Vault } from "../src/vault.ts";

function setup() {
  const vault = new Vault(`${Deno.makeTempDirSync()}/v.db`, parseMasterKey(generateMasterKey()));
  const adminToken = vault.bootstrapAdminKey("root");
  const app = createApp(vault);
  const call = (method: string, path: string, token?: string, body?: unknown, type?: string) =>
    app.request(path, {
      method,
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(body !== undefined ? { "content-type": type ?? "application/json" } : {}),
      },
      body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
    });
  return { app, vault, adminToken, call };
}

Deno.test("API: requires a token, serves health and OpenAPI without one", async () => {
  const { call } = setup();
  assertEquals((await call("GET", "/api/v1/projects")).status, 401);
  assertEquals((await call("GET", "/api/v1/projects", "hvk_nope")).status, 401);
  assertEquals((await call("GET", "/api/v1/health")).status, 200);
  const spec = await (await call("GET", "/api/v1/openapi.json")).json();
  assertEquals(spec.openapi, "3.1.0");
});

Deno.test("API: admin creates project + key; agent pulls dotenv", async () => {
  const { call, adminToken } = setup();
  let res = await call("POST", "/api/v1/projects", adminToken, {
    slug: "rhystic",
    environments: ["dev", "prod"],
  });
  assertEquals(res.status, 201);

  res = await call("PUT", "/api/v1/projects/rhystic/secrets?env=dev&path=/backend", adminToken, {
    secrets: { DB_URL: "postgres://x", TOKEN: "it's" },
  });
  assertEquals(await res.json(), { created: 2, updated: 0, deleted: 0 });

  res = await call("POST", "/api/v1/keys", adminToken, {
    name: "ep-ai",
    role: "read",
    project: "rhystic",
  });
  const { token } = await res.json();

  res = await call("GET", "/api/v1/whoami", token);
  assertEquals((await res.json()).project, "rhystic");

  res = await call(
    "GET",
    "/api/v1/projects/rhystic/secrets?env=dev&path=/backend&format=dotenv",
    token,
  );
  assertEquals(res.headers.get("cache-control"), "no-store");
  assertEquals(await res.text(), `DB_URL='postgres://x'\nTOKEN="it's"\n`);

  res = await call(
    "GET",
    "/api/v1/projects/rhystic/secrets/DB_URL?path=/backend&format=raw",
    token,
  );
  assertEquals(await res.text(), "postgres://x");

  res = await call("PUT", "/api/v1/projects/rhystic/secrets/NEW", token, { value: "v" });
  assertEquals(res.status, 403);
  res = await call("GET", "/api/v1/keys", token);
  assertEquals(res.status, 403);
});

Deno.test("API: bulk upload accepts a .env body", async () => {
  const { call, adminToken } = setup();
  await call("POST", "/api/v1/projects", adminToken, { slug: "a" });
  const res = await call(
    "PUT",
    "/api/v1/projects/a/secrets",
    adminToken,
    "A=1\nB='two'\n",
    "text/plain",
  );
  assertEquals(await res.json(), { created: 2, updated: 0, deleted: 0 });
  const list = await (await call("GET", "/api/v1/projects/a/secrets", adminToken)).json();
  assertEquals(list.secrets.map((s: { key: string }) => s.key), ["A", "B"]);
});

Deno.test("web: login with token sets cookie; project keys land on their project", async () => {
  const { app, vault, adminToken } = setup();
  const admin = vault.authenticate(adminToken)!;
  vault.createProject(admin, { slug: "a" });
  vault.setSecret(admin, "a", "dev", "/", "SECRET_ONE", "value-one");
  const { token } = vault.createKey(admin, { name: "agent", role: "read", project: "a" });

  assertEquals((await app.request("/")).headers.get("location"), "/login");

  const form = new FormData();
  form.set("token", token);
  const login = await app.request("/login", { method: "POST", body: form });
  const cookie = login.headers.get("set-cookie")!.split(";")[0];
  assertStringIncludes(login.headers.get("set-cookie")!, "HttpOnly");

  const home = await app.request("/", { headers: { cookie } });
  assertEquals(home.headers.get("location"), "/p/a");
  const page = await (await app.request("/p/a", { headers: { cookie } })).text();
  assertStringIncludes(page, "SECRET_ONE");
  assertEquals(page.includes("Generate key"), false);

  const keys = await app.request("/keys", { headers: { cookie } });
  assertEquals(keys.status, 403);
  assertStringIncludes(await keys.text(), "admin key required");
});
