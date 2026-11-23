import assert from "node:assert";
import { canView, homeFor, roleOf } from "./roles.ts";

assert.equal(roleOf(undefined), "admin"); // old logins keep full access
assert.equal(roleOf("nonsense"), "admin");
assert.ok(canView("admin", "/mail") && canView("admin", "/users") && canView("admin", "/automation"));
assert.ok(canView("outreach", "/creators") && canView("outreach", "/"));
assert.ok(!canView("outreach", "/mail") && !canView("outreach", "/users") && !canView("outreach", "/automation"));
assert.ok(canView("mail", "/mail") && canView("mail", "/login/logout"));
assert.ok(!canView("mail", "/") && !canView("mail", "/creators") && !canView("mail", "/users") && !canView("mail", "/mailx"));
assert.equal(homeFor("mail"), "/mail");
console.log("roles ok");
