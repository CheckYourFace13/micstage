/**
 * Regression: contact spam / Turnstile / honeypot wiring.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

for (const [path, re] of [
  ["src/lib/contactFormGuard.ts", /guardContactSubmission|detectMarketingSolicitation|TURNSTILE_SECRET_KEY|honeypot|contact_dup/],
  ["src/app/contact/actions.ts", /guardContactSubmission|CONTACT_HONEYPOT_FIELD|cf-turnstile-response/],
  ["src/app/contact/ContactForm.tsx", /TurnstileField|CONTACT_HONEYPOT_FIELD/],
  ["src/lib/ownerSummary/ownerDailySummaryEmail.ts", /Inbox &amp; email auth|dmarcReportsMailbox/],
  ["src/lib/ownerSummary/buildOwnerDailySummary.ts", /countContactQuarantinesSince|dmarc@micstage\.com/],
]) {
  assert.match(readFileSync(path, "utf8"), re, path);
}

const probe = `
import assert from "node:assert/strict";
import { detectMarketingSolicitation } from "./src/lib/contactFormGuard.ts";

assert.equal(detectMarketingSolicitation({
  name: "Growth Co",
  email: "sales@example.com",
  category: "partnership",
  details: "We can improve your SEO ranking with link building and backlinks for your website.",
}).solicitation, true);

assert.equal(detectMarketingSolicitation({
  name: "Casey",
  email: "casey@example.com",
  category: "listing_correction",
  details: "The open mic at Prairie Moon starts at 8pm not 7pm. Please correct the listing.",
}).solicitation, false);

assert.equal(detectMarketingSolicitation({
  name: "Ana",
  email: "ana@example.com",
  category: "other",
  details: "Hola, quiero mejorar el posicionamiento web de mi sitio con linkbuilding.",
}).solicitation, true);

assert.equal(detectMarketingSolicitation({
  name: "Luis",
  email: "luis@example.com",
  category: "venue_support",
  details: "Hola, tenemos un open mic los viernes y necesitamos ayuda con la cuenta de MicStage.",
}).solicitation, false);

console.log("detector: ok");
`;

const r = spawnSync("npx", ["tsx", "-e", probe], {
  encoding: "utf8",
  shell: true,
  cwd: process.cwd(),
});
if (r.status !== 0) {
  console.error(r.stdout);
  console.error(r.stderr);
  process.exit(r.status ?? 1);
}
console.log(r.stdout.trim());
console.log("check-contact-spam-guard: ok");
