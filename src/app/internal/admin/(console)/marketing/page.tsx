import Link from "next/link";
import { assertAdminSession } from "@/lib/adminAuth";
import {
  adminApproveOutreachDraftAction,
  adminCreateOutreachDraftAction,
  adminDeliverabilitySeedTestAction,
  adminEnqueueMarketingInfraSelfTestAction,
  adminMarketingTestSendAction,
  adminRejectOutreachDraftAction,
  adminSendBulkOutreachDraftsAction,
  adminSendOutreachDraftAction,
} from "@/app/internal/admin/marketingLiveActions";
import { explainMarketingSendBlock } from "@/lib/marketing/blockReasons";
import {
  fromAddressForMicStageCategory,
  marketingDailyCap,
  marketingPerDomainDailyCap,
} from "@/lib/marketing/emailConfig";
import { loadVenueOutreachDraft } from "@/lib/marketing/venueOutreachDrafts";
import { normalizeMarketingEmail } from "@/lib/marketing/normalizeEmail";
import { requirePrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type RecentSendFailureMeta = {
  stage?: string;
  provider?: string;
  providerErrorMessage?: string;
  httpStatus?: number | null;
  providerMessageId?: string | null;
};

function parseSendFailureMeta(input: string | null): RecentSendFailureMeta | null {
  if (!input) return null;
  try {
    const parsed = JSON.parse(input) as RecentSendFailureMeta;
    if (parsed && typeof parsed === "object") return parsed;
    return null;
  } catch {
    return { providerErrorMessage: input };
  }
}

export default async function AdminMarketingPage(props: {
  searchParams: Promise<{
    venueId?: string;
    selfTest?: string;
    draftOk?: string;
    draftErr?: string;
    apprOk?: string;
    sendOk?: string;
    sendErr?: string;
    bulkOk?: string;
    bulkErr?: string;
    testOk?: string;
    testErr?: string;
    seedOk?: string;
    seedErr?: string;
  }>;
}) {
  await assertAdminSession();
  const params = await props.searchParams;
  const prisma = requirePrisma();

  let eventCount = 0;
  let jobCount = 0;
  let contactCount = 0;
  let suppressionCount = 0;
  let sendCount = 0;
  let blockedSendCount = 0;
  let recentEvents: { id: string; createdAt: Date; type: string; discoveryMarketSlug: string | null }[] = [];
  let recentJobs: { id: string; createdAt: Date; status: string; kind: string }[] = [];
  let recentSends: {
    id: string;
    createdAt: Date;
    status: string;
    category: string;
    templateKind: string;
    subject: string;
    toEmailNormalized: string;
    blockedReason: string | null;
    providerMessageId: string | null;
    lastError: string | null;
    sentAt: Date | null;
  }[] = [];
  let outreachDrafts: {
    id: string;
    createdAt: Date;
    status: string;
    toEmailNormalized: string;
    subject: string;
    venue: { name: string; slug: string };
  }[] = [];
  let loadError: string | null = null;
  let sampleVenues: { id: string; name: string; slug: string; ownerEmail: string }[] = [];

  try {
    const [ec, jc, cc, sc, sAll, sBlocked, ev, jb, sd, od, sv] = await Promise.all([
      prisma.marketingEvent.count(),
      prisma.marketingJob.count(),
      prisma.marketingContact.count(),
      prisma.marketingEmailSuppression.count(),
      prisma.marketingEmailSend.count(),
      prisma.marketingEmailSend.count({ where: { status: "BLOCKED" } }),
      prisma.marketingEvent.findMany({
        orderBy: { createdAt: "desc" },
        take: 12,
        select: { id: true, createdAt: true, type: true, discoveryMarketSlug: true },
      }),
      prisma.marketingJob.findMany({
        orderBy: { createdAt: "desc" },
        take: 12,
        select: { id: true, createdAt: true, status: true, kind: true },
      }),
      prisma.marketingEmailSend.findMany({
        orderBy: { createdAt: "desc" },
        take: 25,
        select: {
          id: true,
          createdAt: true,
          status: true,
          category: true,
          templateKind: true,
          subject: true,
          toEmailNormalized: true,
          blockedReason: true,
          providerMessageId: true,
          lastError: true,
          sentAt: true,
        },
      }),
      prisma.marketingOutreachDraft.findMany({
        orderBy: { createdAt: "desc" },
        take: 30,
        select: {
          id: true,
          createdAt: true,
          status: true,
          toEmailNormalized: true,
          subject: true,
          venue: { select: { name: true, slug: true } },
        },
      }),
      prisma.venue.findMany({
        orderBy: { createdAt: "desc" },
        take: 12,
        select: { id: true, name: true, slug: true, owner: { select: { email: true } } },
      }),
    ]);
    eventCount = ec;
    jobCount = jc;
    contactCount = cc;
    suppressionCount = sc;
    sendCount = sAll;
    blockedSendCount = sBlocked;
    recentEvents = ev;
    recentJobs = jb;
    recentSends = sd;
    outreachDrafts = od;
    sampleVenues = sv.map((v) => ({ id: v.id, name: v.name, slug: v.slug, ownerEmail: v.owner.email }));
  } catch (e) {
    loadError = e instanceof Error ? e.message : "Failed to load marketing tables (run migrations?)";
  }

  const venueId = params.venueId ?? sampleVenues[0]?.id;
  let draftPreview: Awaited<ReturnType<typeof loadVenueOutreachDraft>> = null;
  let blockPreview: { email: string; lines: string[] } | null = null;
  if (venueId && !loadError) {
    try {
      draftPreview = await loadVenueOutreachDraft(prisma, venueId);
      const v = sampleVenues.find((x) => x.id === venueId);
      const email = v ? normalizeMarketingEmail(v.ownerEmail) : "";
      if (email) {
        const c = await prisma.marketingContact.findUnique({ where: { emailNormalized: email } });
        const x = await explainMarketingSendBlock(prisma, { to: email, category: "outreach", contact: c });
        blockPreview = { email, lines: x.blocked ? x.reasons : ["Not blocked for outreach (still requires approved draft for cold send)."] };
      }
    } catch {
      draftPreview = null;
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="rounded-lg border border-emerald-500/35 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100/95">
        <strong>Controlled live beta.</strong> Outbound email uses Resend with category-based From addresses, suppression,
        caps, and full send logging. Cold venue outreach requires <span className="font-medium">review → approve → send</span>.
        Mass cold campaigns and follow-up sequences are not auto-scheduled.
      </div>

      <h1 className="mt-6 text-2xl font-semibold text-white">Marketing operations</h1>
      <p className="mt-2 max-w-3xl text-sm text-zinc-400">
        Discovery context for drafts uses the same rules as{" "}
        <Link className="text-emerald-400 underline hover:text-emerald-300" href="/locations">
          /locations
        </Link>
        . See repo docs for env vars: <code className="text-zinc-300">EMAIL_FROM_*</code>,{" "}
        <code className="text-zinc-300">MARKETING_CAP_*</code>, <code className="text-zinc-300">MARKETING_UNSUBSCRIBE_SECRET</code>
        , <code className="text-zinc-300">MARKETING_PHYSICAL_ADDRESS</code>.
      </p>

      {loadError ? (
        <p className="mt-4 rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">{loadError}</p>
      ) : null}

      <Flash params={params} />

      <section className="mt-8 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
        <h2 className="text-lg font-medium text-white">Sending identity &amp; daily caps (effective)</h2>
        <p className="mt-1 text-xs text-zinc-500">
          From strings resolve from <code className="text-zinc-400">EMAIL_FROM_*</code> env (see code for fallbacks).
        </p>
        <ul className="mt-3 space-y-2 text-xs text-zinc-300">
          <li>
            <span className="text-zinc-500">Transactional:</span>{" "}
            <code className="break-all text-[11px] text-emerald-200/90">{fromAddressForMicStageCategory("transactional")}</code>{" "}
            · cap {marketingDailyCap("transactional")}/day
          </li>
          <li>
            <span className="text-zinc-500">Outreach:</span>{" "}
            <code className="break-all text-[11px] text-emerald-200/90">{fromAddressForMicStageCategory("outreach")}</code> · cap{" "}
            {marketingDailyCap("outreach")}/day
          </li>
          <li>
            <span className="text-zinc-500">Marketing:</span>{" "}
            <code className="break-all text-[11px] text-emerald-200/90">{fromAddressForMicStageCategory("marketing")}</code> · cap{" "}
            {marketingDailyCap("marketing")}/day
          </li>
          <li className="text-zinc-500">
            Per recipient domain (UTC): outreach {marketingPerDomainDailyCap("OUTREACH")}/day · marketing{" "}
            {marketingPerDomainDailyCap("MARKETING")}/day
          </li>
        </ul>
      </section>

      <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Email sends (all)" value={sendCount} sub={`${blockedSendCount} blocked`} />
        <Stat label="Marketing events" value={eventCount} />
        <Stat label="Jobs" value={jobCount} />
        <Stat label="Contacts" value={contactCount} />
        <Stat label="Global suppressions" value={suppressionCount} />
      </section>

      <section className="mt-10 grid gap-8 lg:grid-cols-3">
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
          <h2 className="text-lg font-medium text-white">Manual test send</h2>
          <p className="mt-1 text-xs text-zinc-500">Sends a real outreach-class email to your inbox (subject prefixed). Uses the live pipeline.</p>
          <form action={adminMarketingTestSendAction} className="mt-3 flex flex-wrap items-end gap-2">
            <label className="grid gap-1 text-sm">
              <span className="text-zinc-400">Your email</span>
              <input
                name="testEmail"
                type="email"
                required
                placeholder="you@domain.com"
                className="h-10 min-w-[14rem] rounded border border-zinc-700 bg-black/40 px-2 text-white"
              />
            </label>
            <button
              type="submit"
              className="h-10 rounded-md bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-500"
            >
              Send test
            </button>
          </form>
        </div>

        <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
          <h2 className="text-lg font-medium text-white">Deliverability seed (Gmail + Outlook)</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Sends a <span className="text-zinc-300">marketing</span>-category message with the full commercial footer and
            List-Unsubscribe headers. Use seed inboxes you control in both providers.
          </p>
          <form action={adminDeliverabilitySeedTestAction} className="mt-3 flex flex-wrap items-end gap-2">
            <label className="grid gap-1 text-sm">
              <span className="text-zinc-400">Seed inbox</span>
              <input
                name="seedEmail"
                type="email"
                required
                placeholder="seed@gmail.com"
                className="h-10 min-w-[14rem] rounded border border-zinc-700 bg-black/40 px-2 text-white"
              />
            </label>
            <button
              type="submit"
              className="h-10 rounded-md bg-sky-700 px-4 text-sm font-semibold text-white hover:bg-sky-600"
            >
              Send seed checklist
            </button>
          </form>
        </div>

        <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
          <h2 className="text-lg font-medium text-white">Queue self-test</h2>
          <p className="mt-1 text-xs text-zinc-500">DB-only infrastructure job + audit row.</p>
          <form action={adminEnqueueMarketingInfraSelfTestAction} className="mt-3">
            <button
              type="submit"
              className="rounded-md border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 hover:bg-zinc-700"
            >
              Enqueue infrastructure self-test job
            </button>
          </form>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-medium text-white">Venue cold outreach (approval required)</h2>
        <p className="mt-1 max-w-3xl text-xs text-zinc-500">
          1) Pick venue → prepare draft (PENDING_REVIEW). 2) Approve. 3) Send individually or select multiple approved rows
          for bulk send.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {sampleVenues.map((v) => (
            <Link
              key={v.id}
              href={`/internal/admin/marketing?venueId=${encodeURIComponent(v.id)}`}
              className={`rounded-md border px-2 py-1 text-xs ${
                v.id === venueId ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-100" : "border-zinc-700 text-zinc-300"
              }`}
            >
              {v.name}
            </Link>
          ))}
        </div>
        {blockPreview ? (
          <div className="mt-3 rounded border border-zinc-800 bg-black/30 px-3 py-2 text-xs text-zinc-400">
            <span className="font-medium text-zinc-300">Send check for {blockPreview.email}</span>
            <ul className="mt-1 list-inside list-disc">
              {blockPreview.lines.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {draftPreview && venueId ? (
          <form action={adminCreateOutreachDraftAction} className="mt-4 flex flex-wrap items-end gap-3">
            <input type="hidden" name="venueId" value={venueId} />
            <label className="grid gap-1 text-sm">
              <span className="text-zinc-400">To (defaults to venue owner)</span>
              <input
                name="toEmail"
                type="email"
                placeholder="owner@venue.com"
                className="h-10 min-w-[16rem] rounded border border-zinc-700 bg-black/40 px-2 text-white"
              />
            </label>
            <button type="submit" className="h-10 rounded-md bg-zinc-700 px-4 text-sm font-medium text-white hover:bg-zinc-600">
              Prepare outreach draft
            </button>
          </form>
        ) : null}
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-medium text-white">Outreach drafts</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Bulk send uses only rows you tick; it does not send pending review.
        </p>
        {/* Remote checkboxes + submit (valid HTML — no nested forms). */}
        <form id="bulk-outreach-send" action={adminSendBulkOutreachDraftsAction} className="hidden" aria-hidden />
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-xs text-zinc-400">
            <thead>
              <tr className="border-b border-zinc-800 text-[10px] uppercase tracking-wide text-zinc-500">
                <th className="py-2 pr-2">Sel</th>
                <th className="py-2 pr-2">Status</th>
                <th className="py-2 pr-2">Venue</th>
                <th className="py-2 pr-2">To</th>
                <th className="py-2 pr-2">Subject</th>
                <th className="py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {outreachDrafts.map((d) => (
                <tr key={d.id} className="border-b border-zinc-800/80">
                  <td className="py-2 pr-2">
                    {d.status === "APPROVED" ? (
                      <input
                        form="bulk-outreach-send"
                        type="checkbox"
                        name="draftId"
                        value={d.id}
                        className="accent-emerald-500"
                      />
                    ) : null}
                  </td>
                  <td className="py-2 pr-2 text-zinc-200">{d.status}</td>
                  <td className="py-2 pr-2">{d.venue.name}</td>
                  <td className="py-2 pr-2 font-mono text-[10px]">{d.toEmailNormalized}</td>
                  <td className="py-2 pr-2">{d.subject.slice(0, 48)}</td>
                  <td className="py-2">
                    <div className="flex flex-wrap gap-1">
                      {d.status === "PENDING_REVIEW" ? (
                        <form action={adminApproveOutreachDraftAction} className="inline">
                          <input type="hidden" name="draftId" value={d.id} />
                          <button type="submit" className="rounded bg-emerald-700/80 px-2 py-0.5 text-[10px] text-white">
                            Approve
                          </button>
                        </form>
                      ) : null}
                      {d.status === "PENDING_REVIEW" || d.status === "APPROVED" ? (
                        <form action={adminRejectOutreachDraftAction} className="inline">
                          <input type="hidden" name="draftId" value={d.id} />
                          <button type="submit" className="rounded bg-zinc-700 px-2 py-0.5 text-[10px] text-white">
                            Reject
                          </button>
                        </form>
                      ) : null}
                      {d.status === "APPROVED" ? (
                        <form action={adminSendOutreachDraftAction} className="inline">
                          <input type="hidden" name="draftId" value={d.id} />
                          <button type="submit" className="rounded bg-amber-600/90 px-2 py-0.5 text-[10px] text-white">
                            Send
                          </button>
                        </form>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3">
          <button
            type="submit"
            form="bulk-outreach-send"
            className="rounded-md border border-amber-500/50 bg-amber-600/20 px-3 py-1.5 text-xs font-medium text-amber-100 hover:bg-amber-600/30"
          >
            Send selected approved drafts
          </button>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-medium text-white">Recent email sends</h2>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-xs text-zinc-400">
            <thead>
              <tr className="border-b border-zinc-800 text-[10px] uppercase tracking-wide text-zinc-500">
                <th className="py-2 pr-2">When</th>
                <th className="py-2 pr-2">Status</th>
                <th className="py-2 pr-2">Category</th>
                <th className="py-2 pr-2">Template</th>
                <th className="py-2 pr-2">To</th>
                <th className="py-2 pr-2">Subject</th>
                <th className="py-2 pr-2">Resend id</th>
                <th className="py-2 pr-2">Fail stage</th>
                <th className="py-2 pr-2">HTTP</th>
                <th className="py-2 pr-2">Provider error</th>
                <th className="py-2">Blocked reason</th>
              </tr>
            </thead>
            <tbody>
              {recentSends.map((s) => {
                const meta = parseSendFailureMeta(s.lastError);
                const providerError = meta?.providerErrorMessage || (s.status === "FAILED" ? s.lastError : null);
                const phase = meta?.stage ?? "—";
                const http = typeof meta?.httpStatus === "number" ? String(meta.httpStatus) : "—";
                const resendId = s.providerMessageId ?? meta?.providerMessageId ?? "—";
                return (
                  <tr key={s.id} className="border-b border-zinc-800/80">
                    <td className="py-2 pr-2 whitespace-nowrap">{s.createdAt.toISOString().slice(0, 19)}Z</td>
                    <td className="py-2 pr-2 text-zinc-200">{s.status}</td>
                    <td className="py-2 pr-2">{s.category}</td>
                    <td className="py-2 pr-2 font-mono text-[10px]">{s.templateKind}</td>
                    <td className="py-2 pr-2 font-mono text-[10px]">{s.toEmailNormalized}</td>
                    <td className="py-2 pr-2">{s.subject.slice(0, 40)}</td>
                    <td className="py-2 pr-2 font-mono text-[10px]">{resendId}</td>
                    <td className="py-2 pr-2 font-mono text-[10px]">{phase}</td>
                    <td className="py-2 pr-2 font-mono text-[10px]">{http}</td>
                    <td className="py-2 pr-2 text-amber-200/80">{providerError?.slice(0, 180) ?? "—"}</td>
                    <td className="py-2 text-amber-200/80">{s.blockedReason ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-10 grid gap-8 lg:grid-cols-2">
        <div>
          <h2 className="text-lg font-medium text-white">Recent events</h2>
          <ul className="mt-2 space-y-1 text-xs text-zinc-400">
            {recentEvents.map((e) => (
              <li key={e.id} className="flex flex-wrap gap-x-2 border-b border-zinc-800/80 py-1">
                <span className="text-zinc-500">{e.createdAt.toISOString().slice(0, 19)}Z</span>
                <span className="text-zinc-200">{e.type}</span>
                {e.discoveryMarketSlug ? <span className="text-zinc-500">· {e.discoveryMarketSlug}</span> : null}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="text-lg font-medium text-white">Recent jobs</h2>
          <ul className="mt-2 space-y-1 text-xs text-zinc-400">
            {recentJobs.map((j) => (
              <li key={j.id} className="flex flex-wrap gap-x-2 border-b border-zinc-800/80 py-1">
                <span className="text-zinc-500">{j.createdAt.toISOString().slice(0, 19)}Z</span>
                <span className="text-zinc-200">{j.status}</span>
                <span className="text-zinc-500">{j.kind}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  );
}

function Stat({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-white">{value}</div>
      {sub ? <div className="text-xs text-zinc-500">{sub}</div> : null}
    </div>
  );
}

function Flash({ params }: { params: Record<string, string | undefined> }) {
  const bits: string[] = [];
  if (params.selfTest === "ok") bits.push("Self-test job enqueued.");
  if (params.selfTest === "err") bits.push("Self-test failed.");
  if (params.draftOk === "1") bits.push("Outreach draft created (PENDING_REVIEW).");
  if (params.draftErr) bits.push(`Draft error: ${params.draftErr}`);
  if (params.apprOk) bits.push("Draft approved.");
  if (params.sendOk) bits.push("Draft sent.");
  if (params.sendErr) bits.push(`Send error: ${params.sendErr}`);
  if (params.bulkOk) bits.push(`Bulk send ok (${params.bulkOk} ids).`);
  if (params.bulkErr) bits.push(`Bulk error: ${params.bulkErr}`);
  if (params.testOk === "1") bits.push("Test email dispatched.");
  if (params.testErr) bits.push(`Test error: ${params.testErr}`);
  if (params.seedOk === "1") bits.push("Deliverability seed email dispatched.");
  if (params.seedErr) bits.push(`Seed error: ${params.seedErr}`);
  if (bits.length === 0) return null;
  return (
    <div className="mt-4 space-y-1 rounded border border-zinc-700 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-200">
      {bits.map((b) => (
        <p key={b}>{b}</p>
      ))}
    </div>
  );
}
