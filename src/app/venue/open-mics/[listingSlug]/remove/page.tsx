import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getVenueSessionOrNull } from "@/lib/authz";
import { requirePrisma } from "@/lib/prisma";
import { assertVenueOwnerCanRemoveListing } from "@/lib/publicListings/openMicSelfRemoval";
import { buildPublicMetadata } from "@/lib/publicSeo";
import { FormSubmitButton } from "@/components/FormSubmitButton";
import { removeOpenMicAsVenueOwnerAction } from "@/app/promoter/open-mics/removeActions";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return buildPublicMetadata({
    title: "Remove this open mic",
    description: "Remove your open mic from MicStage search and maps.",
    path: "/venue/open-mics/remove",
    index: false,
  });
}

export default async function VenueRemoveOpenMicPage(props: {
  params: Promise<{ listingSlug: string }>;
}) {
  const { listingSlug } = await props.params;
  const session = await getVenueSessionOrNull();
  if (!session || session.kind !== "venue" || !session.venueOwnerId) {
    redirect(`/login/venue?next=${encodeURIComponent(`/venue/open-mics/${listingSlug}/remove`)}`);
  }

  const prisma = requirePrisma();
  const auth = await assertVenueOwnerCanRemoveListing(prisma, session.venueOwnerId, listingSlug);
  if (!auth.ok) {
    if (auth.error === "forbidden") {
      return (
        <div className="min-h-dvh bg-black text-white">
          <main className="mx-auto max-w-lg px-4 py-12">
            <h1 className="om-heading text-3xl">You can&apos;t remove this open mic</h1>
            <p className="mt-3 text-sm text-white/70">This listing isn&apos;t on your venue account.</p>
            <Link href="/venue" className="mt-6 inline-block text-[rgb(var(--om-neon))] underline">
              Back to my account
            </Link>
          </main>
        </div>
      );
    }
    notFound();
  }

  return (
    <div className="min-h-dvh bg-black text-white">
      <main className="mx-auto max-w-lg px-4 py-10 sm:px-6 sm:py-14">
        <p className="text-xs font-medium uppercase tracking-widest text-white/50">Your open mic</p>
        <h1 className="om-heading mt-2 text-3xl sm:text-4xl">Remove this open mic from MicStage?</h1>
        <p className="mt-3 text-base font-medium text-white">{auth.listingName}</p>
        <p className="mt-4 text-sm leading-relaxed text-white/75">
          This will remove your open mic from MicStage search, maps and public listings. It will not delete the venue or
          your MicStage account.
        </p>
        <form action={removeOpenMicAsVenueOwnerAction} className="mt-8 grid gap-3">
          <input type="hidden" name="listingSlug" value={listingSlug} />
          <FormSubmitButton
            label="Remove my open mic"
            pendingLabel="Removing…"
            className="inline-flex h-12 w-full items-center justify-center rounded-md border border-red-400/50 bg-red-500/20 px-5 text-base font-semibold text-red-50 hover:bg-red-500/30 disabled:opacity-60"
          />
          <Link
            href="/venue"
            className="inline-flex h-12 w-full items-center justify-center rounded-md border border-white/15 bg-white/5 px-5 text-base font-semibold text-white hover:bg-white/10"
          >
            Keep my open mic
          </Link>
        </form>
        <p className="mt-8 text-xs text-white/40">
          Removing an open mic is different from deleting your MicStage account. Your login stays available.
        </p>
      </main>
    </div>
  );
}
