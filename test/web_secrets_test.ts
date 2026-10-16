import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { createApp } from "../main.ts";
import { generateMasterKey, parseMasterKey } from "../src/crypto.ts";
import { Vault } from "../src/vault.ts";

const VALUE = "postgres://app:s3cret-value@db/app";

function setup() {
  const vault = new Vault(`${Deno.makeTempDirSync()}/v.db`, parseMasterKey(generateMasterKey()));
  const admin = vault.authenticate(vault.bootstrapAdminKey("root"))!;
  vault.createProject(admin, { slug: "a" });
  vault.createProject(admin, { slug: "b" });
  vault.setSecret(admin, "a", "dev", "/backend", "DATABASE_URL", VALUE);
  vault.setSecret(
    admin,
    "a",
    "dev",
    "/backend",
    "PRIVATE_KEY_PEM",
    "-----BEGIN-----\nAAA\n-----END-----",
  );
  const app = createApp(vault);
  const token = (role: "read" | "readwrite", project = "a") =>
    vault.createKey(admin, { name: `${role}-${project}`, role, project }).token;
  const as = (t: string) => (path: string, init: RequestInit = {}) =>
    app.request(path, { ...init, headers: { cookie: `hv_token=${t}`, ...init.headers } });
  const post = (t: string, path: string, form: Record<string, string>) =>
    as(t)(path, { method: "POST", body: new URLSearchParams(form) });
  return { vault, admin, token, as, post };
}

Deno.test("web secrets: the browser page never carries secret values", async () => {
  const { token, as } = setup();
  for (const role of ["read", "readwrite"] as const) {
    const page = await (await as(token(role))("/p/a?env=dev&path=/backend")).text();
    assertStringIncludes(page, "DATABASE_URL");
    assertEquals(page.includes(VALUE), false);
    assertEquals(page.includes("AAA"), false);
    assertEquals(page.includes("Add secret"), role === "readwrite");
    assertEquals(page.includes("Delete secret"), role === "readwrite");
    assertEquals(page.includes("Settings"), false);
  }
});

Deno.test("web secrets: one value as text/plain, audited, scoped to the key's project", async () => {
  const { vault, admin, token, as } = setup();
  const url = "/p/a/secrets/value?env=dev&path=/backend&key=DATABASE_URL";
  const res = await as(token("read"))(url);
  assertEquals(res.status, 200);
  assertEquals(await res.text(), VALUE);
  assertStringIncludes(res.headers.get("content-type")!, "text/plain");
  assertEquals(res.headers.get("cache-control"), "no-store");
  const reads = vault.listAudit(admin).filter((e) => e.action === "secret.read");
  assertEquals(reads.map((e) => e.key), ["DATABASE_URL"]);

  const other = await as(token("read", "b"))(url);
  assertEquals(other.status, 404);
  assertEquals((await other.text()).includes(VALUE), false);
});

Deno.test("web secrets: export downloads the folder as .env without caching", async () => {
  const { token, as } = setup();
  const res = await as(token("read"))("/p/a/export?env=dev&path=/backend");
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("cache-control"), "no-store");
  assertStringIncludes(res.headers.get("content-disposition")!, 'filename="a-dev-backend.env"');
  assertStringIncludes(await res.text(), `DATABASE_URL='${VALUE}'`);
});

Deno.test("web secrets: folders show as a breadcrumb and child-folder rows with counts", async () => {
  const { vault, admin, token, as } = setup();
  vault.setSecret(admin, "a", "dev", "/", "LOG_LEVEL", "debug");
  vault.setSecret(admin, "a", "dev", "/workers/email", "RESEND_API_KEY", "re_x");
  vault.setSecret(admin, "a", "dev", "/workers/sms", "TWILIO_TOKEN", "");
  vault.setSecret(admin, "a", "dev", "/workers/sms", "TWILIO_SID", "AC");
  const root = await (await as(token("read"))("/p/a?env=dev")).text();
  assertStringIncludes(root, 'href="/p/a?env=dev&amp;path=%2Fbackend"');
  assertStringIncludes(root, "2 secrets");
  assertStringIncludes(root, "3 secrets");
  assertEquals(root.includes("re_x"), false);
  assertEquals((root.match(/class="row-link folder"/g) ?? []).length, 2);

  const sms = await (await as(token("read"))("/p/a?env=dev&path=/workers/sms")).text();
  assertStringIncludes(sms, 'href="/p/a?env=dev&amp;path=%2Fworkers"');
  assertStringIncludes(sms, '<span aria-current="true">sms</span>');
  assertEquals((sms.match(/<td class="muted">Empty<\/td>/g) ?? []).length, 1);
});

Deno.test("web secrets: read keys get no write pages; writes keep values out of URLs", async () => {
  const { vault, token, as, post } = setup();
  const ro = token("read");
  for (
    const path of [
      "/p/a/secrets/new?env=dev",
      "/p/a/import?env=dev",
      "/p/a/secrets/edit?env=dev&path=/backend&key=DATABASE_URL",
    ]
  ) {
    assertEquals((await as(ro)(path)).status, 403);
  }
  assertEquals((await post(ro, "/p/a/secrets/new?env=dev", { key: "X", value: "v" })).status, 303);
  assertEquals(vault.listSecrets(vault.authenticate(ro)!, "a", "dev", "/").length, 0);

  const rw = token("readwrite");
  for (const path of ["/p/a/secrets/new?env=nope", "/p/a/import?env=nope"]) {
    assertEquals((await as(rw)(path)).status, 404);
  }
  const bad = await post(rw, "/p/a/secrets/new?env=dev&path=/backend", {
    path: "/new",
    key: "1BAD",
    value: "kept",
  });
  assertEquals(bad.status, 400);
  assertEquals(bad.headers.get("cache-control"), "no-store");
  const html = await bad.text();
  assertStringIncludes(html, "is not a valid key");
  assertStringIncludes(html, ">kept</textarea>");
  assertStringIncludes(html, 'href="/p/a?env=dev&amp;path=%2Fbackend">Cancel');

  const ok = await post(rw, "/p/a/secrets/new?env=dev&folder=new", {
    path: "/workers/email",
    key: "K",
    value: "hush",
  });
  const loc = ok.headers.get("location")!;
  assertStringIncludes(decodeURIComponent(loc), "path=/workers/email");
  assertStringIncludes(new URL(loc, "http://x").searchParams.get("msg")!, "Secret created: K");
  assertEquals(loc.includes("hush"), false);
});

Deno.test("web secrets: edit prefills the value and is never cached", async () => {
  const { vault, admin, token, as, post } = setup();
  const rw = token("readwrite");
  const url = "/p/a/secrets/edit?env=dev&path=/backend&key=PRIVATE_KEY_PEM";
  const res = await as(rw)(url);
  assertEquals(res.headers.get("cache-control"), "no-store");
  assertStringIncludes(await res.text(), "-----BEGIN-----\nAAA\n-----END-----</textarea>");
  const saved = await post(rw, url, { value: "new" });
  assertEquals(saved.status, 303);
  assertEquals(vault.getSecret(admin, "a", "dev", "/backend", "PRIVATE_KEY_PEM").value, "new");
});

Deno.test("web secrets: import validates, and replace lists what it deletes first", async () => {
  const { vault, admin, token, post } = setup();
  const rw = token("readwrite");
  const url = "/p/a/import?env=dev&path=/backend";
  const keys = () => vault.listSecrets(admin, "a", "dev", "/backend").map((s) => s.key);
  const empty = await post(rw, url, { path: "/backend", dotenv: "# none", replace: "1" });
  assertEquals(empty.status, 400);
  assertEquals(empty.headers.get("cache-control"), "no-store");
  assertEquals(keys(), ["DATABASE_URL", "PRIVATE_KEY_PEM"]);

  const form = { path: "/backend", dotenv: "DATABASE_URL=x\nNEW=y", replace: "1" };
  const confirm = await post(rw, url, form);
  assertEquals(confirm.status, 200);
  assertEquals(confirm.headers.get("cache-control"), "no-store");
  const page = await confirm.text();
  assertStringIncludes(page, "<li>PRIVATE_KEY_PEM</li>");
  assertStringIncludes(page, "Adds 1, updates 1, deletes 1 in");
  assertStringIncludes(page, 'name="confirm" value="PRIVATE_KEY_PEM"');
  assertStringIncludes(page, "Delete 1 secret and import");
  assertEquals(page.includes("AAA"), false);
  assertEquals(keys(), ["DATABASE_URL", "PRIVATE_KEY_PEM"]);
  assertEquals(vault.getSecret(admin, "a", "dev", "/backend", "DATABASE_URL").value, VALUE);

  const done = await post(rw, url, { ...form, confirm: "PRIVATE_KEY_PEM" });
  assertStringIncludes(
    decodeURIComponent(done.headers.get("location")!).replaceAll("+", " "),
    "Imported: 1 added, 1 updated, 1 deleted",
  );
  assert(!done.headers.get("location")!.includes("=x"));
  assertEquals(keys(), ["DATABASE_URL", "NEW"]);

  const into = await post(rw, url, { path: "/payments", dotenv: "A=1" });
  assertStringIncludes(
    decodeURIComponent(into.headers.get("location")!).replaceAll("+", " "),
    "path=/payments&msg=Imported: 1 added",
  );
});

Deno.test("web secrets: no-JS delete confirmation page posts to the delete route", async () => {
  const { token, as } = setup();
  const page = await (await as(token("readwrite"))(
    "/p/a/secrets/delete?env=dev&path=/backend&key=DATABASE_URL",
  )).text();
  assertStringIncludes(page, 'action="/p/a/secrets/delete"');
  assertStringIncludes(page, 'name="key" value="DATABASE_URL"');
  assertEquals(page.includes(VALUE), false);
});

Deno.test("web secrets: add never overwrites an existing key", async () => {
  const { vault, admin, token, post } = setup();
  const res = await post(token("readwrite"), "/p/a/secrets/new?env=dev&path=/backend", {
    path: "/backend",
    key: "DATABASE_URL",
    value: "kept",
  });
  assertEquals(res.status, 400);
  assertEquals(res.headers.get("cache-control"), "no-store");
  const html = await res.text();
  assertStringIncludes(
    html,
    "<code>DATABASE_URL</code> already exists in <code>dev:/backend</code>",
  );
  assertStringIncludes(
    html,
    'href="/p/a/secrets/edit?env=dev&amp;path=%2Fbackend&amp;key=DATABASE_URL"',
  );
  assertStringIncludes(html, ">kept</textarea>");
  assertEquals(vault.getSecret(admin, "a", "dev", "/backend", "DATABASE_URL").value, VALUE);
});

Deno.test("web secrets: a bare folder name goes inside the current folder", async () => {
  const { vault, admin, token, post } = setup();
  const rw = token("readwrite");
  const made = await post(rw, "/p/a/secrets/new?env=dev&path=/workers&folder=new", {
    path: "payments",
    key: "K",
    value: "v",
  });
  assertStringIncludes(decodeURIComponent(made.headers.get("location")!), "path=/workers/payments");
  assertEquals(vault.getSecret(admin, "a", "dev", "/workers/payments", "K").value, "v");

  const root = await post(rw, "/p/a/secrets/new?env=dev&path=/workers&folder=new", {
    path: "/top",
    key: "K",
    value: "v",
  });
  assertStringIncludes(decodeURIComponent(root.headers.get("location")!), "path=/top&");

  const bad = await post(rw, "/p/a/secrets/new?env=dev&path=/workers&folder=new", {
    path: "pay ments",
    key: "K",
    value: "v",
  });
  assertEquals(bad.status, 400);
  assertStringIncludes(await bad.text(), "Folder names can use letters, digits");

  const imported = await post(rw, "/p/a/import?env=dev&path=/workers", {
    path: "sms",
    dotenv: "A=1",
  });
  assertStringIncludes(decodeURIComponent(imported.headers.get("location")!), "path=/workers/sms");
});

Deno.test("web secrets: a bad folder in the URL goes back to the root with an error", async () => {
  const { token, as } = setup();
  const res = await as(token("read"))("/p/a?env=dev&path=bad%20path");
  assertEquals(res.status, 303);
  const loc = new URL(res.headers.get("location")!, "http://x");
  assertEquals(loc.searchParams.get("path"), "/");
  assertEquals(loc.searchParams.get("err"), "invalid path segment: bad path");
});

Deno.test("web secrets: the filter can find keys in sub-folders without loading values", async () => {
  const { vault, admin, token, as } = setup();
  for (const k of ["A", "B", "C", "D"]) vault.setSecret(admin, "a", "dev", "/", k, "v");
  vault.setSecret(admin, "a", "dev", "/workers/email", "RESEND_API_KEY", "re_x");
  const root = await (await as(token("read"))("/p/a?env=dev")).text();
  assertStringIncludes(root, 'data-filter-text="workers/email"');
  assertStringIncludes(root, '<tr class="deep" data-filter-text="RESEND_API_KEY">');
  assertStringIncludes(root, 'href="/p/a?env=dev&amp;path=%2Fworkers%2Femail">/workers/email</a>');
  assertEquals(root.includes("re_x"), false);
});

Deno.test("web secrets: back from the replace review keeps the pasted file", async () => {
  const { token, post } = setup();
  const res = await post(token("readwrite"), "/p/a/import?env=dev&path=/backend", {
    path: "/backend",
    dotenv: "DATABASE_URL=x",
    replace: "1",
    confirm: "PRIVATE_KEY_PEM",
    back: "1",
  });
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("cache-control"), "no-store");
  const html = await res.text();
  assertStringIncludes(html, ">DATABASE_URL=x</textarea>");
  assertStringIncludes(html, 'name="replace" value="1" checked');
});

Deno.test("web secrets: import shows parse errors on the field", async () => {
  const { token, post } = setup();
  const res = await post(token("readwrite"), "/p/a/import?env=dev&path=/backend", {
    path: "/backend",
    dotenv: "ok=1\nnot dotenv",
  });
  assertEquals(res.status, 400);
  assertStringIncludes(await res.text(), "Line 2: expected KEY=value");
});
