import Link from "next/link";
import { getPrismaOrNull } from "@/lib/prisma";
import { HomeNearYouListings } from "@/components/home/HomeNearYouListings";
import { HomeVerifiedInventory } from "@/components/home/HomeVerifiedInventory";
import { loadHomepageVerifiedOpenMics } from "@/lib/publicListings/homepageVerified";

export async function HomeDiscoveryPanel() {
  const prisma = getPrismaOrNull();
  if (!prisma) return null;
  let verified: Awaited<ReturnType<typeof loadHomepageVerifiedOpenMics>> = [];
  try {
    verified = await loadHomepageVerifiedOpenMics(prisma, 12);
  } catch (e) {
    console.error("[home] loadHomepageVerifiedOpenMics", e);
  }

  return (
    <>
      <HomeNearYouListings />

      <HomeVerifiedInventory listings={verified} />

      <p className="mt-4 text-xs text-white/45">
        <Link href="/locations" className="underline hover:text-white/70">
          Browse open mics by city and region →
        </Link>
      </p>
    </>
  );
}
