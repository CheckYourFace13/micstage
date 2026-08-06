/**
 * Invoke production claim-invite canary using CRON_SECRET only (no Resend key needed locally).
 *
 *   $env:CRON_SECRET="..."   # or MICSTAGE_CRON_SECRET — same as Hostinger
 *   npx tsx scripts/invoke-prod-claim-canary.mjs --mode=env
 *   npx tsx scripts/invoke-prod-claim-canary.mjs --mode=send --listing-slug=... --expected-domain=starrhill.com
 *
 * Uses process.exitCode (not process.exit) so undici/fetch handles can close cleanly on Node 24/tsx.
 */
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local", override: true });
loadEnv({ path: ".env" });

function arg(name) {
  const eq = process.argv.find((a) => a.startsWith(`${name}=`));
  if (eq) return eq.slice(name.length + 1);
  const i = process.argv.indexOf(name);
  if (i < 0 || i + 1 >= process.argv.length) return null;
  return process.argv[i + 1];
}

const secret = process.env.CRON_SECRET?.trim() || process.env.MICSTAGE_CRON_SECRET?.trim();
if (!secret) {
  console.error(
    JSON.stringify({
      ok: false,
      error: "cron_secret_missing",
      note: "Set CRON_SECRET in the shell (Hostinger value). Do not put RESEND_API_KEY in local env.",
    }),
  );
  process.exitCode = 1;
} else {
  const mode = arg("--mode") || "env";
  const base = (process.env.APP_URL || "https://micstage.com").replace(/\/$/, "");

  async function main() {
    if (mode === "env" || mode === "status") {
      const path = mode === "status" ? "/api/cron/claim-invite-status" : "/api/cron/claim-invite-canary";
      const res = await fetch(`${base}${path}`, {
        headers: { Authorization: `Bearer ${secret}` },
      });
      const text = await res.text();
      console.log(text);
      process.exitCode = res.ok ? 0 : 1;
      return;
    }

    if (mode !== "send") {
      console.error(JSON.stringify({ ok: false, error: "invalid_mode", mode }));
      process.exitCode = 1;
      return;
    }

    const listingSlug = arg("--listing-slug");
    const expectedDomain = arg("--expected-domain");
    if (!listingSlug || !expectedDomain) {
      console.error(JSON.stringify({ ok: false, error: "missing_slug_or_domain" }));
      process.exitCode = 1;
      return;
    }
    if (!process.argv.includes("--confirm-real-canary-send")) {
      console.error(JSON.stringify({ ok: false, error: "missing_confirm_real_canary_send_flag" }));
      process.exitCode = 1;
      return;
    }

    const res = await fetch(`${base}/api/cron/claim-invite-canary`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        listingSlug,
        expectedDomain,
        useGrowthLeadEmail: true,
        confirm: "SEND_REAL_CANARY",
      }),
    });
    const text = await res.text();
    console.log(text);
    process.exitCode = res.ok ? 0 : 1;
  }

  main().catch((e) => {
    console.error(JSON.stringify({ ok: false, error: String(e?.message || e) }));
    process.exitCode = 1;
  });
}
