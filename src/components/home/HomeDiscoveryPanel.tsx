import Link from "next/link";
import { getPrismaOrNull } from "@/lib/prisma";
import { HomeNearYouListings } from "@/components/home/HomeNearYouListings";

export async function HomeDiscoveryPanel() {
  const prisma = getPrismaOrNull();
  if (!prisma) return null;

  return (
    <>
      <HomeNearYouListings />

      <p className="mt-4 text-xs text-white/45">
        <Link href="/locations" className="underline hover:text-white/70">
          Browse open mics by city and region →
        </Link>
      </p>
    </>
  );
}
