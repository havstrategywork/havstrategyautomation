import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/access/auth/session";
import { getDb } from "@/lib/access/db";
import { getAppMode } from "@/lib/access/env";
import { Sidebar } from "@/components/access/dashboard/sidebar";
import { TopBar } from "@/components/access/dashboard/topbar";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getCurrentSession();
  if (!session) {
    // Signed in to the dashboard but the Hub's database can't be reached: say so instead of bouncing to the login page.
    const db = await getDb();
    if (!db.ok) return <div className="m-auto max-w-lg p-10 text-sm text-foreground"><h1 className="mb-2 text-lg font-semibold">Access Hub database unavailable</h1><p className="text-muted">{db.error}</p><a href="/" className="mt-4 inline-block text-primary underline">Back to the dashboard</a></div>;
    redirect("/login");
  }

  return (
    <div className="flex h-screen overflow-hidden bg-surface">
      <Sidebar role={session.role} organizationName={session.organizationName} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar name={session.name} email={session.email} role={session.role} demoMode={getAppMode() === "demo"} />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
