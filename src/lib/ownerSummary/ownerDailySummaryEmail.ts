import type { OwnerDailySummaryData } from "@/lib/ownerSummary/buildOwnerDailySummary";
import { appBaseUrl } from "@/lib/marketing/emailConfig";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function tagLabel(t: OwnerDailySummaryData["topItems"][0]["priorityTag"]): string {
  switch (t) {
    case "signup":
      return "Signup";
    case "clicked_no_join":
      return "Clicked";
    case "replied":
      return "Reply";
    case "high_value_not_contacted":
      return "Lead";
    default:
      return t;
  }
}

function listingStatusLine(row: OwnerDailySummaryData["recentListings"][0]): string {
  const bits = [
    row.verificationStatus.replace(/_/g, " "),
    row.claimStatus.replace(/_/g, " ").toLowerCase(),
    row.scheduleCount > 0 ? `${row.scheduleCount} schedule slot(s)` : "no schedule yet",
    row.claimInviteSent ? "claim invite sent" : row.ownerEmail ? "invite pending" : "no owner email",
  ];
  if (row.websiteUrl) bits.push("website on file");
  return bits.join(" · ");
}

function renderRecentListingsText(data: OwnerDailySummaryData): string[] {
  const inv = data.listingsInventory;
  const base = appBaseUrl().replace(/\/$/, "");
  const lines: string[] = [
    "PUBLIC OPEN MIC LISTINGS",
    `  Discoverable listings (unclaimed + verified): ${inv.totalListings}`,
    `  Verified: ${inv.verifiedListings} · Unclaimed: ${inv.unclaimedListings}`,
    `  MicStage venues (registered): ${inv.claimedVenues} · Bookable with schedule: ${inv.bookableVenues}`,
    `  Discovery metros on map: ${inv.discoveryMarkets}`,
    `  New listings (24h): ${inv.listingsCreatedCount}`,
    `  Claim invites sent (24h): ${inv.claimInvitesSentCount}`,
    `  Pending claim invites (has email): ${inv.pendingClaimInvites}`,
    `  Venue leads waiting to publish: ${inv.leadsAwaitingPublish}`,
    `  Google Business verified: ${inv.googleVerifiedListings}`,
    `  Hidden listing backlog (NEEDS_REVIEW): ${inv.needsReviewCount}`,
    `  Note: ${inv.listingsNote}`,
    "",
    data.listingsInventory.listingsCreatedCount > 0
      ? "NEW LISTINGS (24h)"
      : "RECENT LISTINGS (latest inventory)",
  ];

  if (data.recentListings.length === 0) {
    lines.push("  (none yet — discovery cron will auto-publish eligible leads)");
  } else {
    for (const row of data.recentListings) {
      lines.push(`  • ${row.name}${row.cityState ? ` — ${row.cityState}` : ""}`);
      lines.push(`      ${listingStatusLine(row)}`);
      lines.push(`      ${base}/open-mics/${row.slug}`);
      if (row.aboutPreview) lines.push(`      ${row.aboutPreview}`);
      if (row.ownerEmail) lines.push(`      Owner email: ${row.ownerEmail}`);
    }
  }
  lines.push("");
  return lines;
}

function renderHostAcquisitionText(data: OwnerDailySummaryData): string[] {
  const h = data.hostAcquisition;
  return [
    "HOST ACQUISITION",
    `  Prospects found: ${h.prospectsFound}`,
    `  Multi-venue prospects: ${h.multiVenueProspects}`,
    `  Hosts with verified contacts: ${h.prospectsHighContact}`,
    `  Host lane prospects: ${h.prospectsHostLane}`,
    `  Outreach ready: ${h.outreachReady}`,
    "",
    "  TODAY (24h)",
    `  Emails sent: ${h.emailsSent24h}`,
    `  Delivered: ${h.delivered24h}`,
    `  Clicks: ${h.clicks24h}`,
    `  Registrations: ${h.registrations24h}`,
    `  First series created: ${h.firstSeries24h}`,
    `  First night created: ${h.firstNight24h}`,
    `  Second venue added: ${h.secondVenueActivations24h}`,
    "",
    "  LAST 7 DAYS",
    `  Emails sent: ${h.emailsSent7d}`,
    `  Delivered: ${h.delivered7d}`,
    `  Clicks: ${h.clicks7d}`,
    `  Registrations: ${h.registrations7d}`,
    `  First series created: ${h.firstSeries7d}`,
    `  First night created: ${h.firstNight7d}`,
    `  Second venue added: ${h.secondVenueActivations7d}`,
    "",
    "  LAST 30 DAYS",
    `  Emails sent: ${h.emailsSent30d}`,
    `  Delivered: ${h.delivered30d}`,
    `  Clicks: ${h.clicks30d}`,
    `  Registrations: ${h.registrations30d}`,
    `  Second venue activations (all time): ${h.secondVenueActivationsTotal}`,
    "",
  ];
}

function renderVenueAcquisitionText(data: OwnerDailySummaryData): string[] {
  const v = data.venueAcquisition;
  return [
    "VENUE ACQUISITION",
    `  Prospects verified: ${v.prospectsVerified}`,
    "",
    "  TODAY (24h)",
    `  Emails sent: ${v.emailsSent24h}`,
    `  Delivered: ${v.delivered24h}`,
    `  Clicks: ${v.clicks24h}`,
    `  Claims: ${v.claims24h}`,
    `  Venue registrations: ${v.registrations24h}`,
    "",
    "  LAST 7 DAYS",
    `  Emails sent: ${v.emailsSent7d}`,
    `  Delivered: ${v.delivered7d}`,
    `  Clicks: ${v.clicks7d}`,
    `  Claims: ${v.claims7d}`,
    `  Venue registrations: ${v.registrations7d}`,
    "",
  ];
}

function renderHostAcquisitionHtml(data: OwnerDailySummaryData): string {
  const h = data.hostAcquisition;
  return `
<h2 style="margin:24px 0 8px;font-size:16px">Host acquisition</h2>
<table style="border-collapse:collapse;width:100%;max-width:640px;font-size:14px">
  <tr><td style="padding:4px 0">Prospects found</td><td style="text-align:right">${h.prospectsFound}</td></tr>
  <tr><td style="padding:4px 0">Verified contacts</td><td style="text-align:right">${h.prospectsHighContact}</td></tr>
  <tr><td style="padding:4px 0">Host lane</td><td style="text-align:right">${h.prospectsHostLane}</td></tr>
  <tr><td style="padding:4px 0">Outreach ready</td><td style="text-align:right">${h.outreachReady}</td></tr>
</table>
<p style="margin:12px 0 4px;font-weight:600;font-size:13px">Today (24h)</p>
<table style="border-collapse:collapse;width:100%;max-width:640px;font-size:14px">
  <tr><td>Sent</td><td style="text-align:right">${h.emailsSent24h}</td></tr>
  <tr><td>Delivered</td><td style="text-align:right">${h.delivered24h}</td></tr>
  <tr><td>Clicks</td><td style="text-align:right">${h.clicks24h}</td></tr>
  <tr><td>Registrations</td><td style="text-align:right">${h.registrations24h}</td></tr>
  <tr><td>First series</td><td style="text-align:right">${h.firstSeries24h}</td></tr>
  <tr><td>First night</td><td style="text-align:right">${h.firstNight24h}</td></tr>
  <tr><td>Second venue</td><td style="text-align:right">${h.secondVenueActivations24h}</td></tr>
</table>
<p style="margin:12px 0 4px;font-weight:600;font-size:13px">Last 7 days</p>
<table style="border-collapse:collapse;width:100%;max-width:640px;font-size:14px">
  <tr><td>Sent</td><td style="text-align:right">${h.emailsSent7d}</td></tr>
  <tr><td>Delivered</td><td style="text-align:right">${h.delivered7d}</td></tr>
  <tr><td>Clicks</td><td style="text-align:right">${h.clicks7d}</td></tr>
  <tr><td>Registrations</td><td style="text-align:right">${h.registrations7d}</td></tr>
  <tr><td>First series</td><td style="text-align:right">${h.firstSeries7d}</td></tr>
  <tr><td>First night</td><td style="text-align:right">${h.firstNight7d}</td></tr>
  <tr><td>Second venue</td><td style="text-align:right">${h.secondVenueActivations7d}</td></tr>
  <tr><td>Second venue (all time)</td><td style="text-align:right">${h.secondVenueActivationsTotal}</td></tr>
</table>`;
}

function renderVenueAcquisitionHtml(data: OwnerDailySummaryData): string {
  const v = data.venueAcquisition;
  return `
<h2 style="margin:24px 0 8px;font-size:16px">Venue acquisition</h2>
<table style="border-collapse:collapse;width:100%;max-width:640px;font-size:14px">
  <tr><td style="padding:4px 0">Prospects verified</td><td style="text-align:right">${v.prospectsVerified}</td></tr>
</table>
<p style="margin:12px 0 4px;font-weight:600;font-size:13px">Today (24h)</p>
<table style="border-collapse:collapse;width:100%;max-width:640px;font-size:14px">
  <tr><td>Sent</td><td style="text-align:right">${v.emailsSent24h}</td></tr>
  <tr><td>Delivered</td><td style="text-align:right">${v.delivered24h}</td></tr>
  <tr><td>Clicks</td><td style="text-align:right">${v.clicks24h}</td></tr>
  <tr><td>Claims</td><td style="text-align:right">${v.claims24h}</td></tr>
  <tr><td>Registrations</td><td style="text-align:right">${v.registrations24h}</td></tr>
</table>
<p style="margin:12px 0 4px;font-weight:600;font-size:13px">Last 7 days</p>
<table style="border-collapse:collapse;width:100%;max-width:640px;font-size:14px">
  <tr><td>Sent</td><td style="text-align:right">${v.emailsSent7d}</td></tr>
  <tr><td>Delivered</td><td style="text-align:right">${v.delivered7d}</td></tr>
  <tr><td>Clicks</td><td style="text-align:right">${v.clicks7d}</td></tr>
  <tr><td>Claims</td><td style="text-align:right">${v.claims7d}</td></tr>
  <tr><td>Registrations</td><td style="text-align:right">${v.registrations7d}</td></tr>
</table>`;
}

function renderGrowthEngineText(data: OwnerDailySummaryData): string[] {
  const g = data.growthEngine;
  const m = data.marketing;
  return [
    "GROWTH ENGINE",
    `  Ready to send: ${g.autoSendReady}`,
    `  Researching: ${g.autoResearchRetry}`,
    `  Retry scheduled: ${g.retryScheduled}`,
    `  Hard rejected: ${g.hardReject}`,
    "",
    "TODAY",
    `  Leads researched: ${g.leadsResearchedToday}`,
    `  Official sites checked: ${g.officialSitesCheckedToday}`,
    `  Open mics verified: ${g.openMicsVerifiedToday}`,
    `  New HIGH contacts: ${g.newHighContactsToday}`,
    `  New send-ready: ${g.newSendReadyToday}`,
    `  Emails sent: ${g.emailsSentToday}`,
    `  Delivered: ${g.deliveredToday}`,
    `  Clicks: ${g.clicksToday}`,
    `  Replies: ${g.repliesToday}`,
    `  Claims: ${g.claimsToday}`,
    `  Registrations: ${g.registrationsToday}`,
    "",
    "LAST 7 DAYS",
    `  Emails sent: ${g.emailsSent7d}`,
    `  Delivered: ${g.delivered7d}`,
    `  Clicks: ${g.clicks7d}`,
    `  Replies: ${g.replies7d}`,
    `  Claims: ${g.claims7d}`,
    `  Registrations: ${g.registrations7d}`,
    "",
    "HEALTH & CAPACITY",
    `  Marketing daily cap: ${g.dailyCap}`,
    `  Provider headroom: ${g.providerHeadroom}`,
    `  Bounce rate: ${(g.bounceRate * 100).toFixed(2)}%`,
    `  Complaint rate: ${(g.complaintRate * 100).toFixed(3)}%`,
    `  Kill switch: ${g.killStatus ? "ON" : "off"}`,
    `  Next auto-ramp: ${g.nextRampCondition}`,
    `  Outreach enabled: ${m.outreachEnabled ? "yes" : "no"}`,
    "",
  ];
}

function renderGrowthEngineHtml(data: OwnerDailySummaryData): string {
  const g = data.growthEngine;
  const m = data.marketing;
  const pct = (n: number) => `${(n * 100).toFixed(n >= 0.01 ? 2 : 3)}%`;
  const row = (label: string, value: string | number) =>
    `<li><strong>${esc(label)}:</strong> ${typeof value === "number" ? value : esc(value)}</li>`;
  return `
  <h2 style="font-size:15px;margin:20px 0 8px">Growth engine</h2>
  <ul style="margin:0 0 12px;padding-left:18px;line-height:1.6">
    ${row("Ready to send", g.autoSendReady)}
    ${row("Researching", g.autoResearchRetry)}
    ${row("Retry scheduled", g.retryScheduled)}
    ${row("Hard rejected", g.hardReject)}
  </ul>
  <h3 style="font-size:14px;margin:12px 0 6px">Today</h3>
  <ul style="margin:0 0 12px;padding-left:18px;line-height:1.6;font-size:13px">
    ${row("Leads researched", g.leadsResearchedToday)}
    ${row("Official sites checked", g.officialSitesCheckedToday)}
    ${row("Open mics verified", g.openMicsVerifiedToday)}
    ${row("New HIGH contacts", g.newHighContactsToday)}
    ${row("New send-ready", g.newSendReadyToday)}
    ${row("Emails sent", g.emailsSentToday)}
    ${row("Delivered", g.deliveredToday)}
    ${row("Clicks", g.clicksToday)}
    ${row("Replies", g.repliesToday)}
    ${row("Claims", g.claimsToday)}
    ${row("Registrations", g.registrationsToday)}
  </ul>
  <h3 style="font-size:14px;margin:12px 0 6px">Last 7 days</h3>
  <ul style="margin:0 0 12px;padding-left:18px;line-height:1.6;font-size:13px">
    ${row("Emails sent", g.emailsSent7d)}
    ${row("Delivered", g.delivered7d)}
    ${row("Clicks", g.clicks7d)}
    ${row("Replies", g.replies7d)}
    ${row("Claims", g.claims7d)}
    ${row("Registrations", g.registrations7d)}
  </ul>
  <h3 style="font-size:14px;margin:12px 0 6px">Health &amp; capacity</h3>
  <ul style="margin:0 0 12px;padding-left:18px;line-height:1.6;font-size:13px">
    ${row("Marketing daily cap", g.dailyCap)}
    ${row("Provider headroom", g.providerHeadroom)}
    ${row("Bounce rate", pct(g.bounceRate))}
    ${row("Complaint rate", pct(g.complaintRate))}
    ${row("Kill switch", g.killStatus ? "ON" : "off")}
    ${row("Next auto-ramp", g.nextRampCondition)}
    ${row("Outreach enabled", m.outreachEnabled ? "yes" : "no")}
  </ul>`;
}

function renderGrowthAutomationText(data: OwnerDailySummaryData): string[] {
  return renderGrowthEngineText(data);
}

function renderGrowthAutomationHtml(data: OwnerDailySummaryData): string {
  return renderGrowthEngineHtml(data);
}

function renderMarketingText(data: OwnerDailySummaryData): string[] {
  const m = data.marketing;
  return [
    "MARKETING",
    `  Eligible now: ${m.eligibleNow}`,
    `  Sent today: ${m.sentToday}`,
    `  Delivered today: ${m.deliveredToday}`,
    `  Bounced today: ${m.bouncedToday}`,
    `  Complaints today: ${m.complaintsToday}`,
    `  Unsubscribes today: ${m.unsubscribesToday}`,
    `  Unique clicks today: ${m.uniqueClicksToday}`,
    `  Replies today: ${m.repliesToday}`,
    `  Claims started today: ${m.claimsStartedToday}`,
    `  Claims completed today: ${m.claimsCompletedToday}`,
    `  Venue registrations today: ${m.venueRegistrationsToday}`,
    `  Promoter registrations today: ${m.promoterRegistrationsToday}`,
    "  7 DAY",
    `  Sent: ${m.sent7d}`,
    `  Delivered: ${m.delivered7d}`,
    `  Bounced: ${m.bounced7d}`,
    `  Complaints: ${m.complaints7d}`,
    `  Unsubscribes: ${m.unsubscribes7d}`,
    `  Unique clicks: ${m.uniqueClicks7d}`,
    `  Replies: ${m.replies7d}`,
    `  Claims: ${m.claims7d}`,
    `  Registrations: ${m.registrations7d}`,
    `  Daily marketing cap: ${m.dailyCap}`,
    `  Sends per cron: ${m.sendsPerCron}`,
    `  Domain cap: ${m.domainCap}`,
    `  Outreach enabled: ${m.outreachEnabled ? "yes" : "no"}`,
    `  Kill switch: ${m.killSwitch ? "ON" : "off"}`,
    `  Provider capacity remaining (marketing): ${m.providerRemaining}`,
    "",
  ];
}
function renderFunnelText(data: OwnerDailySummaryData): string[] {
  const f = data.growthFunnel;
  const lines: string[] = [
    "LISTING PIPELINE",
    `  Waiting verification (no place yet): ${f.waitingVerification}`,
    `  Waiting evidence (place ok): ${f.waitingEnrichment}`,
    `  Waiting HIGH official email: ${f.waitingEmail}`,
    `  Invite-ready: ${f.inviteReady}`,
    `  Backlog processed (approx 24h): ${f.backlogProcessedApprox}`,
    `  Auto-verified (24h): ${f.autoVerifiedToday}`,
    `  Auto-rejected (24h): ${f.autoRejectedToday}`,
    `  HIGH contacts touched (24h): ${f.highContactsRecoveredToday}`,
    "",
  ];
  return lines;
}

function renderReviewQueueText(data: OwnerDailySummaryData): string[] {
  const total = data.reviewQueueTotal ?? data.reviewQueue.length;
  const lines: string[] = [
    `TOP HUMAN-REVIEW ITEMS (${data.reviewQueue.length} of ${total})`,
    `  Full queue: ${data.reviewQueueAdminUrl}`,
    "  Not public. Auto-rules handle junk + strong evidence; these need judgment.",
    "",
  ];
  if (data.reviewQueue.length === 0) {
    lines.push("  (queue empty)", "");
    return lines;
  }
  for (const row of data.reviewQueue) {
    lines.push(
      `  • [${row.verificationStatus}] ${row.name}${row.cityState ? ` — ${row.cityState}` : ""}`,
    );
    lines.push(
      `      email: ${row.ownerEmail ?? "none"} (${row.emailConfidence ?? "n/a"}) · schedules: ${row.scheduleCount} · place: ${row.googlePlaceId ? "yes" : "no"}`,
    );
    if (row.sourceUrl) lines.push(`      source: ${row.sourceUrl}`);
    lines.push(`      listing: ${appBaseUrl().replace(/\/$/, "")}/open-mics/${row.slug}`);
  }
  lines.push("");
  return lines;
}

function renderFunnelHtml(data: OwnerDailySummaryData): string {
  const f = data.growthFunnel;
  return `
  <h2 style="font-size:15px;margin:20px 0 8px">Listing pipeline</h2>
  <ul style="margin:0 0 12px;padding-left:18px;font-size:13px;line-height:1.5">
    <li>Waiting verification: <strong>${f.waitingVerification}</strong></li>
    <li>Waiting evidence: <strong>${f.waitingEnrichment}</strong></li>
    <li>Waiting HIGH official email: <strong>${f.waitingEmail}</strong></li>
    <li>Invite-ready: <strong>${f.inviteReady}</strong></li>
    <li>Auto-verified (24h): <strong>${f.autoVerifiedToday}</strong> · Auto-rejected: <strong>${f.autoRejectedToday}</strong></li>
    <li>HIGH contacts touched (24h): <strong>${f.highContactsRecoveredToday}</strong></li>
  </ul>`;
}

function renderReviewQueueHtml(data: OwnerDailySummaryData): string {
  const base = esc(appBaseUrl().replace(/\/$/, ""));
  const total = data.reviewQueueTotal ?? data.reviewQueue.length;
  const rows =
    data.reviewQueue.length === 0
      ? `<tr><td colspan="3" style="padding:8px;color:#666">Review queue is empty.</td></tr>`
      : data.reviewQueue
          .map((row) => {
            const href = `${base}/open-mics/${encodeURIComponent(row.slug)}`;
            const email = row.ownerEmail
              ? `<a href="mailto:${esc(row.ownerEmail)}">${esc(row.ownerEmail)}</a> (${esc(row.emailConfidence ?? "n/a")})`
              : "none";
            const source = row.sourceUrl
              ? `<br/><a href="${esc(row.sourceUrl)}" style="font-size:12px">source</a>`
              : "";
            return `<tr>
            <td style="padding:6px 8px;border-bottom:1px solid #eee;vertical-align:top">
              <span style="font-size:11px;background:#fef3c7;color:#92400e;padding:2px 6px;border-radius:4px">${esc(row.verificationStatus)}</span><br/>
              <strong>${esc(row.name)}</strong>${row.cityState ? `<br/><span style="color:#6b7280">${esc(row.cityState)}</span>` : ""}
            </td>
            <td style="padding:6px 8px;border-bottom:1px solid #eee;vertical-align:top;font-size:12px">
              ${email}<br/>schedules: ${row.scheduleCount} · Google place: ${row.googlePlaceId ? "yes" : "no"}${source}
            </td>
            <td style="padding:6px 8px;border-bottom:1px solid #eee;vertical-align:top;font-size:12px">
              <a href="${href}">open listing</a>
            </td>
          </tr>`;
          })
          .join("");

  return `
  <h2 style="font-size:15px;margin:20px 0 8px">Top human-review items (${data.reviewQueue.length} of ${total})</h2>
  <p style="margin:0 0 8px;font-size:13px">Not public. Full queue in admin (not emailed). <a href="${esc(data.reviewQueueAdminUrl)}">Open admin review queue</a></p>
  <table style="width:100%;border-collapse:collapse;font-size:13px">
    <thead><tr style="text-align:left;background:#fffbeb">
      <th style="padding:6px 8px">Listing</th><th style="padding:6px 8px">Contact / evidence</th><th style="padding:6px 8px">Link</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

export function buildReviewQueueCsv(data: OwnerDailySummaryData): string {
  const header = [
    "id",
    "slug",
    "name",
    "cityState",
    "verificationStatus",
    "ownerEmail",
    "emailConfidence",
    "googlePlaceId",
    "sourceUrl",
    "scheduleCount",
    "updatedAt",
  ];
  const escapeCsv = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const lines = [header.join(",")];
  for (const row of data.reviewQueue) {
    lines.push(
      [
        row.id,
        row.slug,
        row.name,
        row.cityState ?? "",
        row.verificationStatus,
        row.ownerEmail ?? "",
        row.emailConfidence ?? "",
        row.googlePlaceId ?? "",
        row.sourceUrl ?? "",
        String(row.scheduleCount),
        row.updatedAt.toISOString(),
      ]
        .map((c) => escapeCsv(String(c)))
        .join(","),
    );
  }
  return lines.join("\n");
}

function renderRecentListingsHtml(data: OwnerDailySummaryData): string {
  const inv = data.listingsInventory;
  const base = esc(appBaseUrl().replace(/\/$/, ""));
  const heading =
    data.listingsInventory.listingsCreatedCount > 0
      ? "New listings (last 24h)"
      : "Recent listings (latest inventory)";

  const listingRows =
    data.recentListings.length === 0
      ? `<tr><td colspan="2" style="padding:8px;color:#666">No listings yet — discovery cron auto-publishes eligible venue leads each run.</td></tr>`
      : data.recentListings
          .map((row) => {
            const href = `${base}/open-mics/${encodeURIComponent(row.slug)}`;
            const meta = esc(listingStatusLine(row));
            const about = row.aboutPreview ? `<br/><span style="color:#4b5563;font-size:12px">${esc(row.aboutPreview)}</span>` : "";
            const email = row.ownerEmail
              ? `<br/><span style="color:#4b5563;font-size:12px">Owner: <a href="mailto:${esc(row.ownerEmail)}">${esc(row.ownerEmail)}</a></span>`
              : "";
            return `<tr>
            <td style="padding:6px 8px;border-bottom:1px solid #eee;vertical-align:top">
              <strong>${esc(row.name)}</strong>${row.cityState ? `<br/><span style="color:#6b7280">${esc(row.cityState)}</span>` : ""}
            </td>
            <td style="padding:6px 8px;border-bottom:1px solid #eee;vertical-align:top">
              <span style="font-size:12px;color:#374151">${meta}</span>${about}${email}
              <br/><a href="${href}" style="font-size:12px">${href}</a>
            </td>
          </tr>`;
          })
          .join("");

  return `
  <h2 style="font-size:15px;margin:20px 0 8px">Public open mic listings</h2>
  <ul style="margin:0 0 12px;padding-left:18px;line-height:1.6;font-size:13px">
    <li><strong>Discoverable listings:</strong> ${inv.totalListings} (${inv.verifiedListings} verified, ${inv.unclaimedListings} unclaimed)</li>
    <li><strong>MicStage venues:</strong> ${inv.claimedVenues} registered · ${inv.bookableVenues} bookable with schedule</li>
    <li><strong>New listings (24h):</strong> ${inv.listingsCreatedCount} · <strong>Claim invites sent (24h):</strong> ${inv.claimInvitesSentCount}</li>
    <li><strong>Pending claim invites:</strong> ${inv.pendingClaimInvites} · <strong>Leads waiting to publish:</strong> ${inv.leadsAwaitingPublish} · <strong>Google verified:</strong> ${inv.googleVerifiedListings}</li>
    <li><strong>Hidden listing backlog (NEEDS_REVIEW):</strong> ${inv.needsReviewCount}</li>
  </ul>
  <p style="margin:0 0 12px;color:#6b7280;font-size:12px">${esc(inv.listingsNote)}</p>
  <h3 style="font-size:14px;margin:16px 0 8px">${esc(heading)}</h3>
  <table style="width:100%;border-collapse:collapse;font-size:13px">
    <thead><tr style="text-align:left;background:#f9fafb">
      <th style="padding:6px 8px">Listing</th><th style="padding:6px 8px">Details</th>
    </tr></thead>
    <tbody>${listingRows}</tbody>
  </table>`;
}

export function ownerDailySummarySubject(data: OwnerDailySummaryData): string {
  const ready = data.growthEngine.autoSendReady;
  const verified = data.listingsInventory.verifiedListings;
  const sent = data.growthEngine.emailsSentToday;
  return `MicStage Daily Summary — ${data.reportChicagoDate} · ${verified} verified · ${ready} send-ready · ${sent} sent`;
}

export function renderOwnerDailySummaryText(data: OwnerDailySummaryData): string {
  const lines: string[] = [
    `MicStage Daily Summary (${data.windowLabel})`,
    "",
    "SIGNUPS (24h)",
    `  Venues (new operator accounts): ${data.signupVenueCount}`,
    `  Artists: ${data.signupArtistCount}`,
    "",
  ];

  if (data.signups.length === 0) {
    lines.push("  (none in window)", "");
  } else {
    for (const s of data.signups) {
      lines.push(
        `  • [${s.kind}] ${s.name} <${s.email}>${s.cityState ? ` — ${s.cityState}` : ""} — ${s.verifiedNote}`,
      );
    }
    lines.push("");
  }

  lines.push(
    "PIPELINE",
    `  New growth leads (rows created): ${data.leadsCreatedCount}`,
    `  Outreach emails sent (OUTREACH / SENT): ${data.outreachEmailsSentCount}`,
    `  Unique leads with CLICKED stage update (24h): ${data.uniqueClickLeadsCount}`,
    `    Note: ${data.clicksNote}`,
    `  Growth replies logged (24h): ${data.growthRepliesCount}`,
    `    Note: ${data.repliesNote}`,
    "",
  );
  lines.push(...renderRecentListingsText(data));
  lines.push(...renderHostAcquisitionText(data));
  lines.push(...renderVenueAcquisitionText(data));
  lines.push(...renderGrowthEngineText(data));
  lines.push(...renderMarketingText(data));
  lines.push(...renderFunnelText(data));
  lines.push(
    "HIGHLIGHTS (conversions & engagement, up to 20)",
  );

  if (data.topItems.length === 0) {
    lines.push("  (none)");
  } else {
    for (let i = 0; i < data.topItems.length; i++) {
      const it = data.topItems[i]!;
      lines.push(`  ${i + 1}. [${tagLabel(it.priorityTag)}] ${it.title}`);
      lines.push(`      ${it.detail}`);
    }
  }

  lines.push("", "— MicStage automated summary");
  return lines.join("\n");
}

export function renderOwnerDailySummaryHtml(data: OwnerDailySummaryData): string {
  const signupRows =
    data.signups.length === 0
      ? "<tr><td colspan=\"5\" style=\"padding:8px;color:#666\">No signups in this window.</td></tr>"
      : data.signups
          .map(
            (s) =>
              `<tr>
            <td style="padding:6px 8px;border-bottom:1px solid #eee">${esc(s.kind)}</td>
            <td style="padding:6px 8px;border-bottom:1px solid #eee">${esc(s.name)}</td>
            <td style="padding:6px 8px;border-bottom:1px solid #eee"><a href="mailto:${esc(s.email)}">${esc(s.email)}</a></td>
            <td style="padding:6px 8px;border-bottom:1px solid #eee">${esc(s.cityState ?? "—")}</td>
            <td style="padding:6px 8px;border-bottom:1px solid #eee">${esc(s.verifiedNote)}</td>
          </tr>`,
          )
          .join("");

  const topRows =
    data.topItems.length === 0
      ? "<tr><td colspan=\"2\" style=\"padding:8px;color:#666\">No prioritized items.</td></tr>"
      : data.topItems
          .map(
            (it, i) =>
              `<tr>
            <td style="padding:6px 8px;border-bottom:1px solid #eee;vertical-align:top;width:36px">${i + 1}</td>
            <td style="padding:6px 8px;border-bottom:1px solid #eee;vertical-align:top">
              <span style="display:inline-block;font-size:11px;background:#111827;color:#e5e7eb;padding:2px 6px;border-radius:4px;margin-bottom:4px">${esc(tagLabel(it.priorityTag))}</span><br/>
              <strong>${esc(it.title)}</strong><br/>
              <span style="color:#4b5563;font-size:13px">${esc(it.detail)}</span>
            </td>
          </tr>`,
          )
          .join("");

  return `<!DOCTYPE html>
<html><body style="font-family:system-ui,-apple-system,sans-serif;font-size:14px;color:#111827;max-width:720px;margin:0 auto;padding:16px">
  <h1 style="font-size:18px;margin:0 0 4px">MicStage Daily Summary</h1>
  <p style="margin:0 0 16px;color:#6b7280;font-size:13px">${esc(data.windowLabel)}</p>

  <h2 style="font-size:15px;margin:20px 0 8px">Signups (last 24h)</h2>
  <p style="margin:0 0 8px"><strong>Venues:</strong> ${data.signupVenueCount} · <strong>Artists:</strong> ${data.signupArtistCount}</p>
  <table style="width:100%;border-collapse:collapse;font-size:13px">
    <thead><tr style="text-align:left;background:#f9fafb">
      <th style="padding:6px 8px">Type</th><th style="padding:6px 8px">Name</th><th style="padding:6px 8px">Email</th><th style="padding:6px 8px">City / state</th><th style="padding:6px 8px">Verified / terms</th>
    </tr></thead>
    <tbody>${signupRows}</tbody>
  </table>

  <h2 style="font-size:15px;margin:20px 0 8px">Pipeline</h2>
  <ul style="margin:0;padding-left:18px;line-height:1.6">
    <li><strong>New growth leads:</strong> ${data.leadsCreatedCount}</li>
    <li><strong>Outreach emails sent:</strong> ${data.outreachEmailsSentCount}</li>
    <li><strong>Click signal (leads):</strong> ${data.uniqueClickLeadsCount} — <span style="color:#6b7280">${esc(data.clicksNote)}</span></li>
    <li><strong>Replies logged:</strong> ${data.growthRepliesCount} — <span style="color:#6b7280">${esc(data.repliesNote)}</span></li>
  </ul>

  ${renderRecentListingsHtml(data)}

  ${renderHostAcquisitionHtml(data)}

  ${renderVenueAcquisitionHtml(data)}

  ${renderGrowthEngineHtml(data)}

  ${renderFunnelHtml(data)}

  <h2 style="font-size:15px;margin:20px 0 8px">Highlights (conversions &amp; engagement)</h2>
  <table style="width:100%;border-collapse:collapse;font-size:13px">${topRows}</table>

  <p style="margin-top:20px;font-size:12px;color:#9ca3af">Automated from MicStage · Resend · America/Chicago window</p>
</body></html>`;
}
