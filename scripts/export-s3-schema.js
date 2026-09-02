// scripts/export-s3-schema.js

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const DATABASE_NAME = "goblin_rpg_s3"; // change if your D1 DB has a different name
const OUTPUT_DIR = "./backups";
const OUTPUT_FILE = path.join(OUTPUT_DIR, "s3-schema.sql");

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

console.log(`Exporting schema from D1 database: ${DATABASE_NAME}`);

try {
  execSync(
    `npx wrangler d1 export ${DATABASE_NAME} ` +
      `--remote ` +
      `--no-data ` +
      `--output="${OUTPUT_FILE}" ` +
      `--skip-confirmation`,
    {
      stdio: "inherit",
    }
  );

  console.log("");
  console.log("Schema export complete.");
  console.log(`Saved to: ${OUTPUT_FILE}`);
} catch (error) {
  console.error("");
  console.error("Failed to export S3 schema.");
  process.exit(1);
}