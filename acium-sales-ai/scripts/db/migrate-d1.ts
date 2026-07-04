import { spawnSync } from "node:child_process";

const production = process.argv.includes("--production");
const args = ["wrangler", "d1", "migrations", "apply", "acium-sales-ai"];
if (!production) args.push("--local");

const result = spawnSync("npx", args, {
  cwd: process.cwd(),
  stdio: "inherit",
  shell: true
});

process.exit(result.status ?? 1);
