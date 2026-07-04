import { spawnSync } from "node:child_process";

for (const command of [
  ["pnpm", ["typecheck"]],
  ["pnpm", ["test"]],
  ["pnpm", ["--filter", "@acium/web", "build"]]
] as const) {
  const result = spawnSync(command[0], command[1], { stdio: "inherit", shell: true });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log("Preview deploy preflight passed.");
