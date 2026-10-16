import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { createApp } from "../main.ts";
import { generateMasterKey, parseMasterKey } from "../src/crypto.ts";
import { Vault } from "../src/vault.ts";

function setup() {
  const vault = new Vault(`${Deno.makeTempDirSync()}/v.db`, parseMasterKey(generateMasterKey()));
  const token = vault.bootstrapAdminKey("root");
  const root = vault.authenticate(token)!;
  const app = createApp(vault);
  const req = (path: string, init: RequestInit & { as?: string } = {}) =>
    app.request(path, {
      ...init,
      headers: { cookie: `hv_token=${init.as ?? token}`, ...init.headers },
    });
  const post = (path: string, form: [string, string][]) =>
    req(path, { method: "POST", body: new URLSearchParams(form) });
  return { vault, root, req, post };
}

Deno.test("web projects: empty vault guides to the first project", async () => {
  const { req } = setup();
  const html = await (await req("/")).text();
  assertStringIncludes(html, "No projects yet");
  assertStringIncludes(html, "project key");
  assertEquals(html.match(/href="\/projects\/new"/g)?.length, 1); // one action, not two
  assertEquals(html.includes("<table"), false);
});

Deno.test("web projects: list rows, prod badge, and the filter threshold", async () => {
  const { vault, root, req } = setup();
  vault.createProject(root, {
    slug: "rhystic",
    name: "Rhystic Gaming",
    environments: ["dev", "prod"],
  });
  const html = await (await req("/")).text();
  assertStringIncludes(html, `<a href="/p/rhystic" class="cell-main">Rhystic Gaming</a>`);
  assertStringIncludes(html, `<span class="cell-meta mono">rhystic</span>`);
  assertStringIncludes(html, 'class="badge prod mono"');
  assertEquals(html.includes("data-filter="), false); // a short list needs no filter

  for (let i = 0; i < 10; i++) vault.createProject(root, { slug: `p${i}` });
  const many = await (await req("/")).text();
  // A project without a display name shows its slug once, in mono.
  assertStringIncludes(many, `class="cell-main mono">p0</a>`);
  assertEquals(many.includes(`<span class="cell-meta mono">p0</span>`), false);
  assertStringIncludes(many, `data-filter=".p-projects tbody tr"`);
  assertStringIncludes(many, `data-filter-text="Rhystic Gaming rhystic dev prod"`);
  assertStringIncludes(many, `id="no-match"`);
});

Deno.test("web projects: deletion flash sets the slug in mono", async () => {
  const { req } = setup();
  const html = await (await req("/?msg=Project%20deleted%3A%20sandbox")).text();
  assertStringIncludes(html, "Project deleted: <code>sandbox</code>");
});

Deno.test("web projects: new-project form defaults and create round trip", async () => {
  const { vault, root, req, post } = setup();
  const form = await (await req("/projects/new")).text();
  assertStringIncludes(form, `aria-current="page">New project`);
  for (const env of ["dev", "staging", "prod"]) {
    assertStringIncludes(form, `name="env" value="${env}" checked`);
  }
  assertStringIncludes(form, `pattern="[a-z0-9][a-z0-9\\-]*"`);

  const res = await post("/projects", [
    ["slug", "billing"],
    ["name", "Billing"],
    ["env", "dev"],
    ["env", "prod"],
    ["other", "qa, preview"],
  ]);
  assertEquals(res.status, 303);
  assertEquals(res.headers.get("location"), "/p/billing?msg=Project+created%3A+billing");
  assertEquals(vault.getProject(root, "billing").environments.sort(), [
    "dev",
    "preview",
    "prod",
    "qa",
  ]);
});

Deno.test("web projects: create errors redisplay the form with what was typed", async () => {
  const { vault, root, req, post } = setup();
  vault.createProject(root, { slug: "rhystic" });

  const dup = await post("/projects", [["slug", "rhystic"], ["name", "Again"], ["env", "dev"]]);
  const dupUrl = dup.headers.get("location")!;
  assert(dupUrl.startsWith("/projects/new?"));
  const dupHtml = await (await req(dupUrl)).text();
  assertStringIncludes(dupHtml, "A project called <code>rhystic</code> already exists.");
  assertStringIncludes(dupHtml, `value="Again"`);
  assertStringIncludes(dupHtml, `name="env" value="dev" checked`);
  assertEquals(dupHtml.includes(`value="prod" checked`), false); // unticked stays unticked

  const slug = await post("/projects", [["slug", "Billing API"], ["env", "dev"]]);
  const slugHtml = await (await req(slug.headers.get("location")!)).text();
  assertStringIncludes(slugHtml, "<span>Not a valid slug. Try <code>billing-api</code>.</span>");
  assertStringIncludes(slugHtml, `aria-invalid="true"`);
  assertEquals(slugHtml.includes(`role="alert"`), false); // shown inline, not twice

  const bang = await post("/projects", [["slug", "!!!"], ["env", "dev"]]);
  const bangHtml = await (await req(bang.headers.get("location")!)).text();
  assertStringIncludes(bangHtml, "<span>Not a valid slug.</span>");

  const env = await post("/projects", [["slug", "ok"], ["other", "qa, Preview"]]);
  const envHtml = await (await req(env.headers.get("location")!)).text();
  assertStringIncludes(
    envHtml,
    "<code>Preview</code> isn&#39;t a valid environment name. Try <code>preview</code>.",
  );
  assertStringIncludes(envHtml, `value="qa, Preview"`);

  // No environment at all is an error, not a silent `dev`.
  const none = await post("/projects", [["slug", "bare"], ["other", " "]]);
  const noneHtml = await (await req(none.headers.get("location")!)).text();
  assertStringIncludes(noneHtml, "Choose at least one environment.");
  assertEquals(noneHtml.includes(`name="env" value="dev" checked`), false);
  assertEquals(vault.listProjects(root).map((p) => p.slug), ["rhystic"]);

  // Anything not tied to a field goes through the shared flash.
  const other = await (await req("/projects/new?err=something%20broke%3A%20x")).text();
  assertStringIncludes(other, "Something broke: <code>x</code>");
});

Deno.test("web projects: project keys never see the list or the form", async () => {
  const { vault, root, req } = setup();
  vault.createProject(root, { slug: "rhystic" });
  const { token } = vault.createKey(root, { name: "agent", role: "readwrite", project: "rhystic" });
  for (const path of ["/", "/projects/new"]) {
    const res = await req(path, { as: token });
    assertEquals(res.headers.get("location"), "/p/rhystic");
  }
  const res = await req("/projects", {
    as: token,
    method: "POST",
    body: new URLSearchParams({ slug: "sneaky", env: "dev" }),
  });
  assertEquals(res.status, 303);
  assertEquals(vault.listProjects(root).map((p) => p.slug), ["rhystic"]);
});
