"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/access/ui/button";
import { Input } from "@/components/access/ui/input";
import { Label } from "@/components/access/ui/label";
import { Select } from "@/components/access/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/access/ui/table";
import { Avatar } from "@/components/access/ui/avatar";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/access/ui/dialog";
import { useToast } from "@/components/access/ui/toast";
import { apiFetch } from "@/lib/access/api-client";
import { titleCase } from "@/lib/access/utils";
import { PRODUCT_SHORT_NAME } from "@/lib/access/branding";
import { ROLES } from "@/lib/access/types";

interface Member {
  userId: string;
  name: string;
  email: string;
  role: string;
}

export default function TeamPage() {
  const { toast } = useToast();
  const [members, setMembers] = useState<Member[] | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<string>("team_member");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      setMembers(await apiFetch<Member[]>("/api/access/team"));
    } catch {
      toast({ title: "Failed to load team", variant: "destructive" });
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  async function addMember(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await apiFetch("/api/access/team", { method: "POST", body: JSON.stringify({ name, email, password, role }) });
      toast({ title: "Team member added", variant: "success" });
      setOpen(false);
      setName("");
      setEmail("");
      setPassword("");
      load();
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Failed to add member", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  async function changeRole(userId: string, newRole: string) {
    try {
      await apiFetch(`/api/access/team/${userId}`, { method: "PATCH", body: JSON.stringify({ role: newRole }) });
      load();
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Failed", variant: "destructive" });
    }
  }

  async function remove(userId: string) {
    try {
      await apiFetch(`/api/access/team/${userId}`, { method: "DELETE" });
      toast({ title: "Member removed", variant: "success" });
      load();
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Failed", variant: "destructive" });
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Team Management</h1>
          <p className="text-sm text-muted">Manage who on your team can access {PRODUCT_SHORT_NAME}.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4" /> Add member
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add team member</DialogTitle>
            </DialogHeader>
            <form onSubmit={addMember} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="name">Name</Label>
                <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Temporary password</Label>
                <Input id="password" type="text" required minLength={10} value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="role">Role</Label>
                <Select id="role" value={role} onChange={(e) => setRole(e.target.value)}>
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {titleCase(r)}
                    </option>
                  ))}
                </Select>
              </div>
              <DialogFooter>
                <Button type="submit" loading={submitting}>
                  Add member
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {!members ? null : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((m) => (
              <TableRow key={m.userId}>
                <TableCell>
                  <div className="flex items-center gap-2.5">
                    <Avatar name={m.name} />
                    <span className="font-medium text-foreground">{m.name}</span>
                  </div>
                </TableCell>
                <TableCell className="text-muted">{m.email}</TableCell>
                <TableCell>
                  <Select className="w-40" value={m.role} onChange={(e) => changeRole(m.userId, e.target.value)}>
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {titleCase(r)}
                      </option>
                    ))}
                  </Select>
                </TableCell>
                <TableCell>
                  <button onClick={() => remove(m.userId)} className="rounded-md p-1.5 hover:bg-surface" title="Remove">
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
