import { z } from "zod";

export const selectAssetsSchema = z.object({
  selected: z
    .array(
      z.object({
        externalAssetId: z.string().min(1).max(200),
        assetName: z.string().min(1).max(300),
        assetType: z.string().min(1).max(100),
        availablePermissions: z.array(z.string()).max(50),
      }),
    )
    .min(1, "Select at least one account.")
    .max(25),
});
