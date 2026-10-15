import { Hono } from "@hono/hono";
import { parseArgs } from "@std/cli/parse-args";
import { dirname } from "node:path";
import { apiRoutes } from "./src/api.ts";
import { generateMasterKey, parseMasterKey } from "./src/crypto.ts";
import { Vault } from "./src/vault.ts";
import { webRoutes } from "./src/web.tsx";

const config = {
  db: Deno.env.get("HEKA_VAULT_DB") ?? "./data/vault.db",
  masterKeyFile: Deno.env.get("HEKA_VAULT_MASTER_KEY_FILE") ?? "./data/master.key",
  host: Deno.env.get("HEKA_VAULT_HOST") ?? "0.0.0.0",
  port: Number(Deno.env.get("HEKA_VAULT_PORT") ?? 8090),
};

export function createApp(vault: Vault): Hono {
  const app = new Hono();
  app.use("*", async (c, next) => {
    await next();
    c.header("x-content-type-options", "nosniff");
    c.header("referrer-policy", "same-origin");
    c.header("x-frame-options", "DENY");
  });
  app.route("/api/v1", apiRoutes(vault));
  app.route("/", webRoutes(vault));
  return app;
}

function exists(path: string): boolean {
  try {
    Deno.statSync(path);
    return true;
  } catch {
    return false;
  }
}

/** Create the master key on first run only; never replace one under an existing database. */
function openVault(): Vault {
  if (!exists(config.masterKeyFile)) {
    if (exists(config.db)) {
      throw new Error(`master key ${config.masterKeyFile} is missing but ${config.db} exists`);
    }
    Deno.mkdirSync(dirname(config.masterKeyFile), { recursive: true });
    Deno.writeTextFileSync(config.masterKeyFile, generateMasterKey() + "\n", {
      mode: 0o600,
      createNew: true,
    });
    console.log(`created master key at ${config.masterKeyFile} — back it up with the database`);
  }
  Deno.mkdirSync(dirname(config.db), { recursive: true });
  return new Vault(config.db, parseMasterKey(Deno.readTextFileSync(config.masterKeyFile)));
}

const USAGE = `heka-vault <command>

  serve                                   Start the API + web UI
  create-admin-key --name NAME --out FILE Create an admin key and write HEKA_VAULT_TOKEN=... to FILE (mode 600)
`;

if (import.meta.main) {
  const args = parseArgs(Deno.args, { string: ["name", "out"] });
  const [command] = args._;
  if (command === "serve") {
    const vault = openVault();
    Deno.serve({ hostname: config.host, port: config.port }, createApp(vault).fetch);
  } else if (command === "create-admin-key") {
    if (!args.name || !args.out) {
      console.error(USAGE);
      Deno.exit(2);
    }
    const vault = openVault();
    const token = vault.bootstrapAdminKey(args.name);
    Deno.writeTextFileSync(args.out, `HEKA_VAULT_TOKEN=${token}\n`, {
      mode: 0o600,
      createNew: true,
    });
    console.log(`wrote admin key "${args.name}" to ${args.out}`);
    vault.close();
  } else {
    console.error(USAGE);
    Deno.exit(command ? 2 : 0);
  }
}
