import Link from "next/link";
import { assertAdminSession } from "@/lib/adminAuth";
import { buildOwnerDailySummary } from "@/lib/ownerSummary/buildOwnerDailySummary";
import {
  ownerDailySummarySubject,
  renderOwnerDailySummaryHtml,
  renderOwnerDailySummaryText,
} from "@/lib/ownerSummary/ownerDailySummaryEmail";
import { ownerSummaryRecipient } from "@/lib/ownerSummary/ownerSummaryConfig";
import { requirePrisma } from "@/lib/prisma";
import { sendOwnerDailySummaryNowAction } from "@/app/internal/admin/ownerSummaryActions";

export const dynamic = "force-dynamic";

export default async function AdminOwnerSummaryPage(props: {
  searchParams: Promise<{ ok?: string; err?: string }>;
}) {
  await assertAdminSession();
  const flash = await props.searchParams;
  const prisma = requirePrisma();
  const data = await buildOwnerDailySummary(prisma, new Date());
  const subject = ownerDailySummarySubject(data);
  const html = renderOwnerDailySummaryHtml(data);
  const text = renderOwnerDailySummaryText(data);

  return (
    <main className="mx-auto max-w-4xl px-3 py-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold text-white">Owner daily summary</h1>
        <Link href="/internal/admin/growth" className="text-sm text-zinc-400 hover:text-white">
          ← Growth hub
        </Link>
      </div>
      <p className="mt-2 text-xs text-zinc-500">
        Preview uses the <strong className="text-zinc-300">last 24 hours</strong> ending now (America/Chicago window
        labeling). Cron sends around <strong className="text-zinc-300">8:00 AM Chicago</strong> to{" "}
        <code className="text-zinc-400">{ownerSummaryRecipient()}</code> (override with{" "}
        <code className="text-zinc-400">MICSTAGE_OWNER_SUMMARY_EMAIL</code>).
      </p>
      <p className="mt-1 text-xs text-zinc-600">
        Cron: <code className="text-zinc-500">GET /api/cron/daily-owner-summary</code> with bearer secret ·{" "}
        <code className="text-zinc-500">?force=1</code> to send immediately (still requires auth).
      </p>

      {flash.ok ? (
        <p className="mt-3 rounded border border-emerald-800/60 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-200">
          {flash.ok}
        </p>
      ) : null}
      {flash.err ? (
        <p className="mt-3 rounded border border-red-900/60 bg-red-950/40 px-3 py-2 text-sm text-red-200">{flash.err}</p>
      ) : null}

      <div className="mt-6 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
        <p className="text-xs font-medium text-zinc-500">Subject</p>
        <p className="font-mono text-sm text-white">{subject}</p>
        <form action={sendOwnerDailySummaryNowAction} className="mt-4">
          <button
            type="submit"
            className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
          >
            Send summary now (force)
          </button>
        </form>
      </div>

      <div className="mt-6">
        <h2 className="text-sm font-medium text-zinc-300">HTML preview</h2>
        <div
          className="mt-2 overflow-auto rounded-lg border border-zinc-800 bg-white p-2"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>

      <div className="mt-8">
        <h2 className="text-sm font-medium text-zinc-300">Plain text</h2>
        <pre className="mt-2 max-h-[480px] overflow-auto rounded-lg border border-zinc-800 bg-black/50 p-3 text-xs text-zinc-300 whitespace-pre-wrap">
          {text}
        </pre>
      </div>
    </main>
  );
}
