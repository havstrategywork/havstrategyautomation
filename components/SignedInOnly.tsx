"use client";
// The two pieces of the dashboard shell that need Material UI, loaded as their own files. The root layout renders them only for signed-in people,
// so the sign-in page and the public onboarding form don't download Material UI at all. Both are still rendered on the server.
import dynamic from "next/dynamic";

export const MuiProviders = dynamic(() => import("@/components/mui/Providers"));
export const BriefChat = dynamic(() => import("@/components/BriefChat"));
