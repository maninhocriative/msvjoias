import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

if (!existsSync(".secrets/production.env")) {
  console.error("Production deploy blocked: .secrets/production.env is missing locally.");
  process.exit(1);
}

for (const command of [
  ["pnpm", ["secrets:validate", "--", "--production"]],
  ["pnpm", ["typecheck"]],
  ["pnpm", ["lint"]],
  ["pnpm", ["test"]],
  ["pnpm", ["build"]]
] as const) {
  const result = spawnSync(command[0], command[1], { stdio: "inherit", shell: true });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log("Production deploy preflight passed. Apply migrations and deploy Cloudflare targets explicitly.");
