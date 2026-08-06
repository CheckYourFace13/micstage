/**
 * Invoke production growth-pipeline tick and report claim-invite automation result.
 *
 *   $env:CRON_SECRET="..."
 *   npx tsx scripts/invoke-prod-claim-automation-tick.mjs
 */
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local", override: true });
loadEnv({ path: ".env" });

const secret = process.env.CRON_SECRET?.trim() || process.env.MICSTAGE_CRON_SECRET?.trim();
if (!secret) {
  console.error(JSON.stringify({ ok: false, error: "cron_secret_missing" }));
  process.exitCode = 1;
} else {
  const base = (process.env.APP_URL || "https://micstage.com").replace(/\/$/, "");

  async function main() {
    const envRes = await fetch(`${base}/api/cron/claim-invite-canary`, {
      headers: { Authorization: `Bearer ${secret}` },
    });
    const envJson = await envRes.json();
    if (!envRes.ok || !envJson.ok) {
      console.log(JSON.stringify({ ok: false, step: "env", envJson }, null, 2));
      process.exitCode = 1;
      return;
    }
    if (envJson.derived?.claimInvitesEnabled !== "enabled") {
      console.log(
        JSON.stringify(
          {
            ok: false,
            error: "claim_invites_still_disabled_on_hostinger",
            note: "Set MICSTAGE_CLAIM_INVITES_ENABLED=true and LISTING_CLAIM_INVITES_PER_CRON=2 in hPanel, then re-run.",
            env: envJson.env,
            derived: envJson.derived,
          },
          null,
          2,
        ),
      );
      process.exitCode = 2;
      return;
    }

    const beforeStatus = await fetch(`${base}/api/cron/claim-invite-status`, {
      headers: { Authorization: `Bearer ${secret}` },
    });
    const before = await beforeStatus.json();

    const tickRes = await fetch(`${base}/api/cron/growth-pipeline?phase=tick`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}` },
    });
    const tickText = await tickRes.text();
    let tick;
    try {
      tick = JSON.parse(tickText);
    } catch {
      tick = { raw: tickText.slice(0, 500) };
    }

    const afterStatus = await fetch(`${base}/api/cron/claim-invite-status`, {
      headers: { Authorization: `Bearer ${secret}` },
    });
    const after = await afterStatus.json();

    console.log(
      JSON.stringify(
        {
          ok: tickRes.ok && tick?.ok !== false,
          envApplied: envJson.env,
          derived: envJson.derived,
          tickHttpStatus: tickRes.status,
          listingClaimInvites: tick?.listingClaimInvites ?? null,
          outreachSkippedReason: tick?.outreachSkippedReason ?? null,
          autoDraftsSends: tick?.autoDrafts?.outreachSendsThisRun ?? null,
          beforeSentToday: before?.daily?.sentTodayUtc ?? before?.derived?.dailyClaimInviteSent ?? null,
          afterSentToday: after?.daily?.sentTodayUtc ?? after?.derived?.dailyClaimInviteSent ?? null,
          recentSendsRedacted: after?.recentSends ?? after?.todaySends ?? null,
          pause: envJson.derived?.paused ?? after?.pause ?? null,
        },
        null,
        2,
      ),
    );
    process.exitCode = tickRes.ok ? 0 : 1;
  }

  main().catch((e) => {
    console.error(JSON.stringify({ ok: false, error: String(e?.message || e) }));
    process.exitCode = 1;
  });
}
