import { DatabaseSync } from "node:sqlite";
import { Cipher, generateToken, hashToken, tokenHint } from "./crypto.ts";

export type Role = "admin" | "read" | "readwrite";

/** Who is calling: resolved from an API token. Every Vault operation is checked against it. */
export interface Principal {
  keyId: number;
  name: string;
  role: Role;
  /** Project slug for project-scoped keys; null for admin keys. */
  project: string | null;
}

export interface Project {
  slug: string;
  name: string;
  environments: string[];
  createdAt: string;
}

export interface Secret {
  key: string;
  value: string;
  path: string;
  updatedAt: string;
  updatedBy: string | null;
}

export interface ApiKey {
  id: number;
  name: string;
  role: Role;
  project: string | null;
  hint: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export interface AuditEntry {
  id: number;
  at: string;
  actor: string;
  action: string;
  project: string | null;
  env: string | null;
  path: string | null;
  key: string | null;
}

export interface AuditQuery {
  project?: string;
  actor?: string;
  /** Action prefixes, any of which may match: `["key."]` finds key.create(read) and key.revoke. */
  actions?: string[];
  /** Action prefixes to leave out: `["secrets.list"]` hides folder listings. */
  except?: string[];
  before?: number;
  after?: number;
}

/** The parameterised where clause for an AuditQuery. */
function auditWhere(q: AuditQuery): [string, (string | number)[]] {
  const where: string[] = [];
  const args: (string | number)[] = [];
  const add = (sql: string, ...values: (string | number)[]) => {
    where.push(sql);
    args.push(...values);
  };
  if (q.project) add("project = ?", q.project);
  if (q.actor) add("actor = ?", q.actor);
  if (q.actions?.length) {
    add(
      `(${q.actions.map(() => "substr(action, 1, ?) = ?").join(" or ")})`,
      ...q.actions.flatMap((a) => [a.length, a]),
    );
  }
  for (const a of q.except ?? []) add("substr(action, 1, ?) <> ?", a.length, a);
  if (q.before !== undefined) add("id < ?", q.before);
  if (q.after !== undefined) add("id > ?", q.after);
  return [where.length ? ` where ${where.join(" and ")}` : "", args];
}

export class VaultError extends Error {
  constructor(readonly status: 400 | 401 | 403 | 404 | 409, message: string) {
    super(message);
  }
}

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;
const KEY_RE = /^[A-Za-z_][A-Za-z0-9_.-]{0,255}$/;
const PATH_SEGMENT_RE = /^[A-Za-z0-9_.-]+$/;
const CANARY = "heka-vault-canary";

const SCHEMA = `
pragma foreign_keys = on;
create table if not exists meta (k text primary key, v blob not null);
create table if not exists projects (
  id integer primary key,
  slug text not null unique,
  name text not null,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
create table if not exists environments (
  project_id integer not null references projects(id) on delete cascade,
  slug text not null,
  primary key (project_id, slug)
);
create table if not exists secrets (
  id integer primary key,
  project_id integer not null,
  env text not null,
  path text not null,
  key text not null,
  nonce blob not null,
  ciphertext blob not null,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_by text,
  unique (project_id, env, path, key),
  foreign key (project_id, env) references environments(project_id, slug) on delete cascade
);
create table if not exists api_keys (
  id integer primary key,
  name text not null,
  role text not null check (role in ('admin','read','readwrite')),
  project_id integer references projects(id) on delete cascade,
  token_hash text not null unique,
  hint text not null,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  last_used_at text,
  revoked_at text,
  check ((role = 'admin') = (project_id is null))
);
create table if not exists audit (
  id integer primary key,
  at text not null default (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  actor text not null,
  action text not null,
  project text,
  env text,
  path text,
  key text
);
create index if not exists audit_project on audit(project, id);
create index if not exists audit_actor on audit(actor, id);
`;

/** Normalize a folder path to "/" or "/a/b" (no trailing slash). */
export function normalizePath(path: string | undefined | null): string {
  const segments = (path ?? "/").split("/").filter(Boolean);
  for (const s of segments) {
    if (!PATH_SEGMENT_RE.test(s) || s === "." || s === "..") {
      throw new VaultError(400, `invalid path segment: ${s}`);
    }
  }
  return "/" + segments.join("/");
}

export class Vault {
  readonly #db: DatabaseSync;
  readonly #cipher: Cipher;

  constructor(dbPath: string, masterKey: Uint8Array) {
    this.#db = new DatabaseSync(dbPath);
    this.#db.exec("pragma journal_mode = wal; pragma busy_timeout = 5000;");
    this.#db.exec(SCHEMA);
    this.#cipher = new Cipher(masterKey);
    this.#checkMasterKey();
  }

  close(): void {
    this.#db.close();
  }

  /** Refuse to start with a master key that doesn't match the one the DB was created with. */
  #checkMasterKey(): void {
    const row = this.#db.prepare("select v from meta where k = 'canary'").get() as
      | { v: Uint8Array }
      | undefined;
    if (!row) {
      const { nonce, ciphertext } = this.#cipher.encrypt(CANARY, "canary");
      const blob = new Uint8Array(nonce.length + ciphertext.length);
      blob.set(nonce);
      blob.set(ciphertext, nonce.length);
      this.#db.prepare("insert into meta (k, v) values ('canary', ?)").run(blob);
      return;
    }
    try {
      const v = this.#cipher.decrypt(row.v.subarray(0, 12), row.v.subarray(12), "canary");
      if (v !== CANARY) throw new Error();
    } catch {
      throw new Error("master key does not match this database");
    }
  }

  // ---------- auth ----------

  authenticate(token: string | null | undefined): Principal | null {
    if (!token) return null;
    const row = this.#db.prepare(
      `select k.id, k.name, k.role, p.slug as project from api_keys k
       left join projects p on p.id = k.project_id
       where k.token_hash = ? and k.revoked_at is null`,
    ).get(hashToken(token)) as
      | { id: number; name: string; role: Role; project: string | null }
      | undefined;
    if (!row) return null;
    this.#db.prepare(
      "update api_keys set last_used_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') where id = ?",
    ).run(row.id);
    return { keyId: row.id, name: row.name, role: row.role, project: row.project };
  }

  /** Create an admin key without a caller. Only for CLI bootstrap on the server itself. */
  bootstrapAdminKey(name: string): string {
    const token = generateToken();
    this.#db.prepare(
      "insert into api_keys (name, role, project_id, token_hash, hint) values (?, 'admin', null, ?, ?)",
    ).run(name, hashToken(token), tokenHint(token));
    this.#audit("bootstrap", "key.create", { key: name });
    return token;
  }

  // ---------- projects ----------

  listProjects(who: Principal): Project[] {
    const rows = this.#db.prepare(
      "select id, slug, name, created_at from projects order by slug",
    ).all() as { id: number; slug: string; name: string; created_at: string }[];
    return rows
      .filter((r) => who.role === "admin" || who.project === r.slug)
      .map((r) => this.#toProject(r));
  }

  getProject(who: Principal, slug: string): Project {
    const p = this.#project(who, slug, "read");
    return this.#toProject(p);
  }

  createProject(
    who: Principal,
    input: { slug: string; name?: string; environments?: string[] },
  ): Project {
    this.#requireAdmin(who);
    if (!SLUG_RE.test(input.slug)) throw new VaultError(400, "invalid project slug");
    const envs = input.environments?.length ? input.environments : ["dev"];
    for (const e of envs) if (!SLUG_RE.test(e)) throw new VaultError(400, `invalid env: ${e}`);
    if (this.#db.prepare("select 1 from projects where slug = ?").get(input.slug)) {
      throw new VaultError(409, "project already exists");
    }
    this.#tx(() => {
      const { lastInsertRowid } = this.#db.prepare(
        "insert into projects (slug, name) values (?, ?)",
      ).run(input.slug, input.name?.trim() || input.slug);
      for (const e of new Set(envs)) {
        this.#db.prepare("insert into environments (project_id, slug) values (?, ?)")
          .run(lastInsertRowid, e);
      }
    });
    this.#audit(who.name, "project.create", { project: input.slug });
    return this.getProject(who, input.slug);
  }

  deleteProject(who: Principal, slug: string): void {
    this.#requireAdmin(who);
    const p = this.#project(who, slug, "read");
    this.#db.prepare("delete from projects where id = ?").run(p.id);
    this.#audit(who.name, "project.delete", { project: slug });
  }

  addEnvironment(who: Principal, slug: string, env: string): void {
    this.#requireAdmin(who);
    if (!SLUG_RE.test(env)) throw new VaultError(400, "invalid env");
    const p = this.#project(who, slug, "read");
    const res = this.#db.prepare(
      "insert or ignore into environments (project_id, slug) values (?, ?)",
    ).run(p.id, env);
    if (res.changes === 0) throw new VaultError(409, "environment already exists");
    this.#audit(who.name, "env.create", { project: slug, env });
  }

  /** Deletes the environment and every secret in it. */
  deleteEnvironment(who: Principal, slug: string, env: string): void {
    this.#requireAdmin(who);
    const p = this.#project(who, slug, "read");
    this.#env(p, env);
    this.#db.prepare("delete from environments where project_id = ? and slug = ?").run(p.id, env);
    this.#audit(who.name, "env.delete", { project: slug, env });
  }

  // ---------- secrets ----------

  /** Distinct folder paths that hold secrets in an environment. Always includes "/". */
  listPaths(who: Principal, slug: string, env: string): string[] {
    const p = this.#project(who, slug, "read");
    this.#env(p, env);
    const rows = this.#db.prepare(
      "select distinct path from secrets where project_id = ? and env = ? order by path",
    ).all(p.id, env) as { path: string }[];
    return [...new Set(["/", ...rows.map((r) => r.path)])];
  }

  listSecrets(
    who: Principal,
    slug: string,
    env: string,
    path: string,
    opts: { recursive?: boolean } = {},
  ): Secret[] {
    const p = this.#project(who, slug, "read");
    this.#env(p, env);
    const norm = normalizePath(path);
    const rows = (opts.recursive
      ? this.#db.prepare(
        `select * from secrets where project_id = ? and env = ?
         and (path = ? or path like ? escape '\\') order by path, key`,
      ).all(p.id, env, norm, likePrefix(norm))
      : this.#db.prepare(
        "select * from secrets where project_id = ? and env = ? and path = ? order by key",
      ).all(p.id, env, norm)) as unknown as SecretRow[];
    this.#audit(who.name, opts.recursive ? "secrets.list.recursive" : "secrets.list", {
      project: slug,
      env,
      path: norm,
    });
    return rows.map((r) => this.#toSecret(slug, r));
  }

  getSecret(who: Principal, slug: string, env: string, path: string, key: string): Secret {
    const p = this.#project(who, slug, "read");
    this.#env(p, env);
    const norm = normalizePath(path);
    const row = this.#db.prepare(
      "select * from secrets where project_id = ? and env = ? and path = ? and key = ?",
    ).get(p.id, env, norm, key) as unknown as SecretRow | undefined;
    if (!row) throw new VaultError(404, "secret not found");
    this.#audit(who.name, "secret.read", { project: slug, env, path: norm, key });
    return this.#toSecret(slug, row);
  }

  setSecret(
    who: Principal,
    slug: string,
    env: string,
    path: string,
    key: string,
    value: string,
  ): "created" | "updated" {
    const p = this.#project(who, slug, "write");
    this.#env(p, env);
    const norm = normalizePath(path);
    const result = this.#upsert(p.id, env, norm, key, value, who.name);
    this.#audit(who.name, `secret.${result === "created" ? "create" : "update"}`, {
      project: slug,
      env,
      path: norm,
      key,
    });
    return result;
  }

  /** Upsert many secrets at one path. With `replace`, keys at that path not in `values` are deleted. */
  setSecrets(
    who: Principal,
    slug: string,
    env: string,
    path: string,
    values: Record<string, string>,
    opts: { replace?: boolean } = {},
  ): { created: number; updated: number; deleted: number } {
    const p = this.#project(who, slug, "write");
    this.#env(p, env);
    const norm = normalizePath(path);
    const counts = { created: 0, updated: 0, deleted: 0 };
    this.#tx(() => {
      for (const [k, v] of Object.entries(values)) {
        counts[this.#upsert(p.id, env, norm, k, v, who.name)]++;
      }
      if (opts.replace) {
        const keep = Object.keys(values);
        const existing = this.#db.prepare(
          "select key from secrets where project_id = ? and env = ? and path = ?",
        ).all(p.id, env, norm) as { key: string }[];
        for (const { key } of existing) {
          if (keep.includes(key)) continue;
          this.#db.prepare(
            "delete from secrets where project_id = ? and env = ? and path = ? and key = ?",
          ).run(p.id, env, norm, key);
          counts.deleted++;
        }
      }
    });
    this.#audit(
      who.name,
      `secrets.bulk(+${counts.created} ~${counts.updated} -${counts.deleted})`,
      { project: slug, env, path: norm },
    );
    return counts;
  }

  deleteSecret(who: Principal, slug: string, env: string, path: string, key: string): void {
    const p = this.#project(who, slug, "write");
    this.#env(p, env);
    const norm = normalizePath(path);
    const res = this.#db.prepare(
      "delete from secrets where project_id = ? and env = ? and path = ? and key = ?",
    ).run(p.id, env, norm, key);
    if (res.changes === 0) throw new VaultError(404, "secret not found");
    this.#audit(who.name, "secret.delete", { project: slug, env, path: norm, key });
  }

  // ---------- api keys ----------

  /** Admin: all keys, or one project's keys. */
  listKeys(who: Principal, project?: string): ApiKey[] {
    this.#requireAdmin(who);
    const rows = (project
      ? this.#db.prepare(
        `select k.*, p.slug as project from api_keys k join projects p on p.id = k.project_id
         where p.slug = ? order by k.revoked_at is not null, k.id`,
      ).all(project)
      : this.#db.prepare(
        `select k.*, p.slug as project from api_keys k left join projects p on p.id = k.project_id
         order by k.revoked_at is not null, p.slug is not null, p.slug, k.id`,
      ).all()) as unknown as KeyRow[];
    return rows.map(toApiKey);
  }

  /** Returns the plaintext token. It is never stored and cannot be shown again. */
  createKey(
    who: Principal,
    input: { name: string; role: Role; project?: string | null },
  ): { key: ApiKey; token: string } {
    this.#requireAdmin(who);
    const name = input.name?.trim();
    if (!name) throw new VaultError(400, "name is required");
    if (!["admin", "read", "readwrite"].includes(input.role)) {
      throw new VaultError(400, "role must be admin, read, or readwrite");
    }
    let projectId: number | null = null;
    if (input.role === "admin") {
      if (input.project) throw new VaultError(400, "admin keys are not project-scoped");
    } else {
      if (!input.project) throw new VaultError(400, "project is required for read/readwrite keys");
      projectId = this.#project(who, input.project, "read").id;
    }
    const token = generateToken();
    const { lastInsertRowid } = this.#db.prepare(
      "insert into api_keys (name, role, project_id, token_hash, hint) values (?, ?, ?, ?, ?)",
    ).run(name, input.role, projectId, hashToken(token), tokenHint(token));
    this.#audit(who.name, `key.create(${input.role})`, {
      project: input.project ?? null,
      key: name,
    });
    const row = this.#db.prepare(
      `select k.*, p.slug as project from api_keys k left join projects p on p.id = k.project_id
       where k.id = ?`,
    ).get(lastInsertRowid) as unknown as KeyRow;
    return { key: toApiKey(row), token };
  }

  revokeKey(who: Principal, id: number): void {
    this.#requireAdmin(who);
    const row = this.#db.prepare(
      `select k.*, p.slug as project from api_keys k left join projects p on p.id = k.project_id
       where k.id = ?`,
    ).get(id) as unknown as KeyRow | undefined;
    if (!row) throw new VaultError(404, "key not found");
    if (row.revoked_at) throw new VaultError(409, "key already revoked");
    if (row.role === "admin") {
      const { n } = this.#db.prepare(
        "select count(*) as n from api_keys where role = 'admin' and revoked_at is null",
      ).get() as { n: number };
      if (n <= 1) throw new VaultError(409, "cannot revoke the last admin key");
    }
    this.#db.prepare(
      "update api_keys set revoked_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') where id = ?",
    ).run(id);
    this.#audit(who.name, "key.revoke", { project: row.project, key: row.name });
  }

  // ---------- audit ----------

  /**
   * Audit entries, newest first. Paged by id: `before` gives the entries older than an id, `after`
   * the `limit` entries just newer than it (still returned newest first).
   */
  listAudit(who: Principal, opts: AuditQuery & { limit?: number } = {}): AuditEntry[] {
    this.#requireAdmin(who);
    const n = Number(opts.limit ?? 200);
    const limit = Number.isFinite(n) ? Math.min(Math.max(Math.trunc(n), 1), 1000) : 200;
    const [where, args] = auditWhere(opts);
    const order = opts.after === undefined ? "desc" : "asc";
    const rows = this.#db.prepare(`select * from audit${where} order by id ${order} limit ?`)
      .all(...args, limit) as unknown as AuditEntry[];
    return order === "asc" ? rows.reverse() : rows;
  }

  /** How many audit entries match (the same filters as listAudit). */
  countAudit(who: Principal, opts: AuditQuery = {}): number {
    this.#requireAdmin(who);
    const [where, args] = auditWhere(opts);
    return (this.#db.prepare(`select count(*) as n from audit${where}`).get(...args) as {
      n: number;
    }).n;
  }

  /** Every project and actor that appears in the audit log, deleted projects included. */
  auditFacets(who: Principal): { projects: string[]; actors: string[] } {
    this.#requireAdmin(who);
    const distinct = (col: "project" | "actor") =>
      (this.#db.prepare(
        `select distinct ${col} as v from audit where ${col} is not null order by v`,
      )
        .all() as { v: string }[]).map((r) => r.v);
    return { projects: distinct("project"), actors: distinct("actor") };
  }

  // ---------- internals ----------

  #requireAdmin(who: Principal): void {
    if (who.role !== "admin") throw new VaultError(403, "admin key required");
  }

  /** Look up a project and check the caller may read (or write) it. Unknown and forbidden look alike. */
  #project(who: Principal, slug: string, need: "read" | "write"): ProjectRow {
    if (who.role !== "admin" && who.project !== slug) {
      throw new VaultError(404, "project not found");
    }
    if (need === "write" && who.role === "read") {
      throw new VaultError(403, "this key is read-only");
    }
    const row = this.#db.prepare("select id, slug, name, created_at from projects where slug = ?")
      .get(slug) as ProjectRow | undefined;
    if (!row) throw new VaultError(404, "project not found");
    return row;
  }

  #env(p: ProjectRow, env: string): void {
    const ok = this.#db.prepare("select 1 from environments where project_id = ? and slug = ?")
      .get(p.id, env);
    if (!ok) throw new VaultError(404, `environment not found: ${env}`);
  }

  #upsert(
    projectId: number,
    env: string,
    path: string,
    key: string,
    value: string,
    by: string,
  ): "created" | "updated" {
    if (!KEY_RE.test(key)) throw new VaultError(400, `invalid secret key: ${key}`);
    if (typeof value !== "string") throw new VaultError(400, `value for ${key} must be a string`);
    const { nonce, ciphertext } = this.#cipher.encrypt(value, aad(projectId, env, path, key));
    const existed = this.#db.prepare(
      "select 1 from secrets where project_id = ? and env = ? and path = ? and key = ?",
    ).get(projectId, env, path, key);
    this.#db.prepare(
      `insert into secrets (project_id, env, path, key, nonce, ciphertext, updated_by)
       values (?, ?, ?, ?, ?, ?, ?)
       on conflict (project_id, env, path, key) do update set
         nonce = excluded.nonce, ciphertext = excluded.ciphertext,
         updated_by = excluded.updated_by, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')`,
    ).run(projectId, env, path, key, nonce, ciphertext, by);
    return existed ? "updated" : "created";
  }

  #toSecret(_slug: string, r: SecretRow): Secret {
    return {
      key: r.key,
      value: this.#cipher.decrypt(r.nonce, r.ciphertext, aad(r.project_id, r.env, r.path, r.key)),
      path: r.path,
      updatedAt: r.updated_at,
      updatedBy: r.updated_by,
    };
  }

  #toProject(r: ProjectRow): Project {
    const envs = this.#db.prepare(
      `select slug from environments where project_id = ?
       order by case slug when 'dev' then 0 when 'staging' then 1 when 'prod' then 2 else 3 end, slug`,
    ).all(r.id) as { slug: string }[];
    return {
      slug: r.slug,
      name: r.name,
      environments: envs.map((e) => e.slug),
      createdAt: r.created_at,
    };
  }

  #audit(
    actor: string,
    action: string,
    f: { project?: string | null; env?: string; path?: string; key?: string },
  ): void {
    this.#db.prepare(
      "insert into audit (actor, action, project, env, path, key) values (?, ?, ?, ?, ?, ?)",
    ).run(actor, action, f.project ?? null, f.env ?? null, f.path ?? null, f.key ?? null);
  }

  #tx(fn: () => void): void {
    this.#db.exec("begin");
    try {
      fn();
      this.#db.exec("commit");
    } catch (e) {
      this.#db.exec("rollback");
      throw e;
    }
  }
}

interface ProjectRow {
  id: number;
  slug: string;
  name: string;
  created_at: string;
}

interface SecretRow {
  project_id: number;
  env: string;
  path: string;
  key: string;
  nonce: Uint8Array;
  ciphertext: Uint8Array;
  updated_at: string;
  updated_by: string | null;
}

interface KeyRow {
  id: number;
  name: string;
  role: Role;
  project: string | null;
  hint: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

function toApiKey(r: KeyRow): ApiKey {
  return {
    id: r.id,
    name: r.name,
    role: r.role,
    project: r.project,
    hint: r.hint,
    createdAt: r.created_at,
    lastUsedAt: r.last_used_at,
    revokedAt: r.revoked_at,
  };
}

function aad(projectId: number, env: string, path: string, key: string): string {
  return `${projectId}\0${env}\0${path}\0${key}`;
}

function likePrefix(path: string): string {
  const escaped = path.replace(/[\\%_]/g, (c) => "\\" + c);
  return (path === "/" ? "/" : escaped + "/") + "%";
}
