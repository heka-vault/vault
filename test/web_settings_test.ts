import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { createApp } from "../main.ts";
import { generateMasterKey, parseMasterKey } from "../src/crypto.ts";
import { Vault } from "../src/vault.ts";

function setup() {
  const vault = new Vault(`${Deno.makeTempDirSync()}/v.db`, parseMasterKey(generateMasterKey()));
  const token = vault.bootstrapAdminKey("root");
  const root = vault.authenticate(token)!;
  vault.createProject(root, { slug: "rhystic", environments: ["dev", "prod"] });
  const app = createApp(vault);
  const req = (path: string, init: RequestInit & { as?: string } = {}) =>
    app.request(path, {
      ...init,
      headers: { cookie: `hv_token=${init.as ?? token}`, ...init.headers },
    });
  const post = (path: string, form: Record<string, string>, headers?: Record<string, string>) =>
    req(path, { method: "POST", body: new URLSearchParams(form), headers });
  const location = (res: Response) => new URL(res.headers.get("location")!, "http://x");
  return { vault, root, req, post, location };
}

Deno.test("web settings: sections, typed confirms, and the new-key link", async () => {
  const { vault, root, req } = setup();
  vault.createKey(root, { name: "ci", role: "read", project: "rhystic" });
  const html = await (await req("/p/rhystic/settings")).text();
  assertStringIncludes(html, `href="/p/rhystic?env=prod"`);
  assertStringIncludes(html, `data-confirm-type="dev"`);
  assertStringIncludes(html, `data-confirm-type="rhystic"`);
  assertStringIncludes(html, `href="/p/rhystic/envs/delete?env=dev"`); // no-JS confirm page
  assertStringIncludes(html, `href="/keys/new?project=rhystic"`);
  assertStringIncludes(html, `href="/audit?project=rhystic"`);
  assertStringIncludes(html, "~/.config/heka-vault/rhystic.env");
  assertStringIncludes(html, "2 environments, every secret in them, and 1 API key");
  assertStringIncludes(html, "HEKA_VAULT_PROJECT</code> set to <code>rhystic</code>");
  assertEquals(html.includes("onclick"), false);
});

Deno.test("web settings: one environment is named in the delete-project copy", async () => {
  const { vault, root, req } = setup();
  vault.deleteEnvironment(root, "rhystic", "prod");
  const html = await (await req("/p/rhystic/settings")).text();
  assertStringIncludes(html, `data-confirm-where="dev"`);
  assertStringIncludes(html, "{subject} will be deleted with its environment {where} and every");
  assertStringIncludes(html, "with its environment <code>dev</code> and every secret in it.");
});

Deno.test("web settings: add and delete an environment", async () => {
  const { vault, root, req, post, location } = setup();
  let res = await post("/p/rhystic/envs", { env: " staging " });
  assertEquals(location(res).pathname, "/p/rhystic/settings");
  assertEquals(location(res).searchParams.get("msg"), "Environment created: staging");

  // Errors go back to the field with the typed name kept (no page-top flash).
  res = await post("/p/rhystic/envs", { env: "staging" });
  assertEquals(
    res.headers.get("location"),
    "/p/rhystic/settings?env=staging&enverr=exists",
  );
  res = await post("/p/rhystic/envs", { env: "Bad Env" });
  assertEquals(location(res).searchParams.get("enverr"), "invalid");
  const page = await (await req("/p/rhystic/settings?env=staging&enverr=exists")).text();
  assertStringIncludes(page, `value="staging"`);
  assertStringIncludes(page, `aria-invalid="true"`);
  assertStringIncludes(page, `<code>staging</code> already exists.`);

  // The typed confirmation is checked on the server too.
  res = await post("/p/rhystic/envs/delete", { env: "staging", confirm: "stag" });
  assertEquals(location(res).pathname, "/p/rhystic/envs/delete");
  assertEquals(location(res).searchParams.get("mismatch"), "1");
  assert(vault.getProject(root, "rhystic").environments.includes("staging"));
  res = await post("/p/rhystic/envs/delete", {}); // no env: a 400 flash, not a crash
  assertEquals(res.status, 303);
  assert(vault.getProject(root, "rhystic").environments.includes("staging"));

  res = await post("/p/rhystic/envs/delete", { env: "staging", confirm: "staging" });
  assertEquals(location(res).searchParams.get("msg"), "Environment deleted: staging");
  assertEquals(vault.getProject(root, "rhystic").environments, ["dev", "prod"]);
});

Deno.test("web settings: no-JS environment confirm page", async () => {
  const { req } = setup();
  const page = await (await req("/p/rhystic/envs/delete?env=prod")).text();
  assertStringIncludes(page, `action="/p/rhystic/envs/delete"`);
  assertStringIncludes(page, `<input type="hidden" name="env" value="prod">`);
  assertStringIncludes(page, `name="confirm"`);
  assertEquals((await req("/p/rhystic/envs/delete?env=nope")).status, 404);
});

Deno.test("web settings: delete project needs the slug", async () => {
  const { vault, root, req, post, location } = setup();
  let res = await post("/p/rhystic/delete", { confirm: "nope" });
  assertEquals(res.headers.get("location"), "/p/rhystic/settings?mismatch=1");
  const page = await (await req("/p/rhystic/settings?mismatch=1")).text();
  assertStringIncludes(page, "That doesn&#39;t match");
  res = await post("/p/rhystic/delete", { confirm: "rhystic" });
  assertEquals(location(res).pathname, "/");
  assertEquals(location(res).searchParams.get("msg"), "Project deleted: rhystic");
  assertEquals(vault.listProjects(root).length, 0);
});

Deno.test("web settings: project keys get 403 and cannot change environments", async () => {
  const { vault, root, req, post } = setup();
  const { token } = vault.createKey(root, { name: "agent", role: "readwrite", project: "rhystic" });
  for (const path of ["/p/rhystic/settings", "/p/rhystic/envs/delete?env=dev"]) {
    const res = await req(path, { as: token });
    assertEquals(res.status, 403, path);
    assertStringIncludes(await res.text(), "admin key required");
  }
  const cookie = { cookie: `hv_token=${token}` };
  await post("/p/rhystic/envs", { env: "qa" }, cookie);
  await post("/p/rhystic/envs/delete", { env: "dev", confirm: "dev" }, cookie);
  await post("/p/rhystic/delete", { confirm: "rhystic" }, cookie);
  assertEquals(vault.getProject(root, "rhystic").environments, ["dev", "prod"]);
});
