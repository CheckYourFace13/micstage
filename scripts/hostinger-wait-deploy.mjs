/**
 * Poll Hostinger Node.js builds for micstage.com until the newest build
 * completes (or fails), then print /api/health.
 *
 * Usage: node scripts/hostinger-wait-deploy.mjs [expectedShortSha]
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";

const DOMAIN = "micstage.com";
const USERNAME = "u703718100";
const expected = (process.argv[2] || "").trim().slice(0, 7).toLowerCase();
const maxMs = Number(process.env.HOSTINGER_WAIT_MS || 15 * 60 * 1000);
const pollMs = Number(process.env.HOSTINGER_POLL_MS || 15_000);

function loadToken() {
  if (process.env.HOSTINGER_API_TOKEN?.trim()) return process.env.HOSTINGER_API_TOKEN.trim();
  const p = path.join(
    process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"),
    "hostinger-mcp",
    "credentials.json",
  );
  const j = JSON.parse(readFileSync(p, "utf8"));
  return j.access_token || j.token || j.accessToken;
}

async function api(apiPath) {
  const token = loadToken();
  const url = `https://developers.hostinger.com${apiPath}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  if (!res.ok) throw new Error(`Hostinger ${res.status}: ${typeof body === "string" ? body : JSON.stringify(body)}`);
  return body;
}

async function latestBuild() {
  const body = await api(
    `/api/hosting/v1/accounts/${USERNAME}/websites/${DOMAIN}/nodejs/builds?per_page=5`,
  );
  const rows = body?.data || body || [];
  return Array.isArray(rows) ? rows[0] : null;
}

async function health() {
  const res = await fetch(`https://${DOMAIN}/api/health`, { cache: "no-store" });
  return { status: res.status, body: await res.json() };
}

const started = Date.now();
let sawPending = false;
console.log(`[wait] micstage.com Hostinger deploy${expected ? ` expecting deployCommit=${expected}` : ""}`);

while (Date.now() - started < maxMs) {
  const b = await latestBuild();
  if (!b) {
    console.log("[wait] no builds yet");
  } else {
    console.log(`[wait] build ${b.uuid} state=${b.state} updated=${b.updated_at}`);
    if (b.state === "pending" || b.state === "running" || b.state === "building" || b.state === "queued") {
      sawPending = true;
    }
    if (b.state === "failed" || b.state === "error") {
      console.error("[wait] build failed");
      process.exit(1);
    }
    if (b.state === "completed" || b.state === "success") {
      // If we never saw an in-flight build, keep polling until health matches or timeout
      // (git webhook may not have started yet).
      const h = await health();
      console.log("[wait] health", JSON.stringify(h.body));
      const got = String(h.body?.deployCommit || "").toLowerCase();
      if (expected) {
        if (got === expected && h.body?.ok) {
          console.log("[wait] deploy verified");
          process.exit(0);
        }
        if (!sawPending) {
          // wait for a newer build to start
        } else if (got && got !== expected) {
          // completed but SHA not updated yet — keep waiting briefly
        }
      } else if (h.body?.ok && sawPending) {
        console.log("[wait] deploy completed");
        process.exit(0);
      }
    }
  }
  await new Promise((r) => setTimeout(r, pollMs));
}

console.error("[wait] timed out");
process.exit(1);
