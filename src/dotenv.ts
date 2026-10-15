/**
 * Format secrets as a .env file that is safe for both `set -a; source .env` and dotenv loaders.
 * Single quotes are used unless the value contains one (bash does no expansion inside them).
 */
export function formatDotenv(secrets: { key: string; value: string }[]): string {
  return secrets.map(({ key, value }) => `${key}=${quote(value)}\n`).join("");
}

function quote(value: string): string {
  if (!value.includes("'")) return `'${value}'`;
  const escaped = value
    .replaceAll("\\", "\\\\")
    .replaceAll('"', '\\"')
    .replaceAll("$", "\\$")
    .replaceAll("`", "\\`")
    .replaceAll("\n", "\\n");
  return `"${escaped}"`;
}

/** Parse KEY=value lines. Handles `export`, comments, and single/double/unquoted values. */
export function parseDotenv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  const lines = text.replaceAll("\r\n", "\n").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_.-]*)\s*=\s*(.*)$/);
    if (!m) throw new Error(`line ${i + 1}: expected KEY=value`);
    const [, key] = m;
    let rest = m[2];
    const q = rest[0];
    if (q === "'" || q === '"') {
      // Quoted values may span lines until the closing quote.
      while (!hasClosingQuote(rest, q) && i + 1 < lines.length) rest += "\n" + lines[++i];
      const end = closingQuoteIndex(rest, q);
      if (end < 0) throw new Error(`line ${i + 1}: unterminated quote for ${key}`);
      const inner = rest.slice(1, end);
      out[key] = q === "'" ? inner : unescapeDouble(inner);
    } else {
      out[key] = rest.replace(/\s+#.*$/, "").trim();
    }
  }
  return out;
}

function closingQuoteIndex(s: string, q: string): number {
  for (let i = 1; i < s.length; i++) {
    if (q === '"' && s[i] === "\\") {
      i++;
      continue;
    }
    if (s[i] === q) return i;
  }
  return -1;
}

function hasClosingQuote(s: string, q: string): boolean {
  return closingQuoteIndex(s, q) >= 0;
}

function unescapeDouble(s: string): string {
  return s.replace(/\\(.)/g, (_, c: string) => (c === "n" ? "\n" : c === "t" ? "\t" : c));
}
