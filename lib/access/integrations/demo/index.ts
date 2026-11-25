import { createDemoAdapter } from "./factory";

export const demoMetaAdsAdapter = createDemoAdapter("meta_ads", [
  { externalAssetId: "act_10298765432", assetName: "Primary Ad Account", assetType: "ad_account", availablePermissions: ["ads_read", "ads_management", "business_management"] },
  { externalAssetId: "pg_55102983", assetName: "Brand Page", assetType: "page", availablePermissions: ["pages_show_list", "pages_read_engagement"] },
]);

export const demoInstagramAdapter = createDemoAdapter("instagram", [
  { externalAssetId: "ig_90187264", assetName: "@brand.official", assetType: "instagram_account", availablePermissions: ["instagram_basic", "instagram_manage_insights", "instagram_content_publish", "instagram_manage_comments"] },
]);

export const demoGoogleAdsAdapter = createDemoAdapter("google_ads", [
  { externalAssetId: "123-456-7890", assetName: "Primary Google Ads Account", assetType: "google_ads_customer", availablePermissions: ["https://www.googleapis.com/auth/adwords"] },
]);
