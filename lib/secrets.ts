// Encrypts third-party tokens (Meta access tokens) before they go into Mongo, so a database leak alone does not expose them.
// AES-256-GCM; the key comes from SECRETS_KEY (falls back to API_KEY). Changing that key makes saved tokens unreadable: re-enter them.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const key = () => {
  const k = process.env.SECRETS_KEY || process.env.API_KEY;
  if (!k || k.length < 8) throw new Error("Set SECRETS_KEY (or API_KEY) to store tokens");
  return createHash("sha256").update(k).digest();
};

export function seal(plain: string) {
  const iv = randomBytes(12), c = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64"), c.getAuthTag().toString("base64"), enc.toString("base64")].join(".");
}

export function unseal(sealed: string) {
  const [v, iv, tag, enc] = sealed.split(".");
  if (v !== "v1" || !iv || !tag || !enc) throw new Error("bad sealed value");
  const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  d.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(enc, "base64")), d.final()]).toString("utf8");
}
