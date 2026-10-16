import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { DatabaseSync } from "node:sqlite";
import { createApp } from "../main.ts";
import { generateMasterKey, parseMasterKey } from "../src/crypto.ts";
import { Vault, VaultError } from "../src/vault.ts";

function setup() {
  const db = `${Deno.makeTempDirSync()}/v.db`;
  const vault = new Vault(db, parseMasterKey(generateMasterKey()));
  const token = vault.bootstrapAdminKey("root");
  const root = vault.authenticate(token)!;
  vault.createProject(root, { slug: "rhystic", environments: ["dev", "prod"] });
  vault.createProject(root, { slug: "woody" });
  const app = createApp(vault);
  const req = (path: string, as = token) =>
    app.request(path, { headers: { cookie: `hv_token=${as}` } });
  const html = async (path: string) => await (await req(path)).text();
  return { db, vault, root, req, html };
}

const status = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    if (e instanceof VaultError) return e.status;
    throw e;
  }
  return 200;
};

Deno.test("audit: filters by project, actor, and action prefixes", () => {
  const { vault, root } = setup();
  const { token } = vault.createKey(root, { name: "ci", role: "readwrite", project: "rhystic" });
  const ci = vault.authenticate(token)!;
  vault.setSecret(ci, "rhystic", "dev", "/", "A", "1");
  vault.getSecret(ci, "rhystic", "dev", "/", "A");
  vault.setSecret(root, "woody", "dev", "/", "B", "2");

  const actions = (q: Parameters<Vault["listAudit"]>[1]) =>
    vault.listAudit(root, q).map((e) => e.action);
  assertEquals(actions({ actor: "ci" }), ["secret.read", "secret.create"]);
  assertEquals(actions({ project: "woody" }), ["secret.create", "project.create"]);
  assertEquals(actions({ actions: ["key."] }), ["key.create(readwrite)", "key.create"]);
  assertEquals(actions({ project: "rhystic", actions: ["secret.read", "secret.create"] }), [
    "secret.read",
    "secret.create",
  ]);
  // Prefixes are compared literally, not as LIKE patterns.
  assertEquals(actions({ actions: ["secret_"] }), []);
  assertEquals(actions({ actor: "nobody" }), []);
  assertEquals(vault.countAudit(root, { project: "rhystic" }), 4);
  assertEquals(vault.countAudit(root), 7);
  // Exclusions: everything but folder listings.
  vault.listSecrets(ci, "rhystic", "dev", "/");
  vault.listSecrets(ci, "rhystic", "dev", "/", { recursive: true });
  assertEquals(vault.countAudit(root), 9);
  assertEquals(vault.countAudit(root, { except: ["secrets.list"] }), 7);
  assertEquals(actions({ actor: "ci", except: ["secrets.list"] }), [
    "secret.read",
    "secret.create",
  ]);
});

Deno.test("audit: before/after paging stays newest first", () => {
  const { vault, root } = setup();
  for (let i = 0; i < 10; i++) vault.setSecret(root, "rhystic", "dev", "/", `K${i}`, "v");
  const keys = (es: { key: string | null }[]) => es.map((e) => e.key);
  const first = vault.listAudit(root, { project: "rhystic", limit: 4 });
  assertEquals(keys(first), ["K9", "K8", "K7", "K6"]);
  const second = vault.listAudit(root, { project: "rhystic", before: first[3].id, limit: 4 });
  assertEquals(keys(second), ["K5", "K4", "K3", "K2"]);
  const back = vault.listAudit(root, { project: "rhystic", after: second[0].id, limit: 4 });
  assertEquals(keys(back), keys(first));
  assertEquals(vault.countAudit(root, { project: "rhystic", after: second[0].id }), 4);
  assertEquals(vault.listAudit(root, { limit: Number("x") }).length, 13); // bad limit → default
  assertEquals(vault.listAudit(root, { limit: 0 }).length, 1); // clamped, as before
  assertEquals(vault.listAudit(root, { limit: 2.5 }).length, 2);
});

Deno.test("audit: admin only, in the vault and on the page", async () => {
  const { vault, root, req } = setup();
  const { token } = vault.createKey(root, { name: "r", role: "read", project: "rhystic" });
  const reader = vault.authenticate(token)!;
  assertEquals(status(() => vault.listAudit(reader, { project: "rhystic" })), 403);
  assertEquals(status(() => vault.countAudit(reader, { project: "rhystic" })), 403);
  const res = await req("/audit?project=rhystic", token);
  assertEquals(res.status, 403);
  assertStringIncludes(await res.text(), "admin key required");
});

Deno.test("web audit: readable rows, never values", async () => {
  const { vault, root, html } = setup();
  vault.setSecret(root, "rhystic", "prod", "/backend", "DATABASE_URL", "postgres://s3cret");
  vault.getSecret(root, "rhystic", "prod", "/backend", "DATABASE_URL");
  vault.listSecrets(root, "rhystic", "dev", "/", { recursive: true });
  vault.setSecrets(root, "woody", "dev", "/", { A: "1", B: "2" });
  const page = await html("/audit?action=all");
  assertEquals(page.includes("s3cret"), false);
  assertStringIncludes(page, `aria-current="page"`);
  assertStringIncludes(page, ">Read</span>");
  assertStringIncludes(page, `/<wbr>backend/</span><wbr>DATABASE_<wbr>URL`); // folder, then KEY
  assertStringIncludes(page, "/<wbr>**"); // a recursive list covers the folder and below
  assertStringIncludes(page, "2 added in");
  // In rows the project link filters the log, and says so.
  assertStringIncludes(page, `href="/audit?project=rhystic&amp;action=all"`);
  assertStringIncludes(page, `aria-label="Show only rhystic"`);
  assertStringIncludes(page, `title="${new Date().toISOString().slice(0, 10)}`); // exact time on hover
});

Deno.test("web audit: project view, filters, no match, and paging", async () => {
  const { vault, root, req, html } = setup();
  for (let i = 0; i < 60; i++) vault.setSecret(root, "rhystic", "dev", "/", `K${i}`, "v");

  const project = await html("/audit?project=rhystic");
  assertStringIncludes(project, `Activity in <a href="/p/rhystic"><code>rhystic</code></a>`);
  assertStringIncludes(project, `<option value="rhystic" selected>rhystic</option>`);
  assertStringIncludes(project, "Showing 1–50 of 61");
  assertStringIncludes(project, `href="/audit?project=rhystic&amp;before=`);
  assertStringIncludes(project, `Clear <span class="hide-sm">filters</span>`);

  const id = Number(/before=(\d+)/.exec(project)![1]);
  const older = await html(`/audit?project=rhystic&before=${id}`);
  assertStringIncludes(older, "Showing 51–61 of 61");
  assertStringIncludes(older, `href="/audit?project=rhystic" rel="prev"`);

  const res = await req("/audit?project=&actor=root&action=");
  assertEquals(res.headers.get("location"), "/audit?actor=root");

  const changes = await html("/audit?action=changes&actor=root");
  assertStringIncludes(changes, `<option value="changes" selected>Changes</option>`);
  assertStringIncludes(changes, `<option value="root" selected>root</option>`);

  const none = await html("/audit?project=woody&action=reads");
  assertStringIncludes(none, "No matching activity");
  assertEquals(none.includes("<table"), false);

  // A deleted project's history stays reachable, and the filter keeps showing it.
  vault.deleteProject(root, "woody");
  const gone = await html("/audit?project=woody");
  assertStringIncludes(gone, `<option value="woody" selected>woody (deleted)</option>`);
  assertStringIncludes(gone, "<code>woody</code> (deleted)");
  assertStringIncludes(gone, "Deleted project");
  assert(!gone.includes(`href="/p/woody"`));
  // A project-level event in its own project's view still names the project.
  assertStringIncludes(gone, "<code>woody</code></div>");

  // A slug that never existed is not presented as a project.
  const unknown = await html("/audit?project=nope");
  assertStringIncludes(unknown, "No activity for <code>nope</code>");
  assertEquals(unknown.includes("Activity in"), false);
  // The select states the filter honestly, so Apply keeps it.
  assertStringIncludes(unknown, `<option value="nope" selected>nope (not in log)</option>`);

  // Unknown actions and bad cursors redirect to the clean URL.
  const loc = async (path: string) => (await req(path)).headers.get("location");
  assertEquals(await loc("/audit?action=bogus&actor=root"), "/audit?actor=root");
  assertEquals(await loc("/audit?action=toString"), "/audit");
  assertEquals(await loc("/audit?after=0"), "/audit");
  assertEquals(await loc("/audit?before=x&project=rhystic"), "/audit?project=rhystic");
  assertEquals((await req("/audit?project=rhystic&action=changes")).status, 200);
  // A cursor past either end goes to the newest page of the same view.
  assertEquals(await loc("/audit?project=rhystic&before=1"), "/audit?project=rhystic");
  assertEquals(await loc("/audit?after=99999999&actor=root"), "/audit?actor=root");
});

Deno.test("audit: facets list every logged project and actor, admin only", () => {
  const { vault, root } = setup();
  const { token } = vault.createKey(root, { name: "ci", role: "read", project: "rhystic" });
  const ci = vault.authenticate(token)!;
  vault.deleteProject(root, "woody");
  assertEquals(vault.auditFacets(root), {
    projects: ["rhystic", "woody"],
    actors: ["bootstrap", "root"],
  });
  assertEquals(status(() => vault.auditFacets(ci)), 403);
});

Deno.test("web audit: day groups, times of day, collapsed listings, key events", async () => {
  const { vault, root, html } = setup();
  for (let i = 0; i < 12; i++) vault.listSecrets(root, "rhystic", "dev", "/");
  // Listings are opt-in: the default view is reads and changes.
  const def = await html("/audit");
  assertEquals(def.includes(">Listed<"), false);
  const page = await html("/audit?action=lists");
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  assertStringIncludes(page, `>${today}</time>`); // "Fri, Oct 16": no relative "Today"
  assertStringIncludes(
    page,
    `<span aria-hidden="true">×12</span><span class="sr-only">12 times</span>`,
  );
  assertEquals(page.match(/>Listed</g)?.length, 2); // the desktop cell and the mobile line
  assertStringIncludes(page, "/<wbr>*<"); // a plain list covers the folder's keys
  // Exact times of day with seconds, visible without hover.
  assert(/<time class="tnum" datetime="[^"]+" title="[^"]+ UTC">\d\d:\d\d:\d\d</.test(page));
  assertEquals(page.includes("just now"), false);
  // An API key reads as a key (icon, sans name, role), not as a secret KEY.
  assertStringIncludes(def, `<span class="apikey">`);
  assertStringIncludes(def, ">bootstrap<");
});

Deno.test("web audit: reads are never collapsed, and lists-only logs say so", async () => {
  const { db, vault, root, html } = setup();
  new DatabaseSync(db).exec("delete from audit");
  vault.listSecrets(root, "rhystic", "dev", "/");
  const lists = await html("/audit");
  assertStringIncludes(lists, "No reads or changes yet");
  assertStringIncludes(lists, `href="/audit?action=all"`);

  vault.setSecret(root, "rhystic", "dev", "/", "PEM", "x");
  for (let i = 0; i < 5; i++) vault.getSecret(root, "rhystic", "dev", "/", "PEM");
  const reads = await html("/audit?action=reads");
  assertEquals(reads.match(/>Read</g)?.length, 10); // five rows, desktop + mobile each
  assertEquals(reads.includes("×"), false);
});

Deno.test("web audit: empty log", async () => {
  const { db, html } = setup();
  new DatabaseSync(db).exec("delete from audit");
  const page = await html("/audit");
  assertStringIncludes(page, "No activity yet");
  assertEquals(page.includes("<select"), false);
});
