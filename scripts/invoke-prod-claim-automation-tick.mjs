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

  function gatesMatch(runtime) {
    return (
      runtime?.claimInvitesEnabled === "enabled" &&
      runtime?.LISTING_CLAIM_INVITES_PER_CRON?.effective === 2 &&
      runtime?.MICSTAGE_CLAIM_INVITES_DAILY_MAX?.effective === 10 &&
      runtime?.MICSTAGE_KILL_CLAIM_INVITES?.effective === "disabled"
    );
  }

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

    if (!gatesMatch(envJson.runtime)) {
      console.log(
        JSON.stringify(
          {
            ok: false,
            error: "effective_gates_not_ready",
            note: "Need ENABLED=enabled, PER_CRON=2, DAILY_MAX=10, KILL=disabled (effective).",
            runtime: envJson.runtime,
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
          runtime: envJson.runtime,
          derived: envJson.derived,
          tickHttpStatus: tickRes.status,
          listingClaimInvites: tick?.listingClaimInvites ?? null,
          outreachSkippedReason: tick?.outreachSkippedReason ?? null,
          autoDraftsSends: tick?.autoDrafts?.outreachSendsThisRun ?? null,
          beforeSentToday: before?.gates?.sentToday ?? null,
          afterSentToday: after?.gates?.sentToday ?? null,
          sentDelta: (after?.gates?.sentToday ?? 0) - (before?.gates?.sentToday ?? 0),
          recentSendsRedacted: after?.sentTodayRedacted ?? null,
          pause: after?.gates?.paused ?? null,
          pauseReason: after?.gates?.pauseReason ?? null,
          bookableTemplates: after?.activity?.bookableTemplates ?? null,
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
