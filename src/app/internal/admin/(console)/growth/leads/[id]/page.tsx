import Link from "next/link";
import { notFound } from "next/navigation";
import { assertAdminSession } from "@/lib/adminAuth";
import {
  addGrowthLeadResponseAction,
  approveGrowthLeadDraftAction,
  createGrowthLeadFollowUpAction,
  generateGrowthLeadDraftAction,
  rejectGrowthLeadDraftAction,
  sendGrowthLeadDraftAction,
  updateGrowthLeadAcquisitionStageAction,
  updateGrowthLeadLocalityAction,
  updateGrowthLeadStatusAction,
} from "@/app/internal/admin/growthActions";
import type { GrowthLeadAcquisitionStage, GrowthLeadStatus } from "@/generated/prisma/client";
import { explainGrowthLeadOutreachBlock } from "@/lib/growth/growthLeadBlock";
import {
  describeGrowthLeadContactPaths,
  growthLeadPipelineBadge,
} from "@/lib/growth/growthLeadContactPathLabel";
import { growthFollowUpAutomationEnabled } from "@/lib/marketing/emailConfig";
import { normalizeMarketingEmail } from "@/lib/marketing/normalizeEmail";
import { requirePrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const STATUSES: GrowthLeadStatus[] = [
  "DISCOVERED",
  "REVIEWED",
  "APPROVED",
  "CONTACTED",
  "REPLIED",
  "JOINED",
  "BOUNCED",
  "UNSUBSCRIBED",
  "REJECTED",
];

const ACQUISITION_STAGES: GrowthLeadAcquisitionStage[] = [
  "DISCOVERED",
  "OUTREACH_DRAFTED",
  "OUTREACH_SENT",
  "CLICKED",
  "SIGNUP_STARTED",
  "ACCOUNT_CREATED",
  "LISTING_LIVE",
];

export default async function AdminGrowthLeadDetailPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; err?: string; sendErr?: string }>;
}) {
  await assertAdminSession();
  const { id } = await props.params;
  const flash = await props.searchParams;
  const prisma = requirePrisma();

  const lead = await prisma.growthLead.findUnique({
    where: { id },
    include: {
      outreachDrafts: { orderBy: { createdAt: "desc" } },
      responses: { orderBy: { createdAt: "desc" }, take: 30 },
      followUpSchedules: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!lead) notFound();

  const launchMarket = lead.discoveryMarketSlug
    ? await prisma.growthLaunchMarket.findFirst({
        where: { discoveryMarketSlug: { equals: lead.discoveryMarketSlug, mode: "insensitive" } },
      })
    : null;

  const pathLabels = describeGrowthLeadContactPaths({
    contactUrl: lead.contactUrl,
    websiteUrl: lead.websiteUrl,
    instagramUrl: lead.instagramUrl,
    facebookUrl: lead.facebookUrl,
    youtubeUrl: lead.youtubeUrl,
    tiktokUrl: lead.tiktokUrl,
  });
  const pipelineUi = growthLeadPipelineBadge({
    contactQuality: lead.contactQuality,
    contactEmailNormalized: lead.contactEmailNormalized,
    contactEmailConfidence: lead.contactEmailConfidence,
  });

  const email = lead.contactEmailNormalized ? normalizeMarketingEmail(lead.contactEmailNormalized) : null;
  let blockPreview: { blocked: boolean; reasons: string[] } | null = null;
  if (email) {
    const contact = await prisma.marketingContact.findUnique({ where: { emailNormalized: email } });
    blockPreview = await explainGrowthLeadOutreachBlock(prisma, {
      leadStatus: lead.status,
      toEmail: email,
      contact,
      discoveryMarketSlug: lead.discoveryMarketSlug,
    });
  }

  return (
    <main className="mx-auto max-w-4xl px-3 py-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold text-white">{lead.name}</h1>
        <div className="flex flex-wrap gap-3 text-sm">
          <Link href="/internal/admin/growth" className="text-zinc-400 hover:text-white">
            ← Growth hub
          </Link>
          {lead.discoveryMarketSlug ? (
            <Link
              href={`/internal/admin/growth/leads?market=${encodeURIComponent(lead.discoveryMarketSlug)}`}
              className="text-emerald-400 hover:text-emerald-300"
            >
              Market list
            </Link>
          ) : null}
        </div>
      </div>
      <p className="mt-1 text-xs text-zinc-500">
        {lead.leadType} · {lead.status}
        {lead.discoveryMarketSlug ? ` · market: ${lead.discoveryMarketSlug}` : ""}
      </p>

      {flash.err ? (
        <p className="mt-3 rounded border border-red-600/40 bg-red-950/40 px-3 py-2 text-sm text-red-100">
          {flash.err === "draftExists"
            ? "This lead already has an active or sent outreach draft."
            : flash.err === "needEmail"
              ? "Add a contact email before generating a draft."
              : flash.err === "missingLead"
                ? "Lead not found."
                : flash.err === "draftErr"
                  ? "Could not create draft (check email and duplicates)."
                  : flash.err}
        </p>
      ) : null}
      {flash.sendErr ? (
        <p className="mt-3 rounded border border-amber-600/40 bg-amber-950/40 px-3 py-2 text-sm text-amber-100">
          Send blocked / failed: {flash.sendErr}
        </p>
      ) : null}
      {flash.ok ? (
        <p className="mt-3 rounded border border-emerald-600/40 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-100">
          {flash.ok === "acquisition"
            ? "Acquisition stage updated."
            : flash.ok === "draft"
              ? "Draft created."
              : flash.ok === "sent"
                ? "Draft sent."
                : `Updated (${flash.ok}).`}
        </p>
      ) : null}

      <section className="mt-6 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
        <h2 className="text-sm font-medium text-white">Lead record</h2>
        <dl className="mt-2 grid gap-2 text-xs text-zinc-400 sm:grid-cols-2">
          <div>
            <dt className="text-zinc-500">Email (normalized)</dt>
            <dd className="font-mono text-zinc-200">{lead.contactEmailNormalized ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Email raw / confidence</dt>
            <dd className="font-mono text-[11px] text-zinc-200">
              {lead.contactEmailRaw ?? "—"}
              {lead.contactEmailConfidence ? ` · ${lead.contactEmailConfidence}` : ""}
            </dd>
          </div>
          <div>
            <dt className="text-zinc-500">Email rejection</dt>
            <dd className="text-amber-200/90">{lead.contactEmailRejectionReason ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Contact URL</dt>
            <dd className="break-all text-zinc-200">{lead.contactUrl ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Website</dt>
            <dd className="break-all text-zinc-200">{lead.websiteUrl ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Socials</dt>
            <dd className="break-all text-zinc-200">
              {[lead.instagramUrl, lead.facebookUrl, lead.youtubeUrl, lead.tiktokUrl].filter(Boolean).join(" · ") || "—"}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-zinc-500">Outreach pipeline &amp; path targets</dt>
            <dd className="text-zinc-200">
              <span className="font-medium text-emerald-200/90">{pipelineUi.label}</span>
              <span className="mt-1 block text-[11px] text-zinc-500">
                Path summary: {pathLabels.length ? pathLabels.join(" · ") : "—"} · MicStage does not auto-submit external
                contact forms; non-email URLs can be enqueued as <code className="text-zinc-600">MarketingJob</code> payloads for
                future automation or manual outreach.
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-zinc-500">Open-mic signal / contact / acquisition</dt>
            <dd className="font-mono text-[11px] text-zinc-200">
              {lead.openMicSignalTier ?? "—"} · {lead.contactQuality ?? "—"} · {lead.acquisitionStage}
            </dd>
          </div>
          <div>
            <dt className="text-zinc-500">Suburb</dt>
            <dd className="text-zinc-200">{lead.suburb ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">City / region</dt>
            <dd className="text-zinc-200">
              {lead.city ?? "—"}
              {lead.region ? `, ${lead.region}` : ""}
            </dd>
          </div>
          <div>
            <dt className="text-zinc-500">Discovery market</dt>
            <dd className="font-mono text-[10px] text-zinc-200">{lead.discoveryMarketSlug ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Tags</dt>
            <dd className="text-zinc-200">{lead.performanceTags.join(", ") || "—"}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Source / kind / confidence / fit</dt>
            <dd className="text-zinc-200">
              {lead.source ?? "—"} · {lead.sourceKind}
              {lead.discoveryConfidence != null ? ` · conf ${lead.discoveryConfidence}` : ""} · fit {lead.fitScore ?? "—"}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-zinc-500">Internal notes</dt>
            <dd className="whitespace-pre-wrap text-zinc-300">{lead.internalNotes ?? "—"}</dd>
          </div>
          {lead.discoveryHints != null ? (
            <div className="sm:col-span-2">
              <dt className="text-zinc-500">Discovery hints (autonomous)</dt>
              <dd className="max-h-64 overflow-auto rounded border border-zinc-800/80 bg-black/30 p-2 font-mono text-[10px] text-zinc-300">
                <pre className="whitespace-pre-wrap break-all">
                  {JSON.stringify(lead.discoveryHints, null, 2)}
                </pre>
              </dd>
            </div>
          ) : null}
        </dl>

        <form action={updateGrowthLeadLocalityAction} className="mt-4 grid gap-2 rounded border border-zinc-800/80 p-3 sm:grid-cols-2">
          <input type="hidden" name="leadId" value={lead.id} />
          <p className="sm:col-span-2 text-xs font-medium text-zinc-300">Locality &amp; market</p>
          <label className="grid gap-1 text-xs">
            <span className="text-zinc-500">Suburb</span>
            <input name="suburb" defaultValue={lead.suburb ?? ""} className="rounded border border-zinc-700 bg-black/40 px-2 py-1 text-white" />
          </label>
          <label className="grid gap-1 text-xs">
            <span className="text-zinc-500">City</span>
            <input name="city" defaultValue={lead.city ?? ""} className="rounded border border-zinc-700 bg-black/40 px-2 py-1 text-white" />
          </label>
          <label className="grid gap-1 text-xs">
            <span className="text-zinc-500">Region</span>
            <input name="region" defaultValue={lead.region ?? ""} className="rounded border border-zinc-700 bg-black/40 px-2 py-1 text-white" />
          </label>
          <label className="grid gap-1 text-xs">
            <span className="text-zinc-500">Discovery market slug</span>
            <input
              name="discoveryMarketSlug"
              defaultValue={lead.discoveryMarketSlug ?? ""}
              className="rounded border border-zinc-700 bg-black/40 px-2 py-1 font-mono text-[11px] text-white"
            />
          </label>
          <div className="sm:col-span-2">
            <button type="submit" className="rounded bg-zinc-700 px-3 py-1.5 text-xs text-white hover:bg-zinc-600">
              Save locality
            </button>
          </div>
        </form>

        {blockPreview ? (
          <div
            className={`mt-3 rounded border px-3 py-2 text-xs ${
              blockPreview.blocked
                ? "border-amber-600/50 bg-amber-950/30 text-amber-100"
                : "border-emerald-800/50 bg-emerald-950/20 text-emerald-100/90"
            }`}
          >
            <span className="font-medium">Outreach check {email ? `for ${email}` : ""}</span>
            <ul className="mt-1 list-inside list-disc">
              {blockPreview.blocked
                ? blockPreview.reasons.map((r) => <li key={r}>{r}</li>)
                : ["Not blocked by lead status or marketing suppression (still requires approved draft)."].map((r) => (
                    <li key={r}>{r}</li>
                  ))}
            </ul>
          </div>
        ) : (
          <p className="mt-3 text-xs text-amber-200/80">Add a contact email to see send / block preview.</p>
        )}

        <form action={updateGrowthLeadStatusAction} className="mt-4 flex flex-wrap items-end gap-2">
          <input type="hidden" name="leadId" value={lead.id} />
          <label className="grid gap-1 text-sm">
            <span className="text-zinc-400">Status</span>
            <select name="status" defaultValue={lead.status} className="rounded border border-zinc-700 bg-black/40 px-2 py-1.5 text-white">
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="rounded-md bg-zinc-700 px-3 py-2 text-sm text-white hover:bg-zinc-600">
            Save status
          </button>
        </form>

        <form action={updateGrowthLeadAcquisitionStageAction} className="mt-3 flex flex-wrap items-end gap-2 border-t border-zinc-800/80 pt-3">
          <input type="hidden" name="leadId" value={lead.id} />
          <label className="grid gap-1 text-sm">
            <span className="text-zinc-400">Venue acquisition stage (manual override)</span>
            <select
              name="acquisitionStage"
              defaultValue={lead.acquisitionStage}
              className="rounded border border-zinc-700 bg-black/40 px-2 py-1.5 font-mono text-[11px] text-white"
            >
              {ACQUISITION_STAGES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="rounded-md bg-zinc-700 px-3 py-2 text-sm text-white hover:bg-zinc-600">
            Save acquisition stage
          </button>
        </form>
        {lead.leadType === "VENUE" ? (
          <p className="mt-2 text-xs text-zinc-500">
            Outreach drafts auto-advance <span className="font-mono text-zinc-400">OUTREACH_DRAFTED</span> →{" "}
            <span className="font-mono text-zinc-400">OUTREACH_SENT</span>; registration links with{" "}
            <span className="font-mono text-zinc-400">?growthLead=…</span> advance{" "}
            <span className="font-mono text-zinc-400">CLICKED</span> and (on success){" "}
            <span className="font-mono text-zinc-400">ACCOUNT_CREATED</span>.
          </p>
        ) : null}
      </section>

      <section className="mt-8 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
        <h2 className="text-sm font-medium text-white">Outreach drafts</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Generate a draft (requires email), then approve and send. Venue priority leads may be auto-approved/sent by cron
          in ACTIVE markets under existing caps/cooldowns.{" "}
          {launchMarket?.coldApprovalRelaxed ? (
            <span className="text-amber-200/90">
              This launch market allows one-click send from PENDING_REVIEW (still manual — not auto).
            </span>
          ) : (
            <span>Cold outreach stays approval-gated until you relax it on Launch markets.</span>
          )}
        </p>
        <form action={generateGrowthLeadDraftAction} className="mt-2">
          <input type="hidden" name="leadId" value={lead.id} />
          <button
            type="submit"
            disabled={!email}
            className="rounded-md bg-emerald-800 px-3 py-2 text-sm text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Generate outreach draft
          </button>
        </form>

        <ul className="mt-4 space-y-3">
          {lead.outreachDrafts.map((d) => (
            <li key={d.id} className="rounded border border-zinc-800/80 p-3 text-xs text-zinc-400">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-[10px] text-zinc-500">{d.id.slice(0, 12)}…</span>
                <span className="text-zinc-200">{d.status}</span>
              </div>
              <p className="mt-1 text-zinc-300">To: {d.toEmailNormalized}</p>
              <p className="mt-1">{d.subject}</p>
              {d.lastError ? <p className="mt-1 text-amber-200/90">Last error: {d.lastError}</p> : null}
              <div className="mt-2 flex flex-wrap gap-2">
                {d.status === "PENDING_REVIEW" ? (
                  <form action={approveGrowthLeadDraftAction} className="inline">
                    <input type="hidden" name="draftId" value={d.id} />
                    <input type="hidden" name="leadId" value={lead.id} />
                    <button type="submit" className="rounded bg-emerald-700/90 px-2 py-1 text-[11px] text-white">
                      Approve
                    </button>
                  </form>
                ) : null}
                {d.status === "PENDING_REVIEW" || d.status === "APPROVED" ? (
                  <form action={rejectGrowthLeadDraftAction} className="inline">
                    <input type="hidden" name="draftId" value={d.id} />
                    <input type="hidden" name="leadId" value={lead.id} />
                    <button type="submit" className="rounded bg-zinc-700 px-2 py-1 text-[11px] text-white">
                      Reject
                    </button>
                  </form>
                ) : null}
                {d.status === "APPROVED" ? (
                  <form action={sendGrowthLeadDraftAction} className="inline">
                    <input type="hidden" name="draftId" value={d.id} />
                    <input type="hidden" name="leadId" value={lead.id} />
                    <button type="submit" className="rounded bg-amber-600/90 px-2 py-1 text-[11px] text-white">
                      Send
                    </button>
                  </form>
                ) : null}
                {d.status === "PENDING_REVIEW" && launchMarket?.coldApprovalRelaxed ? (
                  <form action={sendGrowthLeadDraftAction} className="inline">
                    <input type="hidden" name="draftId" value={d.id} />
                    <input type="hidden" name="leadId" value={lead.id} />
                    <button type="submit" className="rounded bg-amber-500/90 px-2 py-1 text-[11px] text-white">
                      Approve+send
                    </button>
                  </form>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
        {lead.outreachDrafts.length === 0 ? <p className="mt-2 text-sm text-zinc-500">No drafts yet.</p> : null}
      </section>

      <section className="mt-8 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
        <h2 className="text-sm font-medium text-white">Response log</h2>
        <form action={addGrowthLeadResponseAction} className="mt-3 grid gap-2 text-sm">
          <input type="hidden" name="leadId" value={lead.id} />
          <label className="grid gap-1">
            <span className="text-zinc-400">Channel</span>
            <select name="channel" className="rounded border border-zinc-700 bg-black/40 px-2 py-1.5 text-white">
              <option value="NOTE">NOTE</option>
              <option value="EMAIL">EMAIL (marks lead REPLIED)</option>
              <option value="OTHER">OTHER</option>
            </select>
          </label>
          <label className="grid gap-1">
            <span className="text-zinc-400">Summary</span>
            <textarea name="summary" required rows={3} className="rounded border border-zinc-700 bg-black/40 px-2 py-1.5 text-white" />
          </label>
          <button type="submit" className="w-fit rounded-md bg-zinc-700 px-3 py-2 text-sm text-white hover:bg-zinc-600">
            Log response
          </button>
        </form>
        <ul className="mt-4 space-y-2 text-xs text-zinc-400">
          {lead.responses.map((r) => (
            <li key={r.id} className="border-b border-zinc-800/80 pb-2">
              <span className="text-zinc-500">{r.createdAt.toISOString().slice(0, 19)}Z</span> · {r.channel}
              {r.actorEmail ? ` · ${r.actorEmail}` : ""}
              <p className="mt-1 whitespace-pre-wrap text-zinc-300">{r.summary}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-8 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
        <h2 className="text-sm font-medium text-white">Follow-up schedule (framework)</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Rows are stored for future workers. Global automation: {growthFollowUpAutomationEnabled() ? "ON" : "OFF"}.
        </p>
        <form action={createGrowthLeadFollowUpAction} className="mt-3 grid gap-2 text-sm sm:max-w-md">
          <input type="hidden" name="leadId" value={lead.id} />
          <label className="grid gap-1">
            <span className="text-zinc-400">Run after (optional)</span>
            <input name="runAfter" type="datetime-local" className="rounded border border-zinc-700 bg-black/40 px-2 py-1.5 text-white" />
          </label>
          <label className="grid gap-1">
            <span className="text-zinc-400">Template key (optional)</span>
            <input name="templateKey" placeholder="future: follow_up_v1" className="rounded border border-zinc-700 bg-black/40 px-2 py-1.5 text-white" />
          </label>
          <label className="flex items-center gap-2 text-zinc-300">
            <input type="checkbox" name="enabled" />
            Enabled (still no send until worker + env)
          </label>
          <button type="submit" className="w-fit rounded-md bg-zinc-700 px-3 py-2 text-sm text-white hover:bg-zinc-600">
            Add follow-up row
          </button>
        </form>
        <ul className="mt-4 space-y-2 text-xs text-zinc-400">
          {lead.followUpSchedules.map((f) => (
            <li key={f.id}>
              {f.enabled ? "ON" : "off"} · {f.status} · {f.runAfter ? f.runAfter.toISOString() : "no date"} ·{" "}
              {f.templateKey ?? "—"}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
