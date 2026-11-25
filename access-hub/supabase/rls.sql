-- Row-level security policies for Havstrategy Digital Marketing Access Hub's multi-tenant tables.
--
-- Applied ONLY to a real Postgres/Supabase deployment (production mode) by
-- scripts/migrate.ts, after the Drizzle-generated schema migrations. The
-- embedded demo database (PGlite) intentionally does not enable RLS - see
-- SECURITY.md "Defense in depth" for why that is a documented, safe
-- simplification rather than an oversight.
--
-- Model: the app does not use Supabase Auth, so there is no auth.uid().
-- Instead, every privileged request sets a session-local GUC
-- (app.current_org_id) inside the same transaction that runs its queries -
-- see lib/db/client.ts `withOrgContext`. Policies check that GUC. Table
-- owners normally bypass RLS in Postgres, so FORCE ROW LEVEL SECURITY is
-- used everywhere so even the migration/owner role is subject to these
-- policies once enabled, matching how the app's own runtime role connects.
--
-- Idempotent: safe to re-run. Policies are dropped and recreated each time.

create or replace function app_current_org_id() returns uuid as $$
  select current_setting('app.current_org_id', true)::uuid
$$ language sql stable;

do $$
declare
  t text;
begin
  for t in select unnest(array[
    'clients', 'onboarding_invitations', 'platform_connections',
    'connected_assets', 'access_requests', 'encrypted_credentials',
    'audit_logs', 'notifications', 'analytics_events',
    'organization_memberships'
  ])
  loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
  end loop;
end $$;

-- organizations: a row may only be read/written by a caller whose
-- app.current_org_id GUC matches it (set from the caller's own membership
-- row, so this can never be forged by passing an arbitrary id).
drop policy if exists org_isolation on organizations;
create policy org_isolation on organizations
  using (id = app_current_org_id())
  with check (id = app_current_org_id());

drop policy if exists tenant_isolation on organization_memberships;
create policy tenant_isolation on organization_memberships
  using (organization_id = app_current_org_id())
  with check (organization_id = app_current_org_id());

drop policy if exists tenant_isolation on clients;
create policy tenant_isolation on clients
  using (organization_id = app_current_org_id())
  with check (organization_id = app_current_org_id());

drop policy if exists tenant_isolation on platform_connections;
create policy tenant_isolation on platform_connections
  using (organization_id = app_current_org_id())
  with check (organization_id = app_current_org_id());

drop policy if exists tenant_isolation on audit_logs;
create policy tenant_isolation on audit_logs
  using (organization_id = app_current_org_id())
  with check (organization_id = app_current_org_id());

drop policy if exists tenant_isolation on notifications;
create policy tenant_isolation on notifications
  using (organization_id = app_current_org_id())
  with check (organization_id = app_current_org_id());

drop policy if exists tenant_isolation on analytics_events;
create policy tenant_isolation on analytics_events
  using (organization_id = app_current_org_id())
  with check (organization_id = app_current_org_id());

-- Tables without their own organization_id column are scoped via a join to
-- their parent (clients / platform_connections), which is itself isolated
-- above - a row can only be reached if its parent is visible.
drop policy if exists tenant_isolation on onboarding_invitations;
create policy tenant_isolation on onboarding_invitations
  using (exists (
    select 1 from clients c
    where c.id = onboarding_invitations.client_id
      and c.organization_id = app_current_org_id()
  ))
  with check (exists (
    select 1 from clients c
    where c.id = onboarding_invitations.client_id
      and c.organization_id = app_current_org_id()
  ));

drop policy if exists tenant_isolation on connected_assets;
create policy tenant_isolation on connected_assets
  using (exists (
    select 1 from platform_connections pc
    where pc.id = connected_assets.connection_id
      and pc.organization_id = app_current_org_id()
  ))
  with check (exists (
    select 1 from platform_connections pc
    where pc.id = connected_assets.connection_id
      and pc.organization_id = app_current_org_id()
  ));

drop policy if exists tenant_isolation on access_requests;
create policy tenant_isolation on access_requests
  using (exists (
    select 1 from platform_connections pc
    where pc.id = access_requests.connection_id
      and pc.organization_id = app_current_org_id()
  ))
  with check (exists (
    select 1 from platform_connections pc
    where pc.id = access_requests.connection_id
      and pc.organization_id = app_current_org_id()
  ));

-- encrypted_credentials: same tenant join as above, PLUS this table should
-- only ever be touched by the privileged backend token-service code path
-- (see lib/crypto/tokens.ts) - RLS here is a last-resort backstop, not the
-- primary control.
drop policy if exists tenant_isolation on encrypted_credentials;
create policy tenant_isolation on encrypted_credentials
  using (exists (
    select 1 from platform_connections pc
    where pc.id = encrypted_credentials.connection_id
      and pc.organization_id = app_current_org_id()
  ))
  with check (exists (
    select 1 from platform_connections pc
    where pc.id = encrypted_credentials.connection_id
      and pc.organization_id = app_current_org_id()
  ));

-- users and sessions are intentionally NOT org-scoped tables (a user can
-- belong to multiple organizations via organization_memberships), so they
-- carry no RLS policy here; access to them is mediated entirely by
-- application code (a user can only ever read/update their own row).
