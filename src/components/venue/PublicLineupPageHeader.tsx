import Link from "next/link";
import { lineupPrimaryActionClass, lineupSecondaryActionClass } from "@/components/venue/lineupActionStyles";
import type { PublicVenueForLineup } from "@/lib/venuePublicLineupData";
import type { LineupForDateRow } from "@/lib/venuePublicLineup";
import { lineupNavLabelFromYmd, minutesToTimeLabel, weekdayToLabel } from "@/lib/time";
import { safeExternalHref } from "@/lib/externalUrl";

export function PublicLineupPageHeader(props: {
  venue: PublicVenueForLineup;
  lineups: LineupForDateRow[];
  dateYmd: string;
  embedMode: boolean;
}) {
  const { venue, lineups, dateYmd, embedMode } = props;
  const first = lineups[0];
  const title = first?.template.title?.trim() || `Open mic at ${venue.name}`;
  const dateLabel = lineupNavLabelFromYmd(dateYmd);
  const timeDetail = first
    ? `${weekdayToLabel(first.template.weekday)} · ${minutesToTimeLabel(first.template.startTimeMin)}–${minutesToTimeLabel(first.template.endTimeMin)} · ${first.template.slotMinutes} min slots`
    : null;
  const description =
    (first?.template.description?.trim() && first.template.description.trim()) ||
    (venue.about?.trim() && venue.about.trim()) ||
    null;
  const logoSrc = safeExternalHref(venue.logoUrl);

  const wrap = embedMode ? "mb-5 border-b border-white/10 pb-5" : "mb-8 flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between";
  const titleCls = embedMode ? "text-2xl font-bold leading-tight text-white" : "text-3xl font-bold leading-tight text-white sm:text-4xl";

  return (
    <header className={wrap}>
      <div className="min-w-0 flex-1 space-y-3">
        <div className="text-xs font-medium uppercase tracking-widest text-white/55">Open mic lineup</div>
        <h1 className={titleCls}>{title}</h1>
        <div>
          <p className="text-lg font-semibold text-white/90">{dateLabel}</p>
          {timeDetail ? <p className="mt-1 text-sm text-white/65">{timeDetail}</p> : null}
        </div>
        <p className="text-base font-semibold text-white">{venue.name}</p>
        {logoSrc ? (
          <div className="flex items-start">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={logoSrc}
              alt=""
              className="h-14 w-auto max-w-[200px] object-contain object-left sm:h-16"
            />
          </div>
        ) : null}
        <p className="text-sm leading-relaxed text-white/75">{venue.formattedAddress}</p>
        {description ? (
          <p className="max-w-2xl text-sm leading-relaxed text-white/65">{description}</p>
        ) : null}
        {lineups.length > 1 ? (
          <p className="text-xs text-white/50">Multiple open mic blocks this date — each grid below is labeled.</p>
        ) : null}
        <p className="text-[11px] text-white/45">
          Lineup provided by{" "}
          <Link href="/" className="text-white/55 underline hover:text-white/80">
            MicStage
          </Link>
        </p>
      </div>
      {!embedMode ? (
        <div className="flex shrink-0 flex-wrap gap-2">
          <Link href={`/venues/${venue.slug}`} className={lineupPrimaryActionClass}>
            Venue profile
          </Link>
          <Link href="/" className={lineupSecondaryActionClass}>
            Home
          </Link>
        </div>
      ) : null}
    </header>
  );
}
