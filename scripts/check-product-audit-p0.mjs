/**
 * Product-audit regression checks for P0 conversion fixes (no DB).
 * Run: node scripts/check-product-audit-p0.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

{
  const hub = read("src/app/login/page.tsx");
  assert.ok(hub.includes("encodeURIComponent(next)"), "login hub must forward next");
  assert.ok(hub.includes("/login/venue"), "login hub links venue login");
}

{
  const activate = read("src/app/claim/activate/[venueSlug]/page.tsx");
  assert.ok(activate.includes("/login/venue?next="), "claim activate must deep-link venue login");
}

{
  const reg = read("src/app/register/musician/page.tsx");
  const submit = read("src/app/register/musician/register-submit/route.ts");
  assert.ok(reg.includes('name="next"'), "musician register preserves next");
  assert.ok(submit.includes("safeAfterMusicianLoginPath"), "register submit returns to listing");
}

{
  const safe = read("src/lib/safeRedirect.ts");
  assert.ok(safe.includes("/open-mics/"), "musician next allows open-mics");
}

{
  const pub = read("src/components/PublicDataUnavailable.tsx");
  assert.ok(!pub.includes("DATABASE_URL"), "no DATABASE_URL to users");
  assert.ok(!pub.includes("PRISMA"), "no Prisma jargon to users");
}

{
  const venue = read("src/app/venues/[venueSlug]/page.tsx");
  assert.ok(!venue.includes("Prisma migrations"), "no Prisma on venue error");
}

{
  const merge = read("src/lib/publicListings/discoveryMerge.ts");
  assert.ok(!/bookable:\s*true/.test(merge), "finder must not hardcode bookable true");
  assert.ok(merge.includes("displayListingAddress"), "listing address de-dupe helper");
}

{
  const home = read("src/app/page.tsx");
  assert.ok(/Free for performers/i.test(home) || /Free open mic discovery/i.test(home));
  assert.ok(home.includes("data-track-event"));
}

{
  const empty = read("src/components/publicListings/EmptyDiscoveryActions.tsx");
  assert.ok(empty.includes('href="/map"'), "empty state offers map");
  assert.ok(empty.includes('href="/locations"'), "empty state offers locations");
}

console.log("check-product-audit-p0: ok");
