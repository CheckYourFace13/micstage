import type { PrismaClient } from "@/generated/prisma/client";

export type SetupChecklistItem = {
  id: string;
  title: string;
  why: string;
  href: string;
  done: boolean;
};

export function promoterSetupChecklist(input: {
  hasOpenMicConnected: boolean;
  hasSeries: boolean;
  hasNight: boolean;
}): SetupChecklistItem[] {
  return [
    {
      id: "connect",
      title: "Connect your open mic",
      why: "Link the venue or listing you host so performers can find the right night.",
      href: "/promoter?focus=find",
      done: input.hasOpenMicConnected,
    },
    {
      id: "series",
      title: "Name your open mic series",
      why: "A simple name helps you keep nights organized (you can change it later).",
      href: "/promoter?focus=series",
      done: input.hasSeries,
    },
    {
      id: "night",
      title: "Confirm the date and time",
      why: "Help performers know exactly when to show up.",
      href: "/promoter?focus=night",
      done: input.hasNight,
    },
  ];
}

export function venueSetupChecklist(input: {
  hasSchedule: boolean;
  hasPhoto: boolean;
  hasAbout: boolean;
  hasSocial: boolean;
  bookingEnabled: boolean;
}): SetupChecklistItem[] {
  return [
    {
      id: "schedule",
      title: "Confirm your schedule",
      why: "Help performers know exactly when to show up.",
      href: "/venue#schedule",
      done: input.hasSchedule,
    },
    {
      id: "photo",
      title: "Add a photo",
      why: "Listings with a recognizable venue photo are easier for performers to find.",
      href: "/venue#profile",
      done: input.hasPhoto,
    },
    {
      id: "about",
      title: "Add a short description",
      why: "A few sentences help performers know what your night is like.",
      href: "/venue#profile",
      done: input.hasAbout,
    },
    {
      id: "social",
      title: "Add social links",
      why: "Give performers a place to follow updates about your open mic.",
      href: "/venue#profile",
      done: input.hasSocial,
    },
    {
      id: "booking",
      title: "Enable MicStage signups",
      why: "Let performers reserve or request a spot through MicStage (optional and free).",
      href: "/venue#booking",
      done: input.bookingEnabled,
    },
  ];
}

export function artistSetupChecklist(input: {
  hasDisplayName: boolean;
  hasCity: boolean;
  hasBio: boolean;
}): SetupChecklistItem[] {
  return [
    {
      id: "name",
      title: "Confirm your display name",
      why: "This is how venues and other performers will see you.",
      href: "/artist#profile",
      done: input.hasDisplayName,
    },
    {
      id: "city",
      title: "Add where you play",
      why: "Helps MicStage suggest nearby open mics.",
      href: "/artist#profile",
      done: input.hasCity,
    },
    {
      id: "bio",
      title: "Add a short bio",
      why: "Optional — useful when venues check who signed up.",
      href: "/artist#profile",
      done: input.hasBio,
    },
  ];
}

export function setupCompletionPct(items: SetupChecklistItem[]): number {
  if (items.length === 0) return 100;
  const done = items.filter((i) => i.done).length;
  return Math.round((done / items.length) * 100);
}

/** Suggest venues/listings from approved promoter application text. */
export async function suggestOpenMicsForPromoterApplication(
  prisma: PrismaClient,
  app: { brandName?: string | null; notes?: string | null; cityRegion?: string | null },
): Promise<Array<{ kind: "venue" | "listing"; id: string; name: string; place: string | null; venueId?: string }>> {
  const needles = [app.brandName, app.notes]
    .filter(Boolean)
    .join(" ")
    .split(/[,.|/\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 4)
    .slice(0, 6);

  const out: Array<{ kind: "venue" | "listing"; id: string; name: string; place: string | null; venueId?: string }> = [];
  const seen = new Set<string>();

  for (const needle of needles.length ? needles : app.brandName ? [app.brandName] : []) {
    const venues = await prisma.venue.findMany({
      where: { name: { contains: needle, mode: "insensitive" } },
      take: 5,
      select: { id: true, name: true, city: true, region: true },
    });
    for (const v of venues) {
      const key = `venue:${v.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        kind: "venue",
        id: v.id,
        name: v.name,
        place: [v.city, v.region].filter(Boolean).join(", ") || null,
        venueId: v.id,
      });
    }

    const listings = await prisma.publicOpenMicListing.findMany({
      where: {
        OR: [
          { name: { contains: needle, mode: "insensitive" } },
          { formattedAddress: { contains: needle, mode: "insensitive" } },
        ],
        verificationStatus: { not: "OUTDATED" },
      },
      take: 5,
      select: {
        id: true,
        name: true,
        city: true,
        region: true,
        formattedAddress: true,
        claimedVenueId: true,
      },
    });
    for (const l of listings) {
      const key = `listing:${l.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        kind: "listing",
        id: l.id,
        name: l.name,
        place: l.formattedAddress || [l.city, l.region].filter(Boolean).join(", ") || null,
        venueId: l.claimedVenueId ?? undefined,
      });
    }
  }

  return out.slice(0, 8);
}
