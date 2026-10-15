import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { Buffer } from "node:buffer";

const TOKEN_PREFIX = "hvk_";
const TAG_LENGTH = 16;

/** AES-256-GCM with the master key. Associated data binds a ciphertext to its secret's identity. */
export class Cipher {
  readonly #key: Uint8Array;

  constructor(key: Uint8Array) {
    if (key.length !== 32) throw new Error("master key must be 32 bytes");
    this.#key = key;
  }

  encrypt(plaintext: string, aad: string): { nonce: Uint8Array; ciphertext: Uint8Array } {
    const nonce = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.#key, nonce);
    cipher.setAAD(new TextEncoder().encode(aad));
    const body = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    return { nonce, ciphertext: Buffer.concat([body, cipher.getAuthTag()]) };
  }

  decrypt(nonce: Uint8Array, ciphertext: Uint8Array, aad: string): string {
    const buf = Buffer.from(ciphertext);
    const decipher = createDecipheriv("aes-256-gcm", this.#key, nonce);
    decipher.setAAD(new TextEncoder().encode(aad));
    decipher.setAuthTag(buf.subarray(buf.length - TAG_LENGTH));
    return Buffer.concat([
      decipher.update(buf.subarray(0, buf.length - TAG_LENGTH)),
      decipher.final(),
    ])
      .toString("utf8");
  }
}

export function generateMasterKey(): string {
  return randomBytes(32).toString("base64");
}

export function parseMasterKey(text: string): Uint8Array {
  const key = Buffer.from(text.trim(), "base64");
  if (key.length !== 32) throw new Error("master key file must contain 32 base64-encoded bytes");
  return key;
}

export function generateToken(): string {
  return TOKEN_PREFIX + randomBytes(32).toString("base64url");
}

/** Tokens carry 256 bits of entropy, so a plain SHA-256 is enough to store them. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function tokenHint(token: string): string {
  return `${token.slice(0, TOKEN_PREFIX.length + 4)}…${token.slice(-4)}`;
}
