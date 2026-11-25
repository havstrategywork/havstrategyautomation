import { z } from "zod";
import { ONBOARDING_STATUSES, PERMISSION_PRESETS, PHASE_1_PLATFORMS } from "@/lib/access/types";

export const createClientSchema = z.object({
  brandName: z.string().trim().min(1).max(200),
  contactName: z.string().trim().min(1).max(200),
  contactEmail: z.string().trim().toLowerCase().email().max(200),
  website: z.string().trim().url().max(500).optional().or(z.literal("")),
  industry: z.string().trim().max(200).optional(),
  logoUrl: z.string().trim().max(2000).optional(),
  assignedManagerId: z.string().uuid().optional().nullable(),
  requiredPlatforms: z.array(z.enum(PHASE_1_PLATFORMS)).min(1, "Select at least one platform."),
  permissionPreset: z.enum(PERMISSION_PRESETS),
  customPermissions: z.record(z.string(), z.array(z.string())).optional(),
});

export const updateClientSchema = createClientSchema.partial();

export const createInvitationSchema = z.object({
  requestedPlatforms: z.array(z.enum(PHASE_1_PLATFORMS)).min(1),
  personalizedMessage: z.string().trim().max(1000).optional(),
  expiryDays: z.number().int().min(1).max(60).default(14),
});

export const listClientsQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
  status: z.enum(ONBOARDING_STATUSES).optional(),
  assignedManagerId: z.string().uuid().optional(),
  includeArchived: z.coerce.boolean().optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  sortBy: z.enum(["brandName", "createdAt", "onboardingStatus"]).optional(),
  sortDir: z.enum(["asc", "desc"]).optional(),
});
