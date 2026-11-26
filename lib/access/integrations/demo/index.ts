import { createDemoAdapter } from "./factory";
import { PLATFORM_SCOPES } from "@/lib/access/config/permission-presets";

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

export const demoGoogleAnalyticsAdapter = createDemoAdapter("google_analytics_4", [
  { externalAssetId: "properties/412233445", assetName: "Brand Website (Brand)", assetType: "ga4_property", availablePermissions: [...PLATFORM_SCOPES.google_analytics_4] },
]);

export const demoGoogleTagManagerAdapter = createDemoAdapter("google_tag_manager", [
  { externalAssetId: "accounts/6001122/containers/9003344", assetName: "Brand Web Container (GTM-DEMO123)", assetType: "gtm_container", availablePermissions: [...PLATFORM_SCOPES.google_tag_manager] },
]);

export const demoShopifyAdapter = createDemoAdapter("shopify", [
  { externalAssetId: "brand-demo.myshopify.com", assetName: "Brand Demo Store", assetType: "shopify_store", availablePermissions: [...PLATFORM_SCOPES.shopify] },
]);
