import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { readEnvFile } from "./env-file";
import { requiredSecrets } from "./required-secrets";

const envFile = resolve(process.cwd(), ".secrets", process.argv.includes("--production") ? "production.env" : "development.env");

if (!existsSync(envFile)) {
  console.error(`Missing local secrets file: ${envFile}`);
  process.exit(1);
}

const values = readEnvFile(envFile);
const missing = requiredSecrets.filter((key) => !values[key]?.trim());

if (missing.length > 0) {
  console.error("Missing or empty required secrets:");
  for (const key of missing) console.error(`- ${key}`);
  process.exit(1);
}

console.log(`Validated ${requiredSecrets.length} required secret names without printing values.`);
