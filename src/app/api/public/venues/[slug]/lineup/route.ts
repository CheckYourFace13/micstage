import { NextResponse } from "next/server";
import { performanceFormatLabel } from "@/lib/venueDisplay";
import { loadPublicVenueForLineup } from "@/lib/venuePublicLineupData";
import {
  isValidLineupYmd,
  lineupsForStorageYmd,
  pickPrimaryLineup,
  storageYmdUtc,
  upcomingLineupDateYmds,
} from "@/lib/venuePublicLineup";

export const dynamic = "force-dynamic";

/**
 * Public read-only lineup JSON.
 * - `GET /api/public/venues/:slug/lineup` — current/next lineup (same rules as `pickPrimaryLineup`), else earliest upcoming date.
 * - `GET ?date=YYYY-MM-DD` — lineup for that storage date.
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ slug: string }> },
): Promise<NextResponse> {
  const { slug } = await ctx.params;
  const dateParam = new URL(req.url).searchParams.get("date")?.trim() ?? "";

  const venue = await loadPublicVenueForLineup(slug);
  if (!venue) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const now = new Date();
  const tz = venue.timeZone;
  const upcomingDates = upcomingLineupDateYmds(venue.eventTemplates, tz, now, 48);

  let selection: "live" | "tonight" | "upcoming" | "requested" | "fallback" = "fallback";
  let ymd: string | null = null;

  if (dateParam && isValidLineupYmd(dateParam)) {
    ymd = dateParam;
    selection = "requested";
  } else {
    const primary = pickPrimaryLineup(venue.eventTemplates, tz, now);
    if (primary) {
      ymd = storageYmdUtc(primary.instance.date);
      selection = primary.badge;
    } else if (upcomingDates[0]) {
      ymd = upcomingDates[0];
      selection = "upcoming";
    }
  }

  const lineups = ymd ? lineupsForStorageYmd(venue.eventTemplates, ymd) : [];

  const body = {
    venue: {
      slug: venue.slug,
      name: venue.name,
      city: venue.city,
      region: venue.region,
      formattedAddress: venue.formattedAddress,
      timeZone: venue.timeZone,
    },
    date: ymd,
    selection,
    upcomingDates,
    lineups: lineups.map(({ template: t, instance: inst }) => ({
      template: {
        id: t.id,
        title: t.title,
        weekday: t.weekday,
        startTimeMin: t.startTimeMin,
        endTimeMin: t.endTimeMin,
        slotMinutes: t.slotMinutes,
        breakMinutes: t.breakMinutes,
        timeZone: t.timeZone,
        performanceFormat: t.performanceFormat,
        performanceFormatLabel: performanceFormatLabel(t.performanceFormat),
      },
      instance: {
        id: inst.id,
        date: storageYmdUtc(inst.date),
        isCancelled: inst.isCancelled,
        slots: inst.slots.map((s) => {
          const active = s.booking && !s.booking.cancelledAt ? s.booking : null;
          return {
            id: s.id,
            startMin: s.startMin,
            endMin: s.endMin,
            status: s.status,
            open: s.status === "AVAILABLE" && !active,
            booking: active ? { performerName: active.performerName } : null,
          };
        }),
      },
    })),
  };

  return NextResponse.json(body, {
    headers: {
      "Cache-Control": "public, max-age=0, s-maxage=30",
    },
  });
}
