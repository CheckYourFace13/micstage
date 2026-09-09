/**
 * Artist timing: performance length vs start interval (fixtures A–E).
 *   npx tsx scripts/check-artist-timing.mjs
 */
import assert from "node:assert/strict";
import {
  artistTimingPublicLabel,
  fromStoredSlotTiming,
  generateSlotsFromArtistTiming,
  parseArtistTiming,
  toStoredSlotTiming,
} from "../src/lib/artistTiming.ts";
import { scheduleWindowFromTimeInputs } from "../src/lib/scheduleWindow.ts";
import { slotMayBeDeleted } from "../src/lib/slotSync.ts";
import { minutesToTimeLabel } from "../src/lib/time.ts";

function starts(slots) {
  return slots.map((s) => s.startMin);
}

// A: 9 PM–1 AM, 15 min performance, 20 min starts
{
  const window = scheduleWindowFromTimeInputs("21:00", "01:00");
  assert.ok(window);
  const slots = generateSlotsFromArtistTiming({
    startTimeMin: window.startTimeMin,
    endTimeMin: window.endTimeMin,
    performanceMinutes: 15,
    artistStartEveryMinutes: 20,
  });
  const expected = [1260, 1280, 1300, 1320, 1340, 1360, 1380, 1400, 1420, 1440, 1460, 1480];
  assert.deepEqual(starts(slots), expected, "A: start grid");
  assert.equal(slots.length, 12);
  for (const s of slots) {
    assert.equal(s.endMin - s.startMin, 15, "A: performance length 15");
  }
  // Public labels are start times only (no end range / break rows in this helper).
  assert.equal(minutesToTimeLabel(slots[0].startMin), "9:00 PM");
  assert.equal(minutesToTimeLabel(slots[1].startMin), "9:20 PM");
  assert.equal(
    artistTimingPublicLabel({ slotMinutes: 15, breakMinutes: 5 }),
    "15 min performances · artists start every 20 min",
  );
  assert.ok(!artistTimingPublicLabel({ slotMinutes: 15, breakMinutes: 5 }).toLowerCase().includes("break"));
}

// B: back-to-back 15/15
{
  const window = scheduleWindowFromTimeInputs("21:00", "01:00");
  const slots = generateSlotsFromArtistTiming({
    startTimeMin: window.startTimeMin,
    endTimeMin: window.endTimeMin,
    performanceMinutes: 15,
    artistStartEveryMinutes: 15,
  });
  assert.deepEqual(starts(slots).slice(0, 4), [1260, 1275, 1290, 1305], "B: 15-min starts");
  assert.equal(artistTimingPublicLabel({ slotMinutes: 15, breakMinutes: 0 }), "15 min performances");
}

// C: 10 PM–2 AM, 10 min performance, 15 min starts
{
  const window = scheduleWindowFromTimeInputs("22:00", "02:00");
  const slots = generateSlotsFromArtistTiming({
    startTimeMin: window.startTimeMin,
    endTimeMin: window.endTimeMin,
    performanceMinutes: 10,
    artistStartEveryMinutes: 15,
  });
  assert.equal(slots[0].startMin, 1320);
  assert.equal(slots[1].startMin, 1335);
  assert.equal(slots[0].endMin, 1330);
  assert.ok(slots.every((s) => s.endMin - s.startMin === 10));
}

// D: future-night apply semantics — same timing regenerates identical start grids
{
  const window = scheduleWindowFromTimeInputs("21:00", "01:00");
  const stored = toStoredSlotTiming({ performanceMinutes: 15, artistStartEveryMinutes: 20 });
  const nightA = generateSlotsFromArtistTiming({
    startTimeMin: window.startTimeMin,
    endTimeMin: window.endTimeMin,
    ...fromStoredSlotTiming(stored),
  });
  const nightB = generateSlotsFromArtistTiming({
    startTimeMin: window.startTimeMin,
    endTimeMin: window.endTimeMin,
    performanceMinutes: stored.slotMinutes,
    artistStartEveryMinutes: stored.slotMinutes + stored.breakMinutes,
  });
  assert.deepEqual(starts(nightA), starts(nightB), "D: identical regeneration for future nights");
}

// E: booked slots stay protected
{
  assert.equal(
    slotMayBeDeleted({
      id: "booked",
      startMin: 1260,
      endMin: 1275,
      status: "AVAILABLE",
      booking: { cancelledAt: null },
    }),
    false,
    "E: active booking protected",
  );
  assert.equal(
    slotMayBeDeleted({
      id: "open",
      startMin: 1280,
      endMin: 1295,
      status: "AVAILABLE",
      booking: null,
    }),
    true,
    "E: unbooked may regenerate away",
  );
}

// Validation: start every < performance rejected
{
  const bad = parseArtistTiming({ performanceMinutes: 15, artistStartEveryMinutes: 10 });
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.equal(bad.reason, "start_every_too_short");
}

// Legacy form pair still maps
{
  const fd = new FormData();
  fd.set("slotMinutes", "15");
  fd.set("breakMinutes", "5");
  const { parseArtistTimingFromForm } = await import("../src/lib/artistTiming.ts");
  const parsed = parseArtistTimingFromForm(fd, { performanceMinutes: 15, artistStartEveryMinutes: 20 });
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.stored.slotMinutes, 15);
    assert.equal(parsed.stored.breakMinutes, 5);
    assert.equal(parsed.timing.artistStartEveryMinutes, 20);
  }
}

console.log(JSON.stringify({ ok: true, checks: "artist-timing A-E" }));
