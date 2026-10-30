/**
 * Support recovery, password-reset origin, reply classifier, and brand-signature checks.
 * Run: npx tsx scripts/check-support-privacy-pass.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const prevApp = process.env.APP_URL;
const prevPublic = process.env.NEXT_PUBLIC_APP_URL;
const prevNode = process.env.NODE_ENV;

process.env.NODE_ENV = "production";
process.env.APP_URL = "http://0.0.0.0:3000";
process.env.NEXT_PUBLIC_APP_URL = "https://micstage.com";

const { publicOriginForOutboundEmail, isNonBrowserPublicHost } = await import("../src/lib/publicSeo.ts");
const {
  selectResetAccountTypes,
  PASSWORD_RESET_TTL_MINUTES,
  passwordResetPathForType,
  passwordResetEmailContent,
  isPasswordResetTokenUsable,
  publicPasswordResetOrigin,
} = await import("../src/lib/passwordReset.ts");
const { classifyAuthoritativeCorrectionReply } = await import(
  "../src/lib/marketing/authoritativeReplyClassifier.ts"
);
const { appBaseUrl } = await import("../src/lib/marketing/emailConfig.ts");
const { buildListingClaimInvitePayload } = await import("../src/lib/publicListings/listingClaimInviteEmail.ts");
const { growthOutreachSubject } = await import("../src/lib/marketing/outreachTemplates.ts");

assert.equal(isNonBrowserPublicHost("0.0.0.0"), true);
assert.equal(isNonBrowserPublicHost("localhost"), true);
assert.equal(isNonBrowserPublicHost("127.0.0.1"), true);
assert.equal(isNonBrowserPublicHost("micstage.com"), false);
assert.equal(publicOriginForOutboundEmail(), "https://micstage.com");
assert.equal(publicPasswordResetOrigin(), "https://micstage.com");
assert.equal(appBaseUrl(), "https://micstage.com");

process.env.APP_URL = "http://localhost:3000";
process.env.NEXT_PUBLIC_APP_URL = "";
assert.equal(publicOriginForOutboundEmail(), "https://micstage.com");

process.env.APP_URL = "https://micstage.com";
assert.equal(publicOriginForOutboundEmail(), "https://micstage.com");

assert.equal(PASSWORD_RESET_TTL_MINUTES, 120);
assert.equal(passwordResetPathForType("VENUE"), "/reset/venue");
assert.equal(passwordResetPathForType("PROMOTER"), "/reset/promoter");
assert.equal(passwordResetPathForType("MUSICIAN"), "/reset/musician");

assert.deepEqual(
  selectResetAccountTypes({ found: ["MUSICIAN"], preferred: "VENUE", fallbackToAnyType: true }),
  ["MUSICIAN"],
);
assert.deepEqual(
  selectResetAccountTypes({ found: ["VENUE", "MUSICIAN"], preferred: "VENUE", fallbackToAnyType: true }),
  ["VENUE", "MUSICIAN"],
);
assert.deepEqual(
  selectResetAccountTypes({ found: ["VENUE", "MUSICIAN"], preferred: "VENUE", fallbackToAnyType: false }),
  ["VENUE"],
);
assert.deepEqual(selectResetAccountTypes({ found: [], preferred: "VENUE", fallbackToAnyType: true }), []);

const now = Date.now();
assert.equal(
  isPasswordResetTokenUsable(
    { accountType: "VENUE", usedAt: null, expiresAt: new Date(now + 60_000) },
    "VENUE",
    now,
  ),
  true,
);
assert.equal(
  isPasswordResetTokenUsable(
    { accountType: "VENUE", usedAt: null, expiresAt: new Date(now - 1) },
    "VENUE",
    now,
  ),
  false,
);
assert.equal(
  isPasswordResetTokenUsable(
    { accountType: "VENUE", usedAt: new Date(now), expiresAt: new Date(now + 60_000) },
    "VENUE",
    now,
  ),
  false,
);
assert.equal(
  isPasswordResetTokenUsable(
    { accountType: "MUSICIAN", usedAt: null, expiresAt: new Date(now + 60_000) },
    "VENUE",
    now,
  ),
  false,
);

const resetMail = passwordResetEmailContent([
  { accountType: "VENUE", link: "https://micstage.com/reset/venue/tok" },
]);
assert.match(resetMail.text, /https:\/\/micstage.com\/reset\/venue\/tok/);
assert.match(resetMail.text, /Thanks,\nMicStage/);
assert.doesNotMatch(resetMail.text, /\bChris\b/);
assert.doesNotMatch(resetMail.html, /\bChris\b/);
assert.doesNotMatch(resetMail.text, /@gmail\.com|iscreamstudio/i);

const {
  ianSupportEmailContent,
  unityAckEmailContent,
  redactEmail,
} = await import("../src/lib/ops/closeCustomerSupportLoops.ts");
const ianSupport = ianSupportEmailContent();
assert.match(ianSupport.text, /Thanks,\nMicStage/);
assert.match(ianSupport.html, /Thanks,<br \/>MicStage/);
assert.doesNotMatch(ianSupport.text, /\bChris\b|\bCasey\b|iscreamstudio/i);
assert.doesNotMatch(ianSupport.html, /\bChris\b|\bCasey\b|iscreamstudio/i);
const unityAck = unityAckEmailContent();
assert.match(unityAck.text, /will not contact you about marketing/);
assert.match(unityAck.text, /Thanks,\nMicStage/);
assert.doesNotMatch(unityAck.text, /\bChris\b|\bCasey\b|iscreamstudio/i);
assert.equal(redactEmail("ian@example.com"), "ia…@example.com");

const invite = buildListingClaimInvitePayload({
  listingName: "QA Open Mic",
  listingSlug: "qa-open-mic",
  city: "Austin",
  region: "TX",
  claimUrl: "https://micstage.com/claim/qa-open-mic?t=test",
  isReminder: true,
});
assert.match(invite.textBody, /Thanks,\nMicStage/);
assert.doesNotMatch(invite.textBody, /\bChris\b/);
assert.doesNotMatch(invite.htmlBody, /Chris<br/);
assert.doesNotMatch(invite.htmlBody, /\bChris\b/);

assert.ok(typeof growthOutreachSubject === "function");

const removal = classifyAuthoritativeCorrectionReply(
  "Please delete this listing. We no longer host this and it has not been held since spring.",
);
assert.equal(removal.intent, "high_confidence_removal");
assert.equal(removal.confidence, "high");

const ended = classifyAuthoritativeCorrectionReply("The event ended. Please remove this listing.");
assert.equal(ended.intent, "high_confidence_removal");

const wrong = classifyAuthoritativeCorrectionReply("The listing has the wrong dates and wrong location.");
assert.equal(wrong.intent, "high_confidence_reverify");

const unsub = classifyAuthoritativeCorrectionReply("Please unsubscribe and stop emailing me.");
assert.equal(unsub.intent, "unsubscribe");

const question = classifyAuthoritativeCorrectionReply("Can you tell me how claiming works?");
assert.equal(question.intent, "none");

const ambiguous = classifyAuthoritativeCorrectionReply("Wrong dates? Can you confirm what you have listed?");
assert.equal(ambiguous.intent, "ambiguous_review");

const personalNameRe = /Thanks,\s*Chris\b|Thanks,<br \/>Chris|Chris <drummer@/i;
const personalEmailRe = /chris@iscreamstudio\.com/i;
const scanRoots = ["src/lib", "src/app"];
const skip = new Set(["src/lib/ownerSummary/ownerSummaryConfig.ts"]);
let signatureHits = 0;
let personalEmailHits = 0;
for (const root of scanRoots) {
  const walk = (dir) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        walk(p);
        continue;
      }
      if (!/\.(ts|tsx)$/.test(ent.name)) continue;
      const rel = p.replaceAll("\\", "/");
      if (skip.has(rel)) continue;
      const text = fs.readFileSync(p, "utf8");
      if (personalNameRe.test(text)) {
        signatureHits += 1;
        console.error("personal signature", rel);
      }
      if (personalEmailRe.test(text) && !rel.includes("ownerSummary") && !rel.includes("daily-owner-summary")) {
        personalEmailHits += 1;
        console.error("personal email", rel);
      }
    }
  };
  walk(root);
}
assert.equal(signatureHits, 0, "automated emails must not sign with a personal name");
assert.equal(personalEmailHits, 0, "customer-facing code must not expose a personal email");

if (prevApp === undefined) delete process.env.APP_URL;
else process.env.APP_URL = prevApp;
if (prevPublic === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
else process.env.NEXT_PUBLIC_APP_URL = prevPublic;
if (prevNode === undefined) delete process.env.NODE_ENV;
else process.env.NODE_ENV = prevNode;

console.log("check-support-privacy-pass: ok");
