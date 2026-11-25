import { requireRole } from "@/lib/access/auth/require-role";

export default async function ActivityLogsLayout({ children }: { children: React.ReactNode }) {
  await requireRole(["super_admin", "account_manager"]);
  return children;
}
