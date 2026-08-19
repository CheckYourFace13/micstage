/**
 * Venue outreach funnel audit — tracked events only.
 * Run: node scripts/audit-venue-funnel.mjs
 */
import fs from "node:fs";
import pg from "pg";

function loadEnvFile(name) {
  if (!fs.existsSync(name)) return;
  for (const line of fs.readFileSync(name, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}
loadEnvFile(".env.local");
loadEnvFile(".env");

const pool = new pg.Pool({
  connectionString: process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim(),
  ssl: { rejectUnauthorized: false },
});

function pct(num, den) {
  if (!den) return 0;
  return num / den;
}

async function windowMetrics(client, since, until) {
  const params = [];
  if (since) params.push(since);
  if (until) params.push(until);

  const timeFilterSent = [
    since ? `s."sentAt" >= $1` : null,
    until ? `s."sentAt" < $${since ? 2 : 1}` : null,
  ]
    .filter(Boolean)
    .join(" AND ");

  const sentWhere = `s.category = 'OUTREACH' AND s.status = 'SENT' AND l."leadType" = 'VENUE'${timeFilterSent ? ` AND ${timeFilterSent}` : ""}`;

  const sent = await client.query(
    `SELECT COUNT(*)::int AS c FROM "MarketingEmailSend" s
     JOIN "GrowthLeadOutreachDraft" d ON d."marketingEmailSendId" = s.id
     JOIN "GrowthLead" l ON l.id = d."leadId"
     WHERE ${sentWhere}`,
    params,
  );

  const deliveredFilter = [
    since ? `s."deliveredAt" >= $1` : null,
    until ? `s."deliveredAt" < $${since ? 2 : 1}` : null,
  ]
    .filter(Boolean)
    .join(" AND ");

  const delivered = await client.query(
    `SELECT COUNT(*)::int AS c FROM "MarketingEmailSend" s
     JOIN "GrowthLeadOutreachDraft" d ON d."marketingEmailSendId" = s.id
     JOIN "GrowthLead" l ON l.id = d."leadId"
     WHERE s.category = 'OUTREACH' AND l."leadType" = 'VENUE' AND s."deliveredAt" IS NOT NULL
     ${deliveredFilter ? `AND ${deliveredFilter}` : ""}`,
    params,
  );

  const bounced = await client.query(
    `SELECT COUNT(*)::int AS c FROM "MarketingEmailSend" s
     JOIN "GrowthLeadOutreachDraft" d ON d."marketingEmailSendId" = s.id
     JOIN "GrowthLead" l ON l.id = d."leadId"
     WHERE s.category = 'OUTREACH' AND l."leadType" = 'VENUE' AND s."bouncedAt" IS NOT NULL
     ${since ? `AND s."bouncedAt" >= $1` : ""}${until ? ` AND s."bouncedAt" < $${since ? 2 : 1}` : ""}`,
    params,
  );

  const complained = await client.query(
    `SELECT COUNT(*)::int AS c FROM "MarketingEmailSend" s
     JOIN "GrowthLeadOutreachDraft" d ON d."marketingEmailSendId" = s.id
     JOIN "GrowthLead" l ON l.id = d."leadId"
     WHERE s.category = 'OUTREACH' AND l."leadType" = 'VENUE' AND s."complainedAt" IS NOT NULL
     ${since ? `AND s."complainedAt" >= $1` : ""}${until ? ` AND s."complainedAt" < $${since ? 2 : 1}` : ""}`,
    params,
  );

  const clickTime = [
    since ? `mc."createdAt" >= $1` : null,
    until ? `mc."createdAt" < $${since ? 2 : 1}` : null,
  ]
    .filter(Boolean)
    .join(" AND ");

  const clicks = await client.query(
    `SELECT COUNT(*)::int AS c FROM "MarketingOutreachClick" mc
     JOIN "MarketingEmailSend" s ON s.id = mc."sendId"
     JOIN "GrowthLeadOutreachDraft" d ON d."marketingEmailSendId" = s.id
     JOIN "GrowthLead" l ON l.id = d."leadId"
     WHERE l."leadType" = 'VENUE' ${clickTime ? `AND ${clickTime}` : ""}`,
    params,
  );

  const claimCtaClicks = await client.query(
    `SELECT COUNT(*)::int AS c FROM "MarketingOutreachClick" mc
     JOIN "MarketingEmailSend" s ON s.id = mc."sendId"
     JOIN "GrowthLeadOutreachDraft" d ON d."marketingEmailSendId" = s.id
     JOIN "GrowthLead" l ON l.id = d."leadId"
     WHERE l."leadType" = 'VENUE'
       AND (mc."destinationUrl" LIKE '%/open-mics/%' OR mc."destinationUrl" LIKE '%/claim/%')
       ${clickTime ? `AND ${clickTime}` : ""}`,
    params,
  );

  const leadTime = [
    since ? `"updatedAt" >= $1` : null,
    until ? `"updatedAt" < $${since ? 2 : 1}` : null,
  ]
    .filter(Boolean)
    .join(" AND ");

  const signupStarted = await client.query(
    `SELECT COUNT(*)::int AS c FROM "GrowthLead"
     WHERE "leadType" = 'VENUE'
       AND "acquisitionStage" IN ('CLICKED','SIGNUP_STARTED','ACCOUNT_CREATED','LISTING_LIVE')
       ${leadTime ? `AND ${leadTime}` : ""}`,
    params,
  );

  const venueRegParams = params;
  const venueRegs = await client.query(
    `SELECT COUNT(*)::int AS c FROM "VenueOwner"
     ${venueRegParams.length ? `WHERE "createdAt" >= $1${venueRegParams.length > 1 ? ' AND "createdAt" < $2' : ""}` : ""}`,
    venueRegParams,
  );

  const claimsJoined = await client.query(
    `SELECT COUNT(*)::int AS c FROM "GrowthLead"
     WHERE "leadType" = 'VENUE' AND status = 'JOINED'
       ${leadTime ? `AND ${leadTime}` : ""}`,
    params,
  );

  const unsubscribed = await client.query(
    `SELECT COUNT(*)::int AS c FROM "GrowthLead"
     WHERE "leadType" = 'VENUE' AND status IN ('UNSUBSCRIBED','BOUNCED')
       ${leadTime ? `AND ${leadTime}` : ""}`,
    params,
  );

  const sentN = sent.rows[0].c;
  const deliveredN = delivered.rows[0].c;
  const bouncedN = bounced.rows[0].c;
  const complainedN = complained.rows[0].c;
  const clicksN = clicks.rows[0].c;
  const claimCtaN = claimCtaClicks.rows[0].c;

  return {
    sent: sentN,
    delivered: deliveredN,
    bounced: bouncedN,
    complained: complainedN,
    unsubscribed: unsubscribed.rows[0].c,
    clicks: clicksN,
    claimCtaClicks: claimCtaN,
    signupStarted: signupStarted.rows[0].c,
    venueRegistrations: venueRegs.rows[0].c,
    claimsJoined: claimsJoined.rows[0].c,
    rates: {
      deliveryRate: pct(deliveredN, sentN),
      bounceRate: pct(bouncedN, sentN),
      complaintRate: pct(complainedN, sentN),
      unsubscribeRate: pct(unsubscribed.rows[0].c, sentN),
      ctr: pct(clicksN, deliveredN),
      claimCtaCtr: pct(claimCtaN, deliveredN),
      registrationConversion: pct(venueRegs.rows[0].c, clicksN),
      claimConversion: pct(claimsJoined.rows[0].c, clicksN),
    },
  };
}

const client = await pool.connect();
try {
  const now = new Date();
  const h24 = new Date(now.getTime() - 24 * 3600000);
  const d7 = new Date(now.getTime() - 7 * 86400000);
  const d30 = new Date(now.getTime() - 30 * 86400000);

  const [w24, w7, w30, all] = await Promise.all([
    windowMetrics(client, h24, now),
    windowMetrics(client, d7, now),
    windowMetrics(client, d30, now),
    windowMetrics(client, null, null),
  ]);

  const clickDestBreakdown = await client.query(`
    SELECT
      CASE
        WHEN mc."destinationUrl" LIKE '%/open-mics/%' THEN 'listing_page'
        WHEN mc."destinationUrl" LIKE '%/claim/%' THEN 'claim_page'
        WHEN mc."destinationUrl" LIKE '%/register/venue%' THEN 'register_venue'
        ELSE 'other'
      END AS dest,
      COUNT(*)::int AS c
    FROM "MarketingOutreachClick" mc
    JOIN "MarketingEmailSend" s ON s.id = mc."sendId"
    JOIN "GrowthLeadOutreachDraft" d ON d."marketingEmailSendId" = s.id
    JOIN "GrowthLead" l ON l.id = d."leadId"
    WHERE l."leadType" = 'VENUE'
    GROUP BY 1 ORDER BY c DESC
  `);

  console.log(
    JSON.stringify(
      {
        ok: true,
        windows: { last24h: w24, last7d: w7, last30d: w30, allTime: all },
        clickDestinationBreakdown: clickDestBreakdown.rows,
        frictionNote:
          "Historical sends used /register/venue CTA; listing-first routing applies to new sends after growth-mode deploy.",
      },
      null,
      2,
    ),
  );
} finally {
  client.release();
  await pool.end();
}
