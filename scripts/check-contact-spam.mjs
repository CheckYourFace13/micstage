/**
 * Regression: contact spam wiring + detector.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

function read(path) {
  return readFileSync(path, "utf8");
}

const run = spawnSync("npx", ["tsx", "scripts/tmp-contact-detector.mjs"], {
  cwd: process.cwd(),
  encoding: "utf8",
  shell: true,
});
if (run.status !== 0) {
  console.error(run.stderr || run.stdout);
  process.exit(1);
}
assert.match(run.stdout, /detector-ok/);

const form = read("src/app/contact/ContactForm.tsx");
assert.match(form, /CONTACT_HONEYPOT_FIELD|company_website/);
assert.match(form, /TurnstileField/);

const actions = read("src/app/contact/actions.ts");
assert.match(actions, /guardContactSubmission/);
assert.match(actions, /CONTACT_QUARANTINE_EVENT_KIND/);

const summary = read("src/lib/ownerSummary/buildOwnerDailySummary.ts");
assert.match(summary, /dmarc@micstage\.com/);
assert.match(summary, /contactQuarantined7d/);
assert.match(summary, /from ["']@\/lib\/contactFormGuard["']/);

const email = read("src/lib/ownerSummary/ownerDailySummaryEmail.ts");
assert.match(email, /Inbox &amp; email auth|INBOX & EMAIL AUTH/);

console.log("check-contact-spam: ok");
