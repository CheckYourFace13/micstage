/**
 * Host outreach lane tracking (distinct from venue acquisition).
 */
export const HOST_OUTREACH_ENRICH_STATS_KEY = "GROWTH_HOST_OUTREACH_ENRICH_DAY_STATS";

export type HostOutreachEnrichDayStats = {
  utcDay: string;
  hostCandidatesFound: number;
  hostLeadsCreated: number;
  hostSendReady: number;
};

export function emptyHostOutreachStats(utcDay: string): HostOutreachEnrichDayStats {
  return { utcDay, hostCandidatesFound: 0, hostLeadsCreated: 0, hostSendReady: 0 };
}
