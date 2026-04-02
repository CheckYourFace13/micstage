import { notFound, redirect } from "next/navigation";
import { isValidPublicSlug } from "@/lib/locationSlugValidation";
import { loadPublicVenueForLineup } from "@/lib/venuePublicLineupData";
import {
  pickPrimaryLineup,
  storageYmdUtc,
  upcomingLineupDateYmds,
} from "@/lib/venuePublicLineup";

export const dynamic = "force-dynamic";

export default async function VenueLineupIndexPage(props: {
  params: Promise<{ venueSlug: string }>;
}) {
  const { venueSlug } = await props.params;
  if (!isValidPublicSlug(venueSlug)) notFound();

  const venue = await loadPublicVenueForLineup(venueSlug);
  if (!venue) notFound();

  const now = new Date();
  const primary = pickPrimaryLineup(venue.eventTemplates, venue.timeZone, now);
  if (primary) {
    redirect(`/venues/${venueSlug}/lineup/${storageYmdUtc(primary.instance.date)}`);
  }

  const nextYmd = upcomingLineupDateYmds(venue.eventTemplates, venue.timeZone, now, 1)[0];
  if (nextYmd) {
    redirect(`/venues/${venueSlug}/lineup/${nextYmd}`);
  }

  redirect(`/venues/${venueSlug}`);
}
