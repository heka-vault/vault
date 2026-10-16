import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { createApp } from "../main.ts";
import { generateMasterKey, parseMasterKey } from "../src/crypto.ts";
import { Vault } from "../src/vault.ts";

function setup() {
  const vault = new Vault(`${Deno.makeTempDirSync()}/v.db`, parseMasterKey(generateMasterKey()));
  const token = vault.bootstrapAdminKey("root");
  const root = vault.authenticate(token)!;
  vault.createProject(root, { slug: "a", environments: ["dev"] });
  const reader = vault.createKey(root, { name: "agent", role: "read", project: "a" }).token;
  const app = createApp(vault);
  const as = (t?: string) => (path: string, init: RequestInit = {}) =>
    app.request(path, { ...init, headers: t ? { cookie: `hv_token=${t}` } : {} });
  return { admin: as(token), read: as(reader), anon: as(), token };
}

Deno.test("web access: sign-in page, invalid token, and sign out", async () => {
  const { admin, anon } = setup();
  const page = await (await anon("/login")).text();
  assertStringIncludes(page, `<h1>Sign in to Heka Vault</h1>`);
  assertStringIncludes(page, `type="password"`);
  assertStringIncludes(page, "<code>create-admin-key</code>");
  assert(!page.includes(`aria-invalid="true"`));
  assert(!page.includes(`name="next"`));

  const bad = await anon("/login", { method: "POST", body: new URLSearchParams({ token: "x" }) });
  assertEquals(bad.status, 401);
  const b = await bad.text();
  assertStringIncludes(b, `aria-invalid="true"`);
  assertStringIncludes(b, `aria-describedby="token-hint token-error"`);
  assertStringIncludes(b, "This token is invalid or revoked");

  const again = await admin("/login");
  assertEquals(again.status, 302);
  assertEquals(again.headers.get("location"), "/");

  const out = await admin("/logout", { method: "POST" });
  assertEquals(out.headers.get("location"), "/login?msg=Signed+out");
  assertStringIncludes(out.headers.get("set-cookie")!, "hv_token=;");

  const logout = (next: string) =>
    admin("/logout", { method: "POST", body: new URLSearchParams({ next }) });
  assertEquals(
    (await logout("/keys?x=1")).headers.get("location"),
    "/login?next=%2Fkeys%3Fx%3D1&msg=Signed+out",
  );
  assertEquals((await logout("//evil.example")).headers.get("location"), "/login?msg=Signed+out");
});

Deno.test("web access: the sign-in page shows only its own messages", async () => {
  const { anon } = setup();
  const spoof =
    await (await anon("/login?err=Session%20expired&msg=Paste%20it%20at%20evil.example"))
      .text();
  assert(!spoof.includes(`class="flash ok"`) && !spoof.includes(`role="alert"`));
  assert(!spoof.includes("evil.example"));
  assertStringIncludes(await (await anon("/login?msg=Signed%20out")).text(), "Signed out</div>");
  for (const name of ["ci", "ci runner", "x".repeat(200)]) {
    const page = await (await anon(`/login?msg=${encodeURIComponent(`Key revoked: ${name}`)}`))
      .text();
    assertStringIncludes(page, "You revoked the key you were signed in with.");
    assert(!page.includes("Key revoked") && !page.includes(`${name}<`));
  }
});

Deno.test("web access: sign-in returns to a same-origin next path only", async () => {
  const { admin, anon, token } = setup();
  const form = await (await anon("/login?next=%2Fkeys%3Fx%3D1")).text();
  assertStringIncludes(form, `<input type="hidden" name="next" value="/keys?x=1">`);
  const post = (t: string, next: string) =>
    anon("/login", { method: "POST", body: new URLSearchParams({ token: t, next }) });
  assertStringIncludes(await (await post("x", "/keys")).text(), `name="next" value="/keys"`);
  assertEquals((await post(token, "/keys?x=1")).headers.get("location"), "/keys?x=1");
  assertEquals((await admin("/login?next=%2Faudit")).headers.get("location"), "/audit");
  for (const evil of ["//evil.example", "/\\evil.example", "https://evil.example", "/\t/x"]) {
    assertEquals((await post(token, evil)).headers.get("location"), "/");
    assertEquals(
      (await admin(`/login?next=${encodeURIComponent(evil)}`)).headers.get("location"),
      "/",
    );
  }
});

Deno.test("web access: error pages name the problem and the way back", async () => {
  const { admin, read } = setup();
  const forbidden = await read("/keys");
  assertEquals(forbidden.status, 403);
  const f = await forbidden.text();
  assertStringIncludes(f, "admin key required");
  assertStringIncludes(f, "This page is for admin keys");
  assertStringIncludes(f, `This key can only use <code>a</code>`);
  assertStringIncludes(f, `href="/p/a"`);
  assertStringIncludes(f, `action="/logout"`);
  assertStringIncludes(f, `<input type="hidden" name="next" value="/keys">`);

  const project = await admin("/p/nope");
  assertEquals(project.status, 404);
  const p = await project.text();
  assertStringIncludes(p, "find that project");
  assertStringIncludes(p, "There is no project called <code>nope</code>.");
  assertStringIncludes(p, "Back to projects");
  assertStringIncludes(await (await read("/p/nope")).text(), "or this key can&#39;t see it");

  for (const path of ["/p/%zz", "/p/%E0%A4%A/settings"]) {
    const malformed = await admin(path);
    assertEquals(malformed.status, 404);
    const m = await malformed.text();
    assertStringIncludes(m, `<main id="main" class="p-error"`);
    assertStringIncludes(m, "project not found");
  }

  const key = await (await admin("/keys/99999/revoke")).text();
  assertStringIncludes(key, "find that key");
  assertStringIncludes(key, `href="/keys"`);
  assertStringIncludes(key, "Back to API keys");
  const inProject = await (await admin("/p/nope/zzz")).text();
  assertStringIncludes(inProject, "Back to projects");
  assert(!inProject.includes(`href="/p/nope"`));

  const env = await (await admin("/p/a?env=qa")).text();
  assertStringIncludes(env, "has no environment called <code>qa</code>");
  assertStringIncludes(env, "Back to a");

  const unknown = await read("/nope");
  assertEquals(unknown.status, 404);
  const u = await unknown.text();
  assertStringIncludes(u, "find that page");
  assertStringIncludes(u, "page not found");
  assert(!u.includes(`aria-current="page"`));
});

Deno.test("web access: docs use the app header, signed in or not", async () => {
  const { admin, anon } = setup();
  const out = await (await anon("/docs")).text();
  assertStringIncludes(out, `<a href="/login?next=%2Fdocs" class="topbar-link">Sign in</a>`);
  assertStringIncludes(out, "@layer app{");
  assertStringIncludes(out, "<code>http://localhost/api/v1</code>");
  for (const file of ["swagger-ui.css", "swagger-ui-bundle.js"]) {
    assert(new RegExp(`${file}" integrity="sha384-[^"]+" crossorigin="anonymous"`).test(out), file);
  }
  assert(!out.includes("persistAuthorization"));
  const signedIn = await (await admin("/docs")).text();
  assertStringIncludes(signedIn, "Account: root, admin");
  assert(!signedIn.includes(`href="/login`));
  assertStringIncludes(signedIn, `class="topbar-link topbar-docs" aria-current="page"`);
  assertEquals(signedIn.match(/<main/g)?.length, 1);
  assertStringIncludes(signedIn, `<main id="main" class="p-docs"`);
  assertStringIncludes(signedIn, `role", "none"`);
});

Deno.test("web access: GET /logout asks to sign out", async () => {
  const { admin, anon } = setup();
  const page = await admin("/logout");
  assertEquals(page.status, 200);
  const p = await page.text();
  assertStringIncludes(p, `<form method="post" action="/logout"`);
  assertStringIncludes(p, ">Sign out</button>");
  assertEquals((await anon("/logout")).headers.get("location"), "/login");
});
