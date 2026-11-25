import { z } from "zod";
import { ROLES } from "@/lib/access/types";

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(1).max(200),
});

export const createTeamMemberSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(10).max(200),
  role: z.enum(ROLES),
});

export const updateMemberRoleSchema = z.object({
  role: z.enum(ROLES),
});
