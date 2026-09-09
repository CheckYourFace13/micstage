/**
 * Call Hostinger API using OAuth credentials from hostinger-api-mcp login.
 * Usage: node scripts/hostinger-api.mjs GET /api/hpanel/v1/...
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";

function loadToken() {
  if (process.env.HOSTINGER_API_TOKEN?.trim()) return process.env.HOSTINGER_API_TOKEN.trim();
  const p = path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "hostinger-mcp", "credentials.json");
  const j = JSON.parse(readFileSync(p, "utf8"));
  return j.access_token || j.token || j.accessToken;
}

const method = process.argv[2] || "GET";
const apiPath = process.argv[3];
if (!apiPath) {
  console.error("Usage: node scripts/hostinger-api.mjs GET|POST|PUT|DELETE /api/...");
  process.exit(2);
}
const bodyArg = process.argv[4];
const token = loadToken();
if (!token) {
  console.error("No Hostinger token. Run: npx hostinger-api-mcp --login");
  process.exit(1);
}

const url = apiPath.startsWith("http") ? apiPath : `https://developers.hostinger.com${apiPath}`;
const res = await fetch(url, {
  method,
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  },
  body: bodyArg && method !== "GET" ? bodyArg : undefined,
});
const text = await res.text();
let json;
try {
  json = JSON.parse(text);
} catch {
  json = text;
}
console.log(JSON.stringify({ status: res.status, ok: res.ok, body: json }, null, 2));
// Avoid process.exit after undici on Windows (occasional STATUS_STACK_BUFFER_OVERRUN).
if (!res.ok) {
  process.exitCode = 1;
}
