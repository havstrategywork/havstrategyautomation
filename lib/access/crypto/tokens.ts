import { createHash, createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { isDemoMode } from "@/lib/access/env";

/** A secure, URL-safe random token (invitation links, session cookies, CSRF-grade identifiers). */
export function generateSecureToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** One-way hash for values we need to look up by exact match but never want recoverable at rest (invitation tokens, session tokens). */
export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

const ALGO = "aes-256-gcm";
let demoKeyCache: Buffer | null = null;

function resolveEncryptionKey(): { ok: true; key: Buffer } | { ok: false; error: string } {
  const configured = process.env.TOKEN_ENCRYPTION_KEY_REFERENCE;
  if (configured && configured.trim().length > 0) {
    try {
      const key = Buffer.from(configured, "base64");
      if (key.length !== 32) {
        return { ok: false, error: "TOKEN_ENCRYPTION_KEY_REFERENCE must decode to exactly 32 bytes (base64)." };
      }
      return { ok: true, key };
    } catch {
      return { ok: false, error: "TOKEN_ENCRYPTION_KEY_REFERENCE is not valid base64." };
    }
  }

  if (isDemoMode()) {
    // Process-local only, regenerated every restart, never used for anything
    // that leaves this process - acceptable because demo mode never stores a
    // real provider credential in the first place.
    if (!demoKeyCache) demoKeyCache = randomBytes(32);
    return { ok: true, key: demoKeyCache };
  }

  return {
    ok: false,
    error: "TOKEN_ENCRYPTION_KEY_REFERENCE is not configured. Production mode cannot store OAuth tokens without it.",
  };
}

export type CryptoResult<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * AES-256-GCM, output as `v<version>.<iv>.<authTag>.<ciphertext>` (all base64url).
 *
 * NOTE: TOKEN_ENCRYPTION_KEY_REFERENCE is treated here as the raw key
 * material for simplicity. A hardened production deployment should instead
 * resolve this reference against a managed KMS/secrets service and never
 * keep the raw key in a plain environment variable - see SECURITY.md.
 */
export function encryptSecret(plaintext: string): CryptoResult<string> {
  const keyResult = resolveEncryptionKey();
  if (!keyResult.ok) return keyResult;

  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, keyResult.key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  const encoded = [
    "v1",
    iv.toString("base64url"),
    authTag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");

  return { ok: true, value: encoded };
}

export function decryptSecret(encoded: string): CryptoResult<string> {
  const keyResult = resolveEncryptionKey();
  if (!keyResult.ok) return keyResult;

  const parts = encoded.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") {
    return { ok: false, error: "Unrecognized encrypted-secret format." };
  }
  const [, ivPart, tagPart, ciphertextPart] = parts;

  try {
    const decipher = createDecipheriv(ALGO, keyResult.key, Buffer.from(ivPart, "base64url"));
    decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(ciphertextPart, "base64url")),
      decipher.final(),
    ]);
    return { ok: true, value: plaintext.toString("utf8") };
  } catch {
    return { ok: false, error: "Failed to decrypt secret (wrong key version or corrupted data)." };
  }
}
