import { FORM_ADMIN, isFormAdmin, safeNext } from "./roles.ts";
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
// only one login may edit the onboarding form
assert.ok(isFormAdmin({ username: FORM_ADMIN, role: "admin" }) && isFormAdmin({ username: "x", email: FORM_ADMIN, role: "admin" }));
assert.ok(!isFormAdmin({ username: "havstrategy", email: null, role: "admin" }) && !isFormAdmin({ username: FORM_ADMIN, role: "outreach" }));
// sign-in can only send people to the one allowed page
assert.equal(safeNext("/onboarding-form"), "/onboarding-form");
for (const bad of ["//evil.com", "https://evil.com", "/users", "/onboarding-form/../users", undefined, null]) assert.equal(safeNext(bad), null);
console.log("roles ok");
assert.ok(canView("admin", "/onboarding-responses") && !canView("outreach", "/onboarding-responses") && !canView("social", "/onboarding-responses") && !canView("mail", "/onboarding-responses/export"));
assert.ok(canView("admin", "/onboarding-form") && !canView("outreach", "/onboarding-form") && !canView("social", "/onboarding-form") && !canView("mail", "/onboarding-form"));
assert.ok(canView("admin", "/settings") && !canView("outreach", "/settings") && !canView("social", "/settings") && !canView("mail", "/settings"));
