import Link from "next/link";
import { assertAdminSession } from "@/lib/adminAuth";
import { requirePrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function AdminListingsPage() {
  await assertAdminSession();
  const prisma = requirePrisma();

  const [listings, pendingClaims, pendingCorrections] = await Promise.all([
    prisma.publicOpenMicListing.findMany({
      orderBy: [{ updatedAt: "desc" }],
      take: 100,
      select: {
        id: true,
        slug: true,
        name: true,
        city: true,
        region: true,
        verificationStatus: true,
        claimStatus: true,
        lastVerifiedAt: true,
        _count: { select: { schedules: true, claimRequests: true } },
      },
    }),
    prisma.listingClaimRequest.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { listing: { select: { slug: true, name: true } } },
    }),
    prisma.listingCorrection.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { listing: { select: { slug: true, name: true } } },
    }),
  ]);

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-6 text-zinc-100">
      <div>
        <Link href="/internal/admin/growth" className="text-sm text-zinc-400 hover:text-white">
          ← Growth hub
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">Public open mic listings</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Verified inventory shown on /open-mics before venues claim. Approve claims in DB or via future tooling; run{" "}
          <code className="text-zinc-300">node scripts/publish-growth-leads-as-listings.mjs</code> to seed from growth leads.
        </p>
      </div>

      <section>
        <h2 className="text-lg font-medium">Pending claims ({pendingClaims.length})</h2>
        {pendingClaims.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">None</p>
        ) : (
          <ul className="mt-3 divide-y divide-zinc-800 rounded-lg border border-zinc-800">
            {pendingClaims.map((c) => (
              <li key={c.id} className="px-4 py-3 text-sm">
                <Link href={`/open-mics/${c.listing.slug}`} className="font-medium text-sky-300 hover:underline">
                  {c.listing.name}
                </Link>
                <span className="text-zinc-500"> · {c.contactName} ({c.role}) · {c.email}</span>
                <div className="text-xs text-zinc-500">{c.createdAt.toISOString()}</div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-lg font-medium">Pending corrections ({pendingCorrections.length})</h2>
        {pendingCorrections.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">None</p>
        ) : (
          <ul className="mt-3 divide-y divide-zinc-800 rounded-lg border border-zinc-800">
            {pendingCorrections.map((c) => (
              <li key={c.id} className="px-4 py-3 text-sm">
                <Link href={`/open-mics/${c.listing.slug}`} className="font-medium text-sky-300 hover:underline">
                  {c.listing.name}
                </Link>
                <span className="text-zinc-500"> · {c.kind}</span>
                <p className="mt-1 text-zinc-400">{c.message.slice(0, 240)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-lg font-medium">Listings ({listings.length} shown)</h2>
        <div className="mt-3 overflow-x-auto rounded-lg border border-zinc-800">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-zinc-900 text-zinc-400">
              <tr>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">City</th>
                <th className="px-3 py-2">Verification</th>
                <th className="px-3 py-2">Claim</th>
                <th className="px-3 py-2">Schedules</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {listings.map((l) => (
                <tr key={l.id}>
                  <td className="px-3 py-2">
                    <Link href={`/open-mics/${l.slug}`} className="text-sky-300 hover:underline">
                      {l.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-zinc-400">
                    {[l.city, l.region].filter(Boolean).join(", ")}
                  </td>
                  <td className="px-3 py-2">{l.verificationStatus}</td>
                  <td className="px-3 py-2">{l.claimStatus}</td>
                  <td className="px-3 py-2">{l._count.schedules}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
