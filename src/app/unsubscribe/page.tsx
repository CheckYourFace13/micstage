import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "Unsubscribed | MicStage",
};

export default async function UnsubscribePage(props: {
  searchParams: Promise<{ ok?: string; err?: string }>;
}) {
  const q = await props.searchParams;
  return (
    <main className="mx-auto max-w-md px-6 py-20 text-center text-white">
      <h1 className="text-2xl font-semibold">MicStage email preferences</h1>
      {q.ok === "1" ? (
        <p className="mt-4 text-sm text-white/75">
          You have been unsubscribed from MicStage marketing and outreach emails. Transactional messages about your account
          may still be sent where required.
        </p>
      ) : q.err === "invalid" ? (
        <p className="mt-4 text-sm text-amber-200/90">This unsubscribe link is invalid or expired.</p>
      ) : q.err === "failed" ? (
        <p className="mt-4 text-sm text-amber-200/90">We could not complete unsubscribe. Try again or contact support.</p>
      ) : (
        <p className="mt-4 text-sm text-white/65">
          Use the unsubscribe link from your MicStage email. If you landed here by mistake, you can close this tab.
        </p>
      )}
      <p className="mt-8">
        <Link href="/" className="text-sm text-emerald-400 underline hover:text-emerald-300">
          Back to MicStage
        </Link>
      </p>
    </main>
  );
}
