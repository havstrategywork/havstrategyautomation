import assert from "node:assert";
import { seal, unseal } from "./secrets.ts";

// secrets: round trip, random IV, tamper and wrong key fail
process.env.SECRETS_KEY = "test-key-12345";
const s = seal("tok_abc123");
assert.equal(unseal(s), "tok_abc123");
assert.notEqual(seal("tok_abc123"), s);
assert.throws(() => unseal(s.slice(0, -2) + "xx"));
process.env.SECRETS_KEY = "another-key-999";
assert.throws(() => unseal(s));
console.log("social ok");
