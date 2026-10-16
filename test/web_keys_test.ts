import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { createApp } from "../main.ts";
import { generateMasterKey, parseMasterKey } from "../src/crypto.ts";
import { Vault } from "../src/vault.ts";

function setup() {
  const vault = new Vault(`${Deno.makeTempDirSync()}/v.db`, parseMasterKey(generateMasterKey()));
  const token = vault.bootstrapAdminKey("root");
  const root = vault.authenticate(token)!;
  vault.createProject(root, { slug: "rhystic", environments: ["dev"] });
  const app = createApp(vault);
  const req = (path: string, init: RequestInit & { as?: string } = {}) =>
    app.request(path, {
      ...init,
      headers: { cookie: `hv_token=${init.as ?? token}`, ...init.headers },
    });
  const post = (path: string, form: Record<string, string>, headers?: Record<string, string>) =>
    req(path, { method: "POST", body: new URLSearchParams(form), headers });
  return { vault, root, req, post };
}

Deno.test("web keys: list, new-key form, and the project preselect", async () => {
  const { vault, root, req } = setup();
  vault.createKey(root, { name: "ci", role: "read", project: "rhystic" });
  const list = await (await req("/keys")).text();
  assertStringIncludes(list, `href="/keys/new"`);
  assertStringIncludes(list, "All projects");
  assertStringIncludes(list, "Never");
  assertStringIncludes(list, `<a href="/p/rhystic" class="mono">rhystic</a>`);

  const form = await (await req("/keys/new?project=rhystic")).text();
  assertStringIncludes(form, `<option value="rhystic" selected>rhystic</option>`);
  assertStringIncludes(form, `href="/p/rhystic/settings"`); // Cancel goes back to the project
  for (const role of ["read", "readwrite", "admin"]) {
    assertStringIncludes(form, `id="role-${role}"`);
  }
  // An unknown project preselects nothing, and Cancel falls back to /keys (not a 404).
  const unknown = await (await req("/keys/new?project=nope")).text();
  assertStringIncludes(unknown, `<a class="btn secondary" href="/keys">Cancel</a>`);
});

Deno.test("web keys: status filter, revoked date, and the signed-in key", async () => {
  const { vault, root, req } = setup();
  const { key } = vault.createKey(root, { name: "old-ci", role: "read", project: "rhystic" });
  vault.revokeKey(root, key.id);
  const active = await (await req("/keys")).text();
  assertEquals(active.includes("old-ci"), false); // active keys by default
  assertStringIncludes(active, `aria-current="true">Active`);
  assertStringIncludes(active, `root<span class="muted">\u00a0(you)</span>`);
  const revoked = await (await req("/keys?show=revoked")).text();
  assertStringIncludes(revoked, "old-ci");
  assertStringIncludes(revoked, `<span class="cell-meta">Revoked <time`);
  assertEquals(revoked.includes(`cell-main">root`), false);
});

Deno.test("web keys: project keys get 403 on every key page", async () => {
  const { vault, root, req, post } = setup();
  const { token } = vault.createKey(root, { name: "agent", role: "readwrite", project: "rhystic" });
  for (const path of ["/keys", "/keys/new", "/keys/1/revoke"]) {
    const res = await req(path, { as: token });
    assertEquals(res.status, 403, path);
    assertStringIncludes(await res.text(), "admin key required");
  }
  const res = await post("/keys", { name: "x", role: "admin" }, { cookie: `hv_token=${token}` });
  assertEquals(res.status, 303);
  assertEquals(vault.listKeys(root).length, 2);
});

Deno.test("web keys: created page shows the token once, uncached, with the host file", async () => {
  const { vault, post } = setup();
  const res = await post("/keys", { name: "ci", role: "read", project: "rhystic" });
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("cache-control"), "no-store");
  const html = await res.text();
  const token = /data-select-all="true">(hvk_[^<]+)<\/textarea>/.exec(html)![1];
  assertEquals(vault.authenticate(token)?.project, "rhystic");
  assertStringIncludes(html, "~/.config/heka-vault/rhystic.env");
  assertStringIncludes(html, `HEKA_VAULT_TOKEN=${token}`);
  assertStringIncludes(html, `href="/p/rhystic/settings"`);

  // An admin key drops a project left selected in the form, and Done goes back to /keys.
  const admin = await (await post("/keys", { name: "ops", role: "admin", project: "rhystic" }))
    .text();
  assertStringIncludes(admin, `class="btn" href="/keys"`);
  assertEquals(admin.includes("HEKA_VAULT_PROJECT"), false);
});

Deno.test("web keys: a create error returns to the form with what was typed", async () => {
  const { req, post } = setup();
  const res = await post("/keys", { name: "ci", role: "read" });
  assertEquals(res.status, 303);
  const to = res.headers.get("location")!;
  assert(to.startsWith("/keys/new?"), to);
  const html = await (await req(to)).text();
  assertStringIncludes(html, `value="ci"`);
  assertStringIncludes(html, "Choose a project. Only admin keys work without one.");

  // Each vault message mapped to a field error; a rewording in vault.ts must fail here.
  const field = async (form: Record<string, string>, text: string) => {
    const res = await post("/keys", form);
    const html = await (await req(res.headers.get("location")!)).text();
    assertStringIncludes(html, `class="field-error"`);
    assertStringIncludes(html, text);
  };
  await field({ name: " ", role: "admin" }, "Enter a name.");
  await field(
    { name: "ci", role: "read", project: "nope" },
    "There is no project called <code>nope</code>.",
  );
});

Deno.test("web keys: revoke, the no-JS confirm page, and the last admin key", async () => {
  const { vault, root, req, post } = setup();
  const { key } = vault.createKey(root, { name: "ci", role: "read", project: "rhystic" });

  const page = await (await req(`/keys/${key.id}/revoke`)).text();
  assertStringIncludes(page, `action="/keys/${key.id}/revoke"`);
  assertStringIncludes(page, "<code>ci</code> will stop working immediately.");

  let res = await post(`/keys/${key.id}/revoke`, { back: "//evil.example/x" });
  assertEquals(res.headers.get("location"), "/keys?msg=Key+revoked%3A+ci");
  assert(vault.listKeys(root).find((k) => k.id === key.id)!.revokedAt);

  res = await post(`/keys/${root.keyId}/revoke`, { back: "/p/rhystic/settings" });
  const to = new URL(res.headers.get("location")!, "http://x");
  assertEquals(to.pathname, "/p/rhystic/settings");
  assertStringIncludes(to.searchParams.get("err")!, "last admin key");
});

Deno.test("web keys: back paths that resolve off-site are ignored", async () => {
  const { vault, root, req, post } = setup();
  const { key } = vault.createKey(root, { name: "ci", role: "read", project: "rhystic" });
  for (const back of ["//evil.example/x", "/\\evil.example/x", "/\t/evil.example/x"]) {
    const page = await (await req(`/keys/${key.id}/revoke?back=${encodeURIComponent(back)}`))
      .text();
    assertStringIncludes(page, `<a class="btn secondary" href="/keys">Cancel</a>`, back);
    assertEquals(page.includes("evil"), false, back);
  }
  const res = await post(`/keys/${key.id}/revoke`, { back: "/\t/evil.example/x" });
  assertEquals(res.headers.get("location"), "/keys?msg=Key+revoked%3A+ci");
});

Deno.test("web keys: revoking the signed-in key signs out with the message", async () => {
  const { vault, root, post } = setup();
  vault.createKey(root, { name: "spare", role: "admin" });
  const res = await post(`/keys/${root.keyId}/revoke`, {});
  assertEquals(res.headers.get("location"), "/login?msg=Key+revoked%3A+root");
  assertStringIncludes(res.headers.get("set-cookie")!, "hv_token=;");
});

Deno.test("web keys: a resubmitted new-key form doesn't create a second key", async () => {
  const { vault, root, req, post } = setup();
  const form = await (await req("/keys/new?project=rhystic")).text();
  const nonce = /name="nonce" value="([^"]+)"/.exec(form)![1];
  assertStringIncludes(form, `<a href="/p/rhystic/settings"><span class="mono">rhystic</span></a>`);
  const fields = { nonce, name: "ci", role: "read", project: "rhystic" };
  const created = await (await post("/keys", fields)).text();
  assertStringIncludes(created, `<span aria-current="page">Key created</span>`);
  const res = await post("/keys", fields);
  assertEquals(res.headers.get("location"), "/p/rhystic/settings?err=Key+already+created%3A+ci");
  assertEquals(vault.listKeys(root).length, 2);
  // An admin key's form returns to /keys.
  const admin = { nonce: crypto.randomUUID(), name: "ops", role: "admin" };
  await post("/keys", admin);
  assertEquals(
    (await post("/keys", admin)).headers.get("location"),
    "/keys?err=Key+already+created%3A+ops",
  );
  assertEquals(vault.listKeys(root).length, 3);
});
