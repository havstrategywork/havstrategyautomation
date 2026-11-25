import { z } from "zod";
// Only these Hub roles map to a dashboard login that can open the Hub (admin / outreach); mail and social logins are managed on the dashboard Users page.
const ASSIGNABLE = ["super_admin", "account_manager"] as const;

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(1).max(200),
});

export const createTeamMemberSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(10).max(200),
  role: z.enum(ASSIGNABLE),
});

export const updateMemberRoleSchema = z.object({
  role: z.enum(ASSIGNABLE),
});
