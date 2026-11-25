import assert from "node:assert";
import { canView, hasApiKey, homeFor, roleOf } from "./roles.ts";

assert.equal(roleOf(undefined), "admin"); // old logins keep full access
assert.equal(roleOf("nonsense"), "admin");
assert.ok(canView("admin", "/mail") && canView("admin", "/users") && canView("admin", "/automation") && canView("admin", "/social/orgs"));
assert.ok(canView("outreach", "/creators") && canView("outreach", "/"));
assert.ok(!canView("outreach", "/mail") && !canView("outreach", "/users") && !canView("outreach", "/automation") && !canView("outreach", "/social/reports"));
assert.ok(canView("mail", "/mail") && canView("mail", "/login/logout"));
assert.ok(!canView("mail", "/") && !canView("mail", "/creators") && !canView("mail", "/users") && !canView("mail", "/mailx") && !canView("mail", "/social/reports"));
assert.ok(canView("social", "/social/reports") && canView("social", "/social/bots") && canView("social", "/login/logout"));
assert.ok(!canView("social", "/social/orgs") && !canView("social", "/social/connect/start") && canView("admin", "/social/connect/start") && !canView("social", "/socialx") && !canView("social", "/") && !canView("social", "/mail") && !canView("social", "/creators") && !canView("social", "/users"));
assert.equal(homeFor("mail"), "/mail");
assert.equal(homeFor("social"), "/social/reports");
assert.ok(hasApiKey("admin") && hasApiKey("outreach") && !hasApiKey("mail") && !hasApiKey("social"));
console.log("roles ok");
assert.ok(canView("admin", "/onboarding-responses") && !canView("outreach", "/onboarding-responses") && !canView("social", "/onboarding-responses") && !canView("mail", "/onboarding-responses/export"));
assert.ok(canView("admin", "/settings") && !canView("outreach", "/settings") && !canView("social", "/settings") && !canView("mail", "/settings"));
