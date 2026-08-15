import type { Metadata } from "next";
import Link from "next/link";
import { buildPublicMetadata } from "@/lib/publicSeo";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return buildPublicMetadata({
    title: "Open mic removed",
    description: "Your open mic has been removed from MicStage.",
    path: "/promoter/open-mics/removed",
    index: false,
  });
}

export default async function OpenMicRemovedPage(props: {
  searchParams: Promise<{ as?: string }>;
}) {
  const sp = await props.searchParams;
  const backHref = sp.as === "venue" ? "/venue" : "/promoter";
  const backLabel = sp.as === "venue" ? "Back to my account" : "Back to my account";

  return (
    <div className="min-h-dvh bg-black text-white">
      <main className="mx-auto max-w-lg px-4 py-12 sm:px-6 sm:py-16">
        <h1 className="om-heading text-3xl sm:text-4xl">Your open mic has been removed from MicStage.</h1>
        <p className="mt-4 text-sm leading-relaxed text-white/75">
          It will no longer appear in MicStage search or maps. Your account is still available if you want to use
          MicStage again later.
        </p>
        <div className="mt-8">
          <Link
            href={backHref}
            className="inline-flex h-12 w-full items-center justify-center rounded-md border border-white/15 bg-white/5 px-5 text-base font-semibold text-white hover:bg-white/10 sm:w-auto"
          >
            {backLabel}
          </Link>
        </div>
      </main>
    </div>
  );
}
