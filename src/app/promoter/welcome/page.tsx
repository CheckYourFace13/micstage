import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getPromoterSessionOrNull } from "@/lib/authz";
import { requirePrisma } from "@/lib/prisma";
import { buildPublicMetadata } from "@/lib/publicSeo";
import { HostWelcomeForm } from "@/components/host/HostWelcomeForm";
import { setupFirstHostNightAction } from "../actions";

export const metadata: Metadata = buildPublicMetadata({
  title: "Welcome, host",
  description: "Set up your first open mic in under a minute — one account for every room you run.",
  path: "/promoter/welcome",
  index: false,
});

export const dynamic = "force-dynamic";

export default async function HostWelcomePage(props: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await props.searchParams;
  const session = await getPromoterSessionOrNull();
  if (!session || session.kind !== "promoter") {
    throw new Error("Expected promoter auth guard middleware for /promoter/welcome.");
  }

  const prisma = requirePrisma();
  const [user, seriesCount] = await Promise.all([
    prisma.promoterUser.findUnique({
      where: { id: session.promoterId },
      select: { displayName: true },
    }),
    prisma.promoterSeries.count({ where: { promoterId: session.promoterId, archivedAt: null } }),
  ]);

  if (seriesCount > 0) {
    redirect("/promoter");
  }

  const firstName = user?.displayName?.trim().split(/\s+/)[0] || session.email.split("@")[0] || "there";

  const errorMsg =
    error === "venue"
      ? "Pick a venue location from Google search, or add a night from the dashboard after skipping."
      : error === "date"
        ? "Pick a valid date."
        : error
          ? "Something went wrong — try again."
          : null;

  return (
    <div className="min-h-dvh bg-black text-white">
      <main className="mx-auto w-full max-w-xl px-4 py-10 sm:px-6 sm:py-14">
        <p className="text-xs font-medium uppercase tracking-widest text-[rgb(var(--om-neon))]">Host setup</p>
        <h1 className="om-heading mt-2 text-3xl tracking-wide sm:text-4xl">Hi, {firstName}!</h1>
        <p className="mt-3 text-base text-white/80">
          <strong className="text-white">One account for every open mic you run.</strong> Host at one venue or twenty —
          changing rooms doesn&apos;t mean starting over.
        </p>

        {errorMsg ? (
          <div className="mt-4 rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-50">{errorMsg}</div>
        ) : null}

        <HostWelcomeForm setupAction={setupFirstHostNightAction} />

        <p className="mt-6 text-sm text-white/55">
          Skip for now?{" "}
          <Link href="/promoter" className="underline hover:text-white">
            Go to dashboard
          </Link>
        </p>
      </main>
    </div>
  );
}
