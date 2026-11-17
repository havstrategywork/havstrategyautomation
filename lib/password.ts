// Password hashing with scrypt (node:crypto, no dependency). No other imports, so scripts can use it too.
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const derive = (pw: string, salt: Buffer) =>
  new Promise<Buffer>((res, rej) => scrypt(pw, salt, 64, { N: 16384, r: 8, p: 1 }, (e, k) => (e ? rej(e) : res(k))));

/** "scrypt$<salt b64>$<hash b64>": a fresh random salt per password. */
export async function hashPassword(pw: string) {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString("base64")}$${(await derive(pw, salt)).toString("base64")}`;
}

export async function verifyPassword(pw: string, stored: string) {
  const [alg, s, h] = stored.split("$");
  if (alg !== "scrypt" || !s || !h) return false;
  const want = Buffer.from(h, "base64"), got = await derive(pw, Buffer.from(s, "base64"));
  return want.length === got.length && timingSafeEqual(want, got); // constant-time compare
}
