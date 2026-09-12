/**
 * Behavioral registration-funnel milestone tests (QA fixtures only).
 *
 * Hits real register-submit HTTP handlers so consent / rate / duplicate / success
 * paths are proven on the server — not just source-text order.
 *
 *   QA_BASE_URL=https://micstage.com npx tsx scripts/check-registration-funnel-milestones.mjs
 *   npm run test:registration-funnel
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/index.js";
import { stampRegistrationPageViewed } from "../src/lib/growth/growthLeadAcquisitionStage.ts";
import { REGISTRATION_CONSENT_CHECKBOX_NAME } from "../src/lib/registrationConsent.ts";

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

const BASE = (process.env.QA_BASE_URL || "https://micstage.com").replace(/\/$/, "");
const TAG = "QA_REG_FUNNEL_MILESTONES";
const suffix = crypto.randomBytes(4).toString("hex");
const PASSWORD = `QaFunnel!${suffix}9`;

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim(),
  }),
});

/** @type {string[]} */
const leadIds = [];
/** @type {string[]} */
const venueEmails = [];
/** @type {string[]} */
const hostEmails = [];
/** @type {string[]} */
const performerEmails = [];

function milestones(row) {
  return {
    viewed: Boolean(row.registrationViewedAt),
    started: Boolean(row.signupStartedAt),
    submitted: Boolean(row.registrationSubmittedAt),
    created: Boolean(row.accountCreatedAt),
    stage: row.acquisitionStage,
  };
}

async function createLead(leadType, email) {
  const row = await prisma.growthLead.create({
    data: {
      leadType,
      name: `${TAG} ${leadType} ${suffix}`,
      status: "DISCOVERED",
      acquisitionStage: "OUTREACH_SENT",
      contactEmailNormalized: email,
      contactEmailConfidence: "HIGH",
      source: TAG,
      sourceKind: "MANUAL_ADMIN",
      internalNotes: TAG,
    },
    select: { id: true },
  });
  leadIds.push(row.id);
  return row.id;
}

async function readLead(id) {
  return prisma.growthLead.findUniqueOrThrow({
    where: { id },
    select: {
      registrationViewedAt: true,
      signupStartedAt: true,
      registrationSubmittedAt: true,
      accountCreatedAt: true,
      acquisitionStage: true,
    },
  });
}

async function postForm(path, fields) {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined || v === null) continue;
    body.set(k, String(v));
  }
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  return { status: res.status, location: res.headers.get("location") || "" };
}

async function cleanup() {
  if (venueEmails.length) {
    await prisma.venueOwner.deleteMany({ where: { email: { in: venueEmails } } });
  }
  if (hostEmails.length) {
    await prisma.promoterUser.deleteMany({ where: { email: { in: hostEmails } } });
  }
  if (performerEmails.length) {
    await prisma.musicianUser.deleteMany({ where: { email: { in: performerEmails } } });
  }
  if (leadIds.length) {
    await prisma.growthLead.deleteMany({ where: { id: { in: leadIds } } });
  }
  await prisma.growthLead.deleteMany({ where: { source: TAG } });
}

const results = [];

try {
  // Source-order guard (always)
  for (const rel of [
    "src/app/register/venue/register-submit/route.ts",
    "src/app/register/promoter/register-submit/route.ts",
    "src/app/register/musician/register-submit/route.ts",
  ]) {
    const src = fs.readFileSync(rel, "utf8");
    const stampIdx = src.indexOf("stampRegistrationSubmitForLead");
    const consentIdx = src.indexOf("registrationContentConsentChecked");
    const rateIdx = src.indexOf("consumeRateLimit");
    const existsIdx = src.search(/existing|exists/);
    assert.ok(stampIdx > 0, `${rel} has stamp`);
    assert.ok(stampIdx < consentIdx, `${rel} stamp before consent`);
    assert.ok(stampIdx < rateIdx, `${rel} stamp before rate limit`);
    assert.ok(existsIdx < 0 || stampIdx < existsIdx || src.indexOf("error=exists") > stampIdx, `${rel} stamp before exists path`);
  }

  // A. Page load only
  {
    const email = `qa+view-${suffix}@micstage.internal`;
    const id = await createLead("VENUE", email);
    await stampRegistrationPageViewed(prisma, id, { leadType: "VENUE" });
    const m = milestones(await readLead(id));
    assert.equal(m.viewed, true);
    assert.equal(m.started, false);
    assert.equal(m.submitted, false);
    assert.equal(m.created, false);
    results.push({ case: "A_page_load", ...m });
  }

  // C. Missing consent — all three roles (HTTP)
  for (const role of [
    {
      name: "venue",
      leadType: "VENUE",
      path: "/register/venue/register-submit",
      email: `qa+consent-v-${suffix}@micstage.internal`,
      fields: (email, leadId) => ({ email, password: PASSWORD, growthTraceLeadId: leadId }),
    },
    {
      name: "host",
      leadType: "PROMOTER_ACCOUNT",
      path: "/register/promoter/register-submit",
      email: `qa+consent-h-${suffix}@micstage.internal`,
      fields: (email, leadId) => ({
        email,
        password: PASSWORD,
        displayName: `QA Host ${suffix}`,
        growthTraceLeadId: leadId,
      }),
    },
    {
      name: "performer",
      leadType: "ARTIST",
      path: "/register/musician/register-submit",
      email: `qa+consent-p-${suffix}@micstage.internal`,
      fields: (email, leadId) => ({
        email,
        password: PASSWORD,
        stageName: `QA Perf ${suffix}`,
        growthTraceLeadId: leadId,
      }),
    },
  ]) {
    const id = await createLead(role.leadType, role.email);
    await stampRegistrationPageViewed(prisma, id, { leadType: role.leadType });
    const { location } = await postForm(role.path, role.fields(role.email, id));
    assert.match(location, /error=consent/, `${role.name} consent redirect (${location})`);
    const m = milestones(await readLead(id));
    assert.equal(m.submitted, true, `${role.name} consent must stamp submit`);
    assert.equal(m.started, true, `${role.name} consent implies start`);
    assert.equal(m.created, false, `${role.name} consent must not create account`);
    results.push({ case: `C_missing_consent_${role.name}`, ...m, location, base: BASE });
  }

  // D. Duplicate account
  {
    const email = `qa+dup-v-${suffix}@micstage.internal`;
    venueEmails.push(email);
    await prisma.venueOwner.create({ data: { email, passwordHash: "qa-fixture-no-login" } });
    const id = await createLead("VENUE", email);
    const { location } = await postForm("/register/venue/register-submit", {
      email,
      password: PASSWORD,
      growthTraceLeadId: id,
      [REGISTRATION_CONSENT_CHECKBOX_NAME]: "true",
    });
    assert.match(location, /error=exists/, `dup redirect (${location})`);
    const m = milestones(await readLead(id));
    assert.equal(m.submitted, true);
    assert.equal(m.created, false);
    assert.notEqual(m.stage, "ACCOUNT_CREATED");
    results.push({ case: "D_duplicate_venue", ...m, location });
  }

  // E. Rate-limited (burn via HTTP posts so IP key matches)
  {
    const email = `qa+rate-v-${suffix}@micstage.internal`;
    const id = await createLead("VENUE", email);
    const fields = {
      email,
      password: PASSWORD,
      growthTraceLeadId: id,
      // no consent — still a genuine POST; venue rate-limit runs after stamp
    };
    let lastLoc = "";
    for (let i = 0; i < 7; i++) {
      const { location } = await postForm("/register/venue/register-submit", fields);
      lastLoc = location;
    }
    assert.match(lastLoc, /error=rate/, `rate redirect (${lastLoc})`);
    const m = milestones(await readLead(id));
    assert.equal(m.submitted, true);
    assert.equal(m.created, false);
    results.push({ case: "E_rate_limited_venue", ...m, location: lastLoc });
  }

  // F. Successful signup (performer)
  {
    const email = `qa+ok-p-${suffix}@micstage.internal`;
    performerEmails.push(email);
    const id = await createLead("ARTIST", email);
    await stampRegistrationPageViewed(prisma, id, { leadType: "ARTIST" });
    const { location } = await postForm("/register/musician/register-submit", {
      email,
      password: PASSWORD,
      stageName: `QA Ok Perf ${suffix}`,
      growthTraceLeadId: id,
      [REGISTRATION_CONSENT_CHECKBOX_NAME]: "true",
    });
    assert.match(location, /joined=/, `success redirect (${location})`);
    const m = milestones(await readLead(id));
    assert.equal(m.viewed, true);
    assert.equal(m.started, true);
    assert.equal(m.submitted, true);
    assert.equal(m.created, true);
    assert.equal(m.stage, "ACCOUNT_CREATED");
    results.push({ case: "F_success_performer", ...m, location });
  }

  console.log(JSON.stringify({ ok: true, base: BASE, results }, null, 2));
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await cleanup().catch((err) => console.error("[cleanup]", err));
  await prisma.$disconnect();
}
