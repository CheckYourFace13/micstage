/**
 * Production build entrypoint.
 * Clears an inherited NODE_ENV=development (Cursor/agent shells often set this),
 * which breaks Next.js 16 prerender of /_global-error with useContext-of-null.
 * Then runs ads.txt write → prisma generate → next build in the same process tree.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const nodeExec = process.execPath;

const env = { ...process.env };
if (env.NODE_ENV === "development") {
  delete env.NODE_ENV;
  console.log("[build] Cleared inherited NODE_ENV=development for next build");
}

function runNodeScript(scriptRel, extraArgs = []) {
  const script = path.join(root, scriptRel);
  const result = spawnSync(nodeExec, [script, ...extraArgs], {
    cwd: root,
    env,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function runNodeModuleBin(binRel, args) {
  const bin = path.join(root, "node_modules", binRel);
  const result = spawnSync(nodeExec, [bin, ...args], {
    cwd: root,
    env,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

runNodeScript("scripts/write-ads-txt.mjs");
runNodeModuleBin(path.join("prisma", "build", "index.js"), ["generate", "--schema=prisma/schema.prisma"]);
runNodeModuleBin(path.join("next", "dist", "bin", "next"), ["build"]);
