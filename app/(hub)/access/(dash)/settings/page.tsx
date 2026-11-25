"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/access/ui/card";
import { Input } from "@/components/access/ui/input";
import { Label } from "@/components/access/ui/label";
import { Button } from "@/components/access/ui/button";
import { Skeleton } from "@/components/access/ui/skeleton";
import { useToast } from "@/components/access/ui/toast";
import { apiFetch } from "@/lib/access/api-client";
import { PRODUCT_NAME } from "@/lib/access/branding";
import type { Organization } from "@/lib/access/db/schema-types";

export default function SettingsPage() {
  const { toast } = useToast();
  const [org, setOrg] = useState<Organization | null>(null);
  const [name, setName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [supportEmail, setSupportEmail] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch<Organization>("/api/access/settings/organization").then((data) => {
      setOrg(data);
      setName(data.organizationName);
      setLogoUrl(data.logoUrl ?? "");
      setSupportEmail((data.settings as Record<string, unknown>)?.supportEmail as string ?? "");
    });
  }, []);

  async function save() {
    setSaving(true);
    try {
      await apiFetch("/api/access/settings/organization", {
        method: "PATCH",
        body: JSON.stringify({ organizationName: name, logoUrl: logoUrl || null, settings: { ...(org?.settings as object), supportEmail } }),
      });
      toast({ title: "Settings saved", variant: "success" });
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Failed to save", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  if (!org) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="max-w-xl space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Settings</h1>
        <p className="text-sm text-muted">Branding shown to your clients on their onboarding page.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Agency branding</CardTitle>
          <CardDescription>The name and logo below are what clients see - {PRODUCT_NAME} itself is the underlying platform name.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="orgName">Agency name</Label>
            <Input id="orgName" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="logoUrl">Logo URL</Label>
            <Input id="logoUrl" type="url" placeholder="https://" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="supportEmail">Support email</Label>
            <Input id="supportEmail" type="email" value={supportEmail} onChange={(e) => setSupportEmail(e.target.value)} />
          </div>
          <Button onClick={save} loading={saving}>
            Save changes
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
