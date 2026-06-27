import Link from "next/link";
import { assertAdminSession } from "@/lib/adminAuth";
import {
  adminApproveListingClaim,
  adminLinkListingToVenue,
  adminRejectListingClaim,
  adminResolveListingCorrection,
  adminSetListingVerification,
} from "@/app/internal/admin/listingActions";
import { requirePrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function AdminListingsPage(props: {
  searchParams: Promise<{ ok?: string; err?: string }>;
}) {
  await assertAdminSession();
  const { ok, err } = await props.searchParams;
  const prisma = requirePrisma();

  const [listings, pendingClaims, pendingCorrections, venues] = await Promise.all([
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
        lat: true,
        lng: true,
        _count: { select: { schedules: true, claimRequests: true } },
      },
    }),
    prisma.listingClaimRequest.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { listing: { select: { slug: true, name: true, id: true } } },
    }),
    prisma.listingCorrection.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { listing: { select: { slug: true, name: true } } },
    }),
    prisma.venue.findMany({
      orderBy: { name: "asc" },
      take: 200,
      select: { slug: true, name: true },
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
          Approve claims, link to venues, mark junk as OUTDATED. Scripts:{" "}
          <code className="text-zinc-300">publish-growth-leads-as-listings.mjs</code>,{" "}
          <code className="text-zinc-300">geocode-public-listings.mjs</code>,{" "}
          <code className="text-zinc-300">curate-public-listings.mjs</code>
        </p>
        {ok ? <p className="mt-2 text-sm text-emerald-400">Saved ({ok}).</p> : null}
        {err ? <p className="mt-2 text-sm text-amber-400">Error: {err}</p> : null}
      </div>

      <section>
        <h2 className="text-lg font-medium">Pending claims ({pendingClaims.length})</h2>
        {pendingClaims.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">None</p>
        ) : (
          <ul className="mt-3 space-y-4">
            {pendingClaims.map((c) => (
              <li key={c.id} className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3 text-sm">
                <Link href={`/open-mics/${c.listing.slug}`} className="font-medium text-sky-300 hover:underline">
                  {c.listing.name}
                </Link>
                <span className="text-zinc-500">
                  {" "}
                  · {c.contactName} ({c.role}) · {c.email}
                </span>
                {c.notes ? <p className="mt-1 text-zinc-400">{c.notes}</p> : null}
                <form action={adminApproveListingClaim} className="mt-3 flex flex-wrap items-end gap-2">
                  <input type="hidden" name="claimId" value={c.id} />
                  <label className="grid gap-0.5 text-xs text-zinc-400">
                    Link venue (optional slug)
                    <input
                      name="venueSlug"
                      list="venue-slugs"
                      placeholder="venue-slug"
                      className="h-8 rounded border border-zinc-700 bg-zinc-950 px-2 text-zinc-100"
                    />
                  </label>
                  <button type="submit" className="h-8 rounded bg-emerald-700 px-3 text-xs font-semibold hover:bg-emerald-600">
                    Approve
                  </button>
                </form>
                <form action={adminRejectListingClaim} className="mt-2 flex flex-wrap items-end gap-2">
                  <input type="hidden" name="claimId" value={c.id} />
                  <input
                    name="notes"
                    placeholder="Rejection note"
                    className="h-8 min-w-[12rem] flex-1 rounded border border-zinc-700 bg-zinc-950 px-2 text-xs text-zinc-100"
                  />
                  <button type="submit" className="h-8 rounded bg-zinc-700 px-3 text-xs hover:bg-zinc-600">
                    Reject
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
        <datalist id="venue-slugs">
          {venues.map((v) => (
            <option key={v.slug} value={v.slug}>
              {v.name}
            </option>
          ))}
        </datalist>
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
                <p className="mt-1 text-zinc-400">{c.message.slice(0, 400)}</p>
                <div className="mt-2 flex gap-2">
                  <form action={adminResolveListingCorrection}>
                    <input type="hidden" name="correctionId" value={c.id} />
                    <input type="hidden" name="status" value="APPROVED" />
                    <button type="submit" className="rounded bg-zinc-700 px-2 py-1 text-xs hover:bg-zinc-600">
                      Mark reviewed
                    </button>
                  </form>
                  <form action={adminResolveListingCorrection}>
                    <input type="hidden" name="correctionId" value={c.id} />
                    <input type="hidden" name="status" value="REJECTED" />
                    <button type="submit" className="rounded bg-zinc-800 px-2 py-1 text-xs hover:bg-zinc-700">
                      Dismiss
                    </button>
                  </form>
                </div>
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
                <th className="px-3 py-2">Location</th>
                <th className="px-3 py-2">Coords</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {listings.map((l) => (
                <tr key={l.id}>
                  <td className="px-3 py-2">
                    <Link href={`/open-mics/${l.slug}`} className="text-sky-300 hover:underline">
                      {l.name}
                    </Link>
                    <div className="text-xs text-zinc-500">{l.claimStatus}</div>
                  </td>
                  <td className="px-3 py-2 text-zinc-400">{[l.city, l.region].filter(Boolean).join(", ")}</td>
                  <td className="px-3 py-2 text-xs text-zinc-500">
                    {l.lat != null && l.lng != null ? "Yes" : "—"}
                  </td>
                  <td className="px-3 py-2">{l.verificationStatus}</td>
                  <td className="px-3 py-2">
                    <form action={adminSetListingVerification} className="flex flex-wrap gap-1">
                      <input type="hidden" name="listingId" value={l.id} />
                      <select
                        name="verificationStatus"
                        defaultValue={l.verificationStatus}
                        className="h-7 rounded border border-zinc-700 bg-zinc-950 text-xs"
                      >
                        <option value="VERIFIED">VERIFIED</option>
                        <option value="NEEDS_REVIEW">NEEDS_REVIEW</option>
                        <option value="UNVERIFIED">UNVERIFIED</option>
                        <option value="OUTDATED">OUTDATED</option>
                      </select>
                      <button type="submit" className="h-7 rounded bg-zinc-700 px-2 text-xs">
                        Set
                      </button>
                    </form>
                    <form action={adminLinkListingToVenue} className="mt-1 flex gap-1">
                      <input type="hidden" name="listingId" value={l.id} />
                      <input
                        name="venueSlug"
                        list="venue-slugs"
                        placeholder="Link venue slug"
                        className="h-7 w-28 rounded border border-zinc-700 bg-zinc-950 text-xs"
                      />
                      <button type="submit" className="h-7 rounded bg-sky-800 px-2 text-xs">
                        Link
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
