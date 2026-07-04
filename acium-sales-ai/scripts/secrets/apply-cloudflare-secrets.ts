import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { readEnvFile } from "./env-file";
import { requiredSecrets } from "./required-secrets";

const isProduction = process.argv.includes("--production");
if (!isProduction) {
  console.error("Refusing to apply Cloudflare secrets without --production.");
  process.exit(1);
}

if (process.env.CI === "true") {
  console.error("Refusing to apply local secrets from CI.");
  process.exit(1);
}

const envFile = resolve(process.cwd(), ".secrets", "production.env");
if (!existsSync(envFile)) {
  console.error("Missing .secrets/production.env.");
  process.exit(1);
}

const values = readEnvFile(envFile);
for (const key of requiredSecrets) {
  if (!values[key]?.trim()) {
    console.error(`Missing or empty required secret: ${key}`);
    process.exit(1);
  }
}

for (const key of requiredSecrets) {
  const result = spawnSync("npx", ["wrangler", "secret", "put", key], {
    input: values[key],
    stdio: ["pipe", "ignore", "pipe"],
    shell: true
  });

  if (result.status !== 0) {
    console.error(`Failed to configure secret: ${key}`);
    process.exit(result.status ?? 1);
  }

  console.log(`Configured secret: ${key}`);
}
