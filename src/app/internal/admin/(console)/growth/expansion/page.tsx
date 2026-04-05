import Link from "next/link";
import { assertAdminSession } from "@/lib/adminAuth";
import {
  addQueuedGrowthLaunchMarketAction,
  duplicateGrowthLaunchFromTemplateAction,
  runGrowthExpansionCheckNowAction,
  setGrowthLaunchMarketStatusAction,
  setGrowthLaunchSortOrderAction,
  toggleGrowthLaunchAutoExpansionAction,
  toggleGrowthLaunchColdRelaxAction,
} from "@/app/internal/admin/growthExpansionActions";
import { growthAutoExpansionCronEnabled, loadExpansionThresholdsFromEnv } from "@/lib/growth/expansionConfig";
import { countGlobalComplaintLikeWebhookSignals, loadMarketHealthForExpansion } from "@/lib/growth/expansionHealth";
import type { GrowthLaunchMarket } from "@/generated/prisma/client";
import { requirePrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function GrowthLaunchExpansionPage(props: {
  searchParams: Promise<{
    ok?: string;
    err?: string;
    info?: string;
    activated?: string;
  }>;
}) {
  await assertAdminSession();
  const flash = await props.searchParams;
  const prisma = requirePrisma();

  const markets = await prisma.growthLaunchMarket.findMany({ orderBy: { sortOrder: "asc" } });
  const thresholds = loadExpansionThresholdsFromEnv();
  const cronOn = growthAutoExpansionCronEnabled();
  const globalComplaints = await countGlobalComplaintLikeWebhookSignals(prisma);

  const healthEntries = await Promise.all(
    markets.map(async (m) => [m.discoveryMarketSlug, await loadMarketHealthForExpansion(prisma, m.discoveryMarketSlug)] as const),
  );
  const healthBySlug = Object.fromEntries(healthEntries);

  const active = markets.filter((m) => m.status === "ACTIVE");
  const queued = markets.filter((m) => m.status === "QUEUED");
  const paused = markets.filter((m) => m.status === "PAUSED");

  return (
    <main className="mx-auto max-w-6xl px-3 py-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold text-white">Launch markets &amp; auto-expansion</h1>
        <Link href="/internal/admin/growth" className="text-sm text-zinc-400 hover:text-white">
          ← Growth hub
        </Link>
      </div>
      <p className="mt-2 max-w-3xl text-sm text-zinc-400">
        Markets are ordered by <code className="text-zinc-300">sortOrder</code>. Auto-expansion promotes the next{" "}
        <span className="text-zinc-200">QUEUED</span> row only when the immediately preceding row is{" "}
        <span className="text-zinc-200">ACTIVE</span>, has auto-expansion enabled, and that market’s health metrics meet env
        thresholds. Cron requires <code className="text-zinc-300">GROWTH_AUTO_EXPANSION_ENABLED=true</code>.
      </p>

      <Flash flash={flash} />

      <section className="mt-6 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
        <h2 className="text-sm font-medium text-white">Cron &amp; thresholds</h2>
        <ul className="mt-2 space-y-1 text-xs text-zinc-400">
          <li>
            Scheduled job: <code className="text-zinc-300">/api/cron/growth-expansion</code> (same auth as booking reminders).
          </li>
          <li>
            Cron gate: <span className="text-zinc-200">{cronOn ? "ON" : "OFF"}</span>{" "}
            <code className="text-zinc-500">(GROWTH_AUTO_EXPANSION_ENABLED)</code>
          </li>
          <li>
            Global complaint-like webhooks (90d, placeholder):{" "}
            <span className="text-zinc-200">{globalComplaints}</span> / cap {thresholds.maxComplaintSignalsGlobal}
          </li>
          <li className="pt-1 text-zinc-500">
            Thresholds (env): min approved {thresholds.minApprovedLeads}, sent {thresholds.minSentEmails}, replies{" "}
            {thresholds.minReplies}, joined {thresholds.minJoinedConversions}; max bounce{" "}
            {(thresholds.maxBounceRate * 100).toFixed(2)}%, max unsub {(thresholds.maxUnsubscribeRate * 100).toFixed(2)}%.
          </li>
        </ul>
        <form action={runGrowthExpansionCheckNowAction} className="mt-3">
          <button
            type="submit"
            className="rounded-md bg-emerald-700 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-600"
          >
            Run expansion check now (admin bypasses cron env gate)
          </button>
        </form>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-medium text-white">Market health (all rows)</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Rates use touched leads = contacted + replied + joined + bounced + unsubscribed. Replies = max(replied status,
          EMAIL response logs).
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[960px] text-left text-xs text-zinc-400">
            <thead>
              <tr className="border-b border-zinc-800 text-[10px] uppercase tracking-wide text-zinc-500">
                <th className="py-2 pr-2">Slug</th>
                <th className="py-2 pr-2">Status</th>
                <th className="py-2 pr-2">Approved</th>
                <th className="py-2 pr-2">Sent</th>
                <th className="py-2 pr-2">Replies</th>
                <th className="py-2 pr-2">Joined</th>
                <th className="py-2 pr-2">Bounce %</th>
                <th className="py-2 pr-2">Unsub %</th>
                <th className="py-2 pr-2">Touched</th>
              </tr>
            </thead>
            <tbody>
              {markets.map((m) => {
                const h = healthBySlug[m.discoveryMarketSlug];
                return (
                  <tr key={m.id} className="border-b border-zinc-800/80">
                    <td className="py-2 pr-2 font-mono text-[10px] text-zinc-300">{m.discoveryMarketSlug}</td>
                    <td className="py-2 pr-2 text-zinc-200">{m.status}</td>
                    <td className="py-2 pr-2">{h.approvedLeads}</td>
                    <td className="py-2 pr-2">{h.sentEmails}</td>
                    <td className="py-2 pr-2">{h.replies}</td>
                    <td className="py-2 pr-2">{h.joinedConversions}</td>
                    <td className="py-2 pr-2">{(h.bounceRate * 100).toFixed(2)}</td>
                    <td className="py-2 pr-2">{(h.unsubscribeRate * 100).toFixed(2)}</td>
                    <td className="py-2 pr-2">{h.touchedDenominator}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-zinc-600">
          Per-market complaint blocking is not wired yet; gating uses the global webhook placeholder above.
        </p>
      </section>

      <LaunchTable title="Active" markets={active} healthBySlug={healthBySlug} />
      <LaunchTable title="Queued" markets={queued} healthBySlug={healthBySlug} />
      <LaunchTable title="Paused" markets={paused} healthBySlug={healthBySlug} />

      <section className="mt-10 grid gap-8 lg:grid-cols-2">
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
          <h2 className="text-sm font-medium text-white">Add queued market</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Slug must match a rollup in <code className="text-zinc-400">discoveryMarket</code> (e.g.{" "}
            <code className="text-zinc-400">austin-tx</code>). Appended at end of <code className="text-zinc-400">sortOrder</code>
            .
          </p>
          <form action={addQueuedGrowthLaunchMarketAction} className="mt-3 grid gap-2 text-sm">
            <label className="grid gap-1">
              <span className="text-zinc-400">Discovery slug</span>
              <input
                name="discoveryMarketSlug"
                required
                placeholder="austin-tx"
                className="rounded border border-zinc-700 bg-black/40 px-2 py-1.5 font-mono text-xs text-white"
              />
            </label>
            <label className="grid gap-1">
              <span className="text-zinc-400">Label</span>
              <input name="label" required className="rounded border border-zinc-700 bg-black/40 px-2 py-1.5 text-white" />
            </label>
            <label className="grid gap-1">
              <span className="text-zinc-400">Region default (optional)</span>
              <input name="regionDefault" placeholder="TX" className="rounded border border-zinc-700 bg-black/40 px-2 py-1.5 text-white" />
            </label>
            <button type="submit" className="w-fit rounded-md bg-zinc-700 px-3 py-2 text-white hover:bg-zinc-600">
              Add to queue
            </button>
          </form>
        </div>

        <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
          <h2 className="text-sm font-medium text-white">Duplicate from template (e.g. Chicagoland)</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Creates a new <span className="text-zinc-300">QUEUED</span> row with conservative defaults (cold approval still
            required).
          </p>
          <form action={duplicateGrowthLaunchFromTemplateAction} className="mt-3 grid gap-2 text-sm">
            <label className="grid gap-1">
              <span className="text-zinc-400">Template slug</span>
              <input
                name="templateSlug"
                defaultValue="chicagoland-il"
                className="rounded border border-zinc-700 bg-black/40 px-2 py-1.5 font-mono text-xs text-white"
              />
            </label>
            <label className="grid gap-1">
              <span className="text-zinc-400">New discovery slug</span>
              <input
                name="newDiscoveryMarketSlug"
                required
                className="rounded border border-zinc-700 bg-black/40 px-2 py-1.5 font-mono text-xs text-white"
              />
            </label>
            <label className="grid gap-1">
              <span className="text-zinc-400">Label</span>
              <input name="label" required className="rounded border border-zinc-700 bg-black/40 px-2 py-1.5 text-white" />
            </label>
            <label className="grid gap-1">
              <span className="text-zinc-400">Region (optional)</span>
              <input name="regionDefault" className="rounded border border-zinc-700 bg-black/40 px-2 py-1.5 text-white" />
            </label>
            <button type="submit" className="w-fit rounded-md bg-emerald-800 px-3 py-2 text-white hover:bg-emerald-700">
              Create queued clone
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}

function Flash({
  flash,
}: {
  flash: { ok?: string; err?: string; info?: string; activated?: string };
}) {
  if (flash.activated) {
    return (
      <p className="mt-4 rounded border border-emerald-600/40 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-100">
        Activated market <code className="text-emerald-200">{flash.activated}</code>.
      </p>
    );
  }
  if (flash.info) {
    return (
      <p className="mt-4 rounded border border-zinc-600/40 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-200">
        {flash.info}
      </p>
    );
  }
  if (flash.err) {
    return (
      <p className="mt-4 rounded border border-red-600/40 bg-red-950/40 px-3 py-2 text-sm text-red-100">
        {flash.err === "dupSlug"
          ? "That discovery slug already exists."
          : flash.err === "slugLabel"
            ? "Slug and label are required."
            : flash.err === "dupFields"
              ? "New slug and label are required for duplicate."
              : flash.err}
      </p>
    );
  }
  if (flash.ok) {
    return (
      <p className="mt-4 rounded border border-emerald-600/40 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-100">
        Saved ({flash.ok}).
      </p>
    );
  }
  return null;
}

function LaunchTable({
  title,
  markets,
  healthBySlug,
}: {
  title: string;
  markets: GrowthLaunchMarket[];
  healthBySlug: Record<string, Awaited<ReturnType<typeof loadMarketHealthForExpansion>>>;
}) {
  const rows = markets;
  return (
    <section className="mt-8">
      <h2 className="text-lg font-medium text-white">{title}</h2>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-zinc-500">None.</p>
      ) : (
        <ul className="mt-3 space-y-4">
          {rows.map((m) => {
            const h = healthBySlug[m.discoveryMarketSlug];
            return (
              <li key={m.id} className="rounded-lg border border-zinc-800 bg-black/20 p-4 text-xs text-zinc-400">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-medium text-white">{m.label}</div>
                    <div className="font-mono text-[10px] text-zinc-500">{m.discoveryMarketSlug}</div>
                    <div className="mt-2 text-[11px] text-zinc-500">
                      sort {m.sortOrder}
                      {m.regionDefault ? ` · region ${m.regionDefault}` : ""}
                      {m.activatedAt ? ` · activated ${m.activatedAt.toISOString().slice(0, 10)}` : ""}
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
                      <span>approved {h.approvedLeads}</span>
                      <span>sent {h.sentEmails}</span>
                      <span>replies {h.replies}</span>
                      <span>joined {h.joinedConversions}</span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <form action={setGrowthLaunchMarketStatusAction} className="flex flex-wrap items-center gap-1">
                      <input type="hidden" name="id" value={m.id} />
                      <select name="status" defaultValue={m.status} className="rounded border border-zinc-700 bg-black/40 px-2 py-1 text-white">
                        <option value="ACTIVE">ACTIVE</option>
                        <option value="QUEUED">QUEUED</option>
                        <option value="PAUSED">PAUSED</option>
                      </select>
                      <button type="submit" className="rounded bg-zinc-700 px-2 py-1 text-white">
                        Set status
                      </button>
                    </form>
                    <form action={setGrowthLaunchSortOrderAction} className="flex flex-wrap items-center gap-1">
                      <input type="hidden" name="id" value={m.id} />
                      <input
                        name="sortOrder"
                        type="number"
                        defaultValue={m.sortOrder}
                        className="w-20 rounded border border-zinc-700 bg-black/40 px-2 py-1 text-white"
                      />
                      <button type="submit" className="rounded bg-zinc-800 px-2 py-1 text-white">
                        Save order
                      </button>
                    </form>
                    <form action={toggleGrowthLaunchColdRelaxAction} className="inline">
                      <input type="hidden" name="id" value={m.id} />
                      <input type="hidden" name="next" value={m.coldApprovalRelaxed ? "false" : "true"} />
                      <button type="submit" className="rounded border border-amber-600/40 bg-amber-950/30 px-2 py-1 text-amber-100">
                        {m.coldApprovalRelaxed ? "Require cold approval again" : "Relax cold approval (send from pending)"}
                      </button>
                    </form>
                    <form action={toggleGrowthLaunchAutoExpansionAction} className="inline">
                      <input type="hidden" name="id" value={m.id} />
                      <input type="hidden" name="next" value={m.autoExpansionEnabled ? "false" : "true"} />
                      <button type="submit" className="rounded border border-zinc-600 bg-zinc-800 px-2 py-1 text-zinc-200">
                        {m.autoExpansionEnabled ? "Disable auto-expansion from this row" : "Enable auto-expansion from this row"}
                      </button>
                    </form>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
