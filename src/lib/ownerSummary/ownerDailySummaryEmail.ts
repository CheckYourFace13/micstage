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
    `  Hidden review queue: ${inv.needsReviewCount}`,
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

function renderReviewQueueText(data: OwnerDailySummaryData): string[] {
  const lines: string[] = [
    `HIDDEN REVIEW QUEUE (${data.reviewQueue.length} unreviewed)`,
    `  Admin: ${data.reviewQueueAdminUrl}`,
    "  These listings are NOT public. Approve real venues or reject junk.",
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

function renderReviewQueueHtml(data: OwnerDailySummaryData): string {
  const base = esc(appBaseUrl().replace(/\/$/, ""));
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
  <h2 style="font-size:15px;margin:20px 0 8px">Hidden review queue (${data.reviewQueue.length})</h2>
  <p style="margin:0 0 8px;font-size:13px">All unreviewed listings (not public). <a href="${esc(data.reviewQueueAdminUrl)}">Open admin review queue</a></p>
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
    <li><strong>Hidden review queue:</strong> ${inv.needsReviewCount}</li>
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
  const n = data.reviewQueue.length;
  if (n > 0) return `MicStage Daily Summary — ${data.reportChicagoDate} · ${n} to review`;
  return `MicStage Daily Summary — ${data.reportChicagoDate}`;
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
  lines.push(...renderReviewQueueText(data));
  lines.push(
    "TOP ITEMS (up to 20, prioritized)",
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

  ${renderReviewQueueHtml(data)}

  <h2 style="font-size:15px;margin:20px 0 8px">Top 20 (action list)</h2>
  <table style="width:100%;border-collapse:collapse;font-size:13px">${topRows}</table>

  <p style="margin-top:20px;font-size:12px;color:#9ca3af">Automated from MicStage · Resend · America/Chicago window</p>
</body></html>`;
}
