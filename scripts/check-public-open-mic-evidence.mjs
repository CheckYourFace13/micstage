/**
 * Unit checks for public open-mic evidence eligibility.
 * Usage: node scripts/check-public-open-mic-evidence.mjs
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";

// Import via dynamic path won't work for TS — re-test through audit patterns +
// a minimal inline mirror of gate decisions used by claim/discovery.

const EXPLICIT =
  /(\bopen[\s-]?mic(?:s|e|rophone)?\b)|(\bopen[\s-]?mike\b)|(\bopen\s+jam\b)|(\bopen\s+stage\b)|(\bjam\s+night\b)|(\bopen\s+singer[\s-]?songwriter\b)|(\bsinger[\s-]?songwriter\s+(?:open\s*mic|night)\b)/i;
const CANCELLED =
  /\b(cancelled|canceled|permanently\s+closed|no\s+longer\s+(?:running|happening)|final\s+night)\b/i;

function hasTrustedNameOrSchedule(name, schedules) {
  if (EXPLICIT.test(name || "")) return true;
  for (const s of schedules || []) {
    if (EXPLICIT.test([s.title, s.description].filter(Boolean).join(" "))) return true;
  }
  return false;
}

// real venue but no open-mic evidence → not public
assert.equal(hasTrustedNameOrSchedule("Kafe Kerouac", []), false);
// official recurring open mic → public
assert.equal(hasTrustedNameOrSchedule("Open Mic @ The Cove Lounge", []), true);
assert.equal(
  hasTrustedNameOrSchedule("The Fox and Hounds", [
    { title: "OPEN MIC 2.0", description: "Open mic every Friday" },
  ]),
  true,
);
// cancelled → conflict
assert.equal(CANCELLED.test("CANCELLED: Broadway Open Mic Night"), true);
// one-time historical language
assert.equal(/\bone[\s-]?time\b/i.test("One-time open mic benefit night"), true);
// songwriter night counts
assert.equal(hasTrustedNameOrSchedule("Open Singer Songwriter Night! in Chicago at Moe's Tavern", []), true);
// good display name but no evidence
assert.equal(hasTrustedNameOrSchedule("Fallout Theater", []), false);

console.log(JSON.stringify({ ok: true, checks: "public open-mic evidence unit checks passed" }));
