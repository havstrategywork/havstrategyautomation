import { requireRole } from "@/lib/access/auth/require-role";

export default async function IntegrationsLayout({ children }: { children: React.ReactNode }) {
  await requireRole(["super_admin"]);
  return children;
}
