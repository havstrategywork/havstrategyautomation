"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/access/ui/button";
import { Input } from "@/components/access/ui/input";
import { Label } from "@/components/access/ui/label";
import { Textarea } from "@/components/access/ui/textarea";
import { Select } from "@/components/access/ui/select";
import { Checkbox } from "@/components/access/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/access/ui/card";
import { useToast } from "@/components/access/ui/toast";
import { apiFetch } from "@/lib/access/api-client";
import { PLATFORMS, PERMISSION_PRESETS } from "@/lib/access/types";
import { PLATFORM_CATALOG } from "@/lib/access/integrations/catalog";
import { PERMISSION_PRESET_DEFINITIONS } from "@/lib/access/config/permission-presets";

interface TeamMember {
  userId: string;
  name: string;
  role: string;
}

export default function NewClientPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [managers, setManagers] = useState<TeamMember[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [brandName, setBrandName] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [industry, setIndustry] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [assignedManagerId, setAssignedManagerId] = useState("");
  const [platforms, setPlatforms] = useState<string[]>(["meta_ads"]);
  const [preset, setPreset] = useState<string>("performance_marketing");
  const [message, setMessage] = useState("");

  useEffect(() => {
    apiFetch<TeamMember[]>("/api/access/team")
      .then((m) => setManagers(m.filter((x) => x.role !== "team_member")))
      .catch(() => null);
  }, []);

  function togglePlatform(platform: string) {
    setPlatforms((prev) => (prev.includes(platform) ? prev.filter((p) => p !== platform) : [...prev, platform]));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (platforms.length === 0) {
      setError("Select at least one platform.");
      return;
    }
    setSubmitting(true);
    try {
      const created = await apiFetch<{ id: string }>("/api/access/clients", {
        method: "POST",
        body: JSON.stringify({
          brandName,
          contactName,
          contactEmail,
          website: website || undefined,
          industry: industry || undefined,
          logoUrl: logoUrl || undefined,
          assignedManagerId: assignedManagerId || undefined,
          requiredPlatforms: platforms,
          permissionPreset: preset,
        }),
      });

      const invite = await apiFetch<{ url: string }>(`/api/access/clients/${created.id}/invitations`, {
        method: "POST",
        body: JSON.stringify({ requestedPlatforms: platforms, personalizedMessage: message || undefined, expiryDays: 14 }),
      });

      await navigator.clipboard.writeText(invite.url).catch(() => null);
      toast({ title: "Client created", description: "Onboarding link copied to clipboard.", variant: "success" });
      router.push(`/access/clients/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create client.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <Link href="/access/clients" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to clients
      </Link>
      <div>
        <h1 className="text-xl font-semibold text-foreground">New client</h1>
        <p className="text-sm text-muted">We&apos;ll generate a secure onboarding link you can share right away.</p>
      </div>

      <form onSubmit={onSubmit} className="space-y-5">
        <Card>
          <CardHeader>
            <CardTitle>Brand details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="brandName">Brand name</Label>
                <Input id="brandName" required value={brandName} onChange={(e) => setBrandName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="contactName">Client contact name</Label>
                <Input id="contactName" required value={contactName} onChange={(e) => setContactName(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="contactEmail">Business email</Label>
                <Input id="contactEmail" type="email" required value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="website">Website</Label>
                <Input id="website" type="url" placeholder="https://" value={website} onChange={(e) => setWebsite(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="industry">Industry</Label>
                <Input id="industry" value={industry} onChange={(e) => setIndustry(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="logoUrl">Brand logo URL</Label>
                <Input id="logoUrl" type="url" placeholder="https://" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="manager">Assigned account manager</Label>
              <Select id="manager" value={assignedManagerId} onChange={(e) => setAssignedManagerId(e.target.value)}>
                <option value="">Unassigned</option>
                {managers.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.name}
                  </option>
                ))}
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Platforms to request</CardTitle>
            <CardDescription>Pick the accounts this client should connect.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {PLATFORMS.map((platform) => (
              <label key={platform} className="flex items-center gap-2.5 rounded-md border border-border p-3 text-sm">
                <Checkbox checked={platforms.includes(platform)} onCheckedChange={() => togglePlatform(platform)} />
                <span className="font-medium text-foreground">{PLATFORM_CATALOG[platform].label}</span>
              </label>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Permissions</CardTitle>
            <CardDescription>Choose a preset. We&apos;ll only ever request what&apos;s mapped below - never account ownership or billing.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {PERMISSION_PRESETS.map((p) => (
              <label key={p} className={`flex items-start gap-2.5 rounded-md border p-3 text-sm ${preset === p ? "border-primary bg-primary/5" : "border-border"}`}>
                <input type="radio" name="preset" className="mt-0.5" checked={preset === p} onChange={() => setPreset(p)} />
                <span>
                  <span className="block font-medium text-foreground">{p === "custom" ? "Custom Permissions" : PERMISSION_PRESET_DEFINITIONS[p].label}</span>
                  <span className="block text-muted">{p === "custom" ? "Pick individual permissions per platform after creation." : PERMISSION_PRESET_DEFINITIONS[p].description}</span>
                </span>
              </label>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Personalized message (optional)</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea placeholder="A short note the client will see on their onboarding page." value={message} onChange={(e) => setMessage(e.target.value)} />
          </CardContent>
        </Card>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => router.push("/access/clients")}>
            Cancel
          </Button>
          <Button type="submit" loading={submitting}>
            Create client &amp; generate link
          </Button>
        </div>
      </form>
    </div>
  );
}
