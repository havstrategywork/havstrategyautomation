#!/usr/bin/env tsx
/** Wipes and recreates the embedded demo database (.data/demo-db). Run with: npx tsx scripts/access-reset-demo.ts */
import { resetDemoDatabase } from "../lib/access/db/demo-client";

resetDemoDatabase()
  .then(() => {
    console.log("Demo database reset.");
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
