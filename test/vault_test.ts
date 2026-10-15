import { assertEquals, assertThrows } from "@std/assert";
import { DatabaseSync } from "node:sqlite";
import { generateMasterKey, parseMasterKey } from "../src/crypto.ts";
import { formatDotenv, parseDotenv } from "../src/dotenv.ts";
import { normalizePath, type Principal, Vault, VaultError } from "../src/vault.ts";

function setup() {
  const dir = Deno.makeTempDirSync();
  const db = `${dir}/vault.db`;
  const key = parseMasterKey(generateMasterKey());
  const vault = new Vault(db, key);
  const admin = vault.authenticate(vault.bootstrapAdminKey("root"))!;
  return { dir, db, key, vault, admin };
}

function keyFor(vault: Vault, admin: Principal, role: "read" | "readwrite", project: string) {
  return vault.authenticate(
    vault.createKey(admin, { name: `${project}-${role}`, role, project }).token,
  )!;
}

function status(fn: () => unknown): number {
  try {
    fn();
  } catch (e) {
    if (e instanceof VaultError) return e.status;
    throw e;
  }
  return 0;
}

Deno.test("secrets round-trip through env + path, values encrypted at rest", () => {
  const { vault, admin, db } = setup();
  vault.createProject(admin, { slug: "rhystic", environments: ["dev", "prod"] });
  vault.setSecret(admin, "rhystic", "dev", "/", "API_KEY", "dev-root");
  vault.setSecret(admin, "rhystic", "dev", "/backend/", "API_KEY", "dev-backend");
  vault.setSecret(admin, "rhystic", "prod", "/", "API_KEY", "prod-root");

  assertEquals(vault.getSecret(admin, "rhystic", "dev", "/", "API_KEY").value, "dev-root");
  assertEquals(vault.getSecret(admin, "rhystic", "dev", "backend", "API_KEY").value, "dev-backend");
  assertEquals(vault.listSecrets(admin, "rhystic", "dev", "/").map((s) => s.value), ["dev-root"]);
  assertEquals(
    vault.listSecrets(admin, "rhystic", "dev", "/", { recursive: true }).map((s) => s.path),
    ["/", "/backend"],
  );
  assertEquals(vault.listPaths(admin, "rhystic", "dev"), ["/", "/backend"]);
  vault.close();

  const raw = new DatabaseSync(db).prepare("select ciphertext from secrets").all() as {
    ciphertext: Uint8Array;
  }[];
  for (const r of raw) {
    const text = new TextDecoder().decode(r.ciphertext);
    assertEquals(text.includes("dev-root") || text.includes("prod-root"), false);
  }
});

Deno.test("wrong master key is refused at startup", () => {
  const { db, vault } = setup();
  vault.close();
  assertThrows(() => new Vault(db, parseMasterKey(generateMasterKey())), Error, "master key");
});

Deno.test("read keys read only their own project", () => {
  const { vault, admin } = setup();
  vault.createProject(admin, { slug: "a" });
  vault.createProject(admin, { slug: "b" });
  vault.setSecret(admin, "a", "dev", "/", "X", "1");
  vault.setSecret(admin, "b", "dev", "/", "Y", "2");
  const reader = keyFor(vault, admin, "read", "a");

  assertEquals(vault.listProjects(reader).map((p) => p.slug), ["a"]);
  assertEquals(vault.getSecret(reader, "a", "dev", "/", "X").value, "1");
  assertEquals(status(() => vault.listSecrets(reader, "b", "dev", "/")), 404);
  assertEquals(status(() => vault.setSecret(reader, "a", "dev", "/", "X", "2")), 403);
  assertEquals(status(() => vault.deleteSecret(reader, "a", "dev", "/", "X")), 403);
  assertEquals(
    status(() => vault.createKey(reader, { name: "n", role: "read", project: "a" })),
    403,
  );
  assertEquals(status(() => vault.addEnvironment(reader, "a", "prod")), 403);
});

Deno.test("readwrite keys write secrets but cannot manage the project", () => {
  const { vault, admin } = setup();
  vault.createProject(admin, { slug: "a" });
  vault.createProject(admin, { slug: "b" });
  const writer = keyFor(vault, admin, "readwrite", "a");

  assertEquals(vault.setSecret(writer, "a", "dev", "/", "X", "1"), "created");
  assertEquals(vault.setSecret(writer, "a", "dev", "/", "X", "2"), "updated");
  assertEquals(vault.getSecret(writer, "a", "dev", "/", "X").updatedBy, "a-readwrite");
  assertEquals(status(() => vault.setSecret(writer, "b", "dev", "/", "X", "1")), 404);
  assertEquals(status(() => vault.deleteProject(writer, "a")), 403);
  assertEquals(status(() => vault.listKeys(writer)), 403);
  assertEquals(status(() => vault.listAudit(writer)), 403);
});

Deno.test("revoked keys stop authenticating; last admin key cannot be revoked", () => {
  const { vault, admin } = setup();
  vault.createProject(admin, { slug: "a" });
  const { key, token } = vault.createKey(admin, { name: "agent", role: "read", project: "a" });
  vault.revokeKey(admin, key.id);
  assertEquals(vault.authenticate(token), null);
  assertEquals(status(() => vault.revokeKey(admin, admin.keyId)), 409);
});

Deno.test("bulk set with replace deletes only keys at that path", () => {
  const { vault, admin } = setup();
  vault.createProject(admin, { slug: "a" });
  vault.setSecrets(admin, "a", "dev", "/", { A: "1", B: "2" });
  vault.setSecret(admin, "a", "dev", "/sub", "C", "3");
  const r = vault.setSecrets(admin, "a", "dev", "/", { A: "9", D: "4" }, { replace: true });
  assertEquals(r, { created: 1, updated: 1, deleted: 1 });
  assertEquals(
    vault.listSecrets(admin, "a", "dev", "/", { recursive: true }).map((s) => `${s.path}:${s.key}`),
    ["/:A", "/:D", "/sub:C"],
  );
});

Deno.test("validation: unknown env, bad keys, bad paths, key/role consistency", () => {
  const { vault, admin } = setup();
  vault.createProject(admin, { slug: "a" });
  assertEquals(status(() => vault.setSecret(admin, "a", "prod", "/", "X", "1")), 404);
  assertEquals(status(() => vault.setSecret(admin, "a", "dev", "/", "BAD KEY", "1")), 400);
  assertEquals(status(() => normalizePath("/../etc")), 400);
  assertEquals(status(() => vault.createKey(admin, { name: "x", role: "read" })), 400);
  assertEquals(
    status(() => vault.createKey(admin, { name: "x", role: "admin", project: "a" })),
    400,
  );
  assertEquals(status(() => vault.createProject(admin, { slug: "a" })), 409);
});

Deno.test("deleting an environment removes its secrets", () => {
  const { vault, admin } = setup();
  vault.createProject(admin, { slug: "a", environments: ["dev", "staging"] });
  vault.setSecret(admin, "a", "staging", "/", "X", "1");
  vault.deleteEnvironment(admin, "a", "staging");
  vault.addEnvironment(admin, "a", "staging");
  assertEquals(vault.listSecrets(admin, "a", "staging", "/"), []);
});

Deno.test("dotenv format round-trips awkward values", () => {
  const values = {
    PLAIN: "abc",
    SPACES: "a b c",
    DOLLAR: "pa$$word",
    SINGLE: "it's",
    MIXED: `it's "quoted" $HOME \`tick\` back\\slash`,
    MULTI: "line1\nline2",
    EMPTY: "",
    URL: "postgres://u:p@h:5432/db?sslmode=require#frag",
  };
  const text = formatDotenv(Object.entries(values).map(([key, value]) => ({ key, value })));
  assertEquals(parseDotenv(text), values);
});

Deno.test("dotenv parser handles common .env shapes", () => {
  assertEquals(
    parseDotenv(`# comment\nexport A=1\nB = two # trailing\nC="x\\ny"\nD='raw\\n'\n\nE=`),
    { A: "1", B: "two", C: "x\ny", D: "raw\\n", E: "" },
  );
});
