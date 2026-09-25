/**
 * Sole server-side Google Places gateway.
 * Production fetches places.googleapis.com only from this module.
 * No legacy maps.googleapis.com/maps/api/place path.
 */
import { createHash } from "node:crypto";
import type { PrismaClient } from "@/generated/prisma/client";

export const IDS_ONLY_FIELD_MASK = "places.id";
/** Pro details needed to decide venue identity. No websiteUri (Enterprise). */
export const DETAILS_PRO_FIELD_MASK = [
  "id",
  "displayName",
  "formattedAddress",
  "location",
  "types",
  "businessStatus",
  "addressComponents",
].join(",");

export const LIMITS = {
  detailsProPerDay: 20,
  detailsProPerMonth: 600,
  detailsEssentialsPerDay: 33,
  detailsEssentialsPerMonth: 1000,
  detailsEnterprisePerDay: 0,
  detailsEnterprisePerMonth: 0,
  softTargetUsd: 20,
  hardCeilingUsd: 30,
} as const;

const FREE_ESSENTIALS_PER_MONTH = 10_000;
const FREE_PRO_PER_MONTH = 5_000;
/** After free tier, modeled USD per call. */
const PRICE_ESSENTIALS_USD = 0.005;
const PRICE_PRO_USD = 0.017;
const PRICE_ENTERPRISE_USD = 0.02;

export type PlacesSku = "TEXT_SEARCH_IDS" | "DETAILS_ESSENTIALS" | "DETAILS_PRO" | "DETAILS_ENTERPRISE";

export type PlacesFetch = (url: string, init?: RequestInit) => Promise<Response>;

type LedgerClient = {
  placesUsageLedger: {
    create: (args: { data: Record<string, unknown> }) => Promise<unknown>;
    findUnique: (args: { where: { idempotencyKey: string } }) => Promise<{
      sent: boolean;
      responseClass: string | null;
      placeId: string | null;
      blockedReason: string | null;
    } | null>;
    count: (args: { where: Record<string, unknown> }) => Promise<number>;
    aggregate: (args: { where: Record<string, unknown>; _sum: { estimatedUsdMicros: true } }) => Promise<{
      _sum: { estimatedUsdMicros: number | null };
    }>;
  };
};

function hashKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex").slice(0, 32);
}

function utcParts(now = new Date()) {
  const dayUtc = now.toISOString().slice(0, 10);
  const monthUtc = dayUtc.slice(0, 7);
  return { dayUtc, monthUtc };
}

export function googleMapsServerApiKey(): string | null {
  return (
    process.env.GOOGLE_MAPS_SERVER_API_KEY?.trim() || process.env.GOOGLE_PLACES_API_KEY?.trim() || null
  );
}

export function modeledIncrementalUsd(sku: PlacesSku, sentThisMonthBefore: number): number {
  if (sku === "TEXT_SEARCH_IDS") return 0;
  if (sku === "DETAILS_ESSENTIALS") {
    return sentThisMonthBefore >= FREE_ESSENTIALS_PER_MONTH ? PRICE_ESSENTIALS_USD : 0;
  }
  if (sku === "DETAILS_PRO") {
    return sentThisMonthBefore >= FREE_PRO_PER_MONTH ? PRICE_PRO_USD : 0;
  }
  return PRICE_ENTERPRISE_USD;
}

export async function monthSpendUsd(prisma: LedgerClient): Promise<number> {
  const { monthUtc } = utcParts();
  const agg = await prisma.placesUsageLedger.aggregate({
    where: { monthUtc, sent: true },
    _sum: { estimatedUsdMicros: true },
  });
  return (agg._sum.estimatedUsdMicros ?? 0) / 1_000_000;
}

async function sentCount(prisma: LedgerClient, sku: PlacesSku, field: "dayUtc" | "monthUtc", value: string) {
  return prisma.placesUsageLedger.count({ where: { sku, sent: true, [field]: value } });
}

export async function placesBudgetDecision(
  prisma: LedgerClient,
  sku: PlacesSku,
): Promise<{ ok: true; incrementalUsd: number } | { ok: false; reason: string }> {
  if (sku === "DETAILS_ENTERPRISE") {
    return { ok: false, reason: "enterprise_background_blocked" };
  }
  const { dayUtc, monthUtc } = utcParts();
  const monthSent = await sentCount(prisma, sku, "monthUtc", monthUtc);
  const daySent = await sentCount(prisma, sku, "dayUtc", dayUtc);
  if (sku === "DETAILS_PRO") {
    if (daySent >= LIMITS.detailsProPerDay) return { ok: false, reason: "pro_daily_cap" };
    if (monthSent >= LIMITS.detailsProPerMonth) return { ok: false, reason: "pro_monthly_cap" };
  }
  if (sku === "DETAILS_ESSENTIALS") {
    if (daySent >= LIMITS.detailsEssentialsPerDay) return { ok: false, reason: "essentials_daily_cap" };
    if (monthSent >= LIMITS.detailsEssentialsPerMonth) return { ok: false, reason: "essentials_monthly_cap" };
  }
  const incremental = modeledIncrementalUsd(sku, monthSent);
  const spent = await monthSpendUsd(prisma);
  if (spent + incremental > LIMITS.hardCeilingUsd) {
    return { ok: false, reason: "hard_ceiling_30" };
  }
  if (sku !== "TEXT_SEARCH_IDS" && incremental > 0 && spent + incremental > LIMITS.softTargetUsd) {
    return { ok: false, reason: "soft_target_20" };
  }
  return { ok: true, incrementalUsd: incremental };
}

const inflight = new Map<string, Promise<unknown>>();

async function claimOrHit(
  prisma: LedgerClient,
  input: {
    sku: PlacesSku;
    operation: string;
    purpose: string;
    fieldMask: string;
    idempotencyKey: string;
    queryKeyHash?: string;
    placeId?: string | null;
    sent: boolean;
    dedupeHit: boolean;
    responseClass?: string;
    estimatedUsdMicros: number;
    blockedReason?: string;
  },
) {
  try {
    await prisma.placesUsageLedger.create({
      data: {
        ...utcParts(),
        operation: input.operation,
        purpose: input.purpose,
        sku: input.sku,
        queryKeyHash: input.queryKeyHash ?? null,
        placeId: input.placeId ?? null,
        fieldMask: input.fieldMask,
        idempotencyKey: input.idempotencyKey,
        sent: input.sent,
        dedupeHit: input.dedupeHit,
        responseClass: input.responseClass ?? null,
        estimatedUsdMicros: input.estimatedUsdMicros,
        blockedReason: input.blockedReason ?? null,
      },
    });
    return { claimed: true as const };
  } catch {
    const existing = await prisma.placesUsageLedger.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    return { claimed: false as const, existing };
  }
}

export type IdsSearchResult = {
  placeId: string | null;
  sent: boolean;
  deduped: boolean;
  blockedReason?: string;
};

export async function placesTextSearchIdsOnly(
  prisma: PrismaClient,
  input: { query: string; purpose: string; fetchImpl?: PlacesFetch },
): Promise<IdsSearchResult> {
  const query = input.query.trim();
  const idempotencyKey = `ids:${hashKey(query.toLowerCase())}`;
  const key = googleMapsServerApiKey();
  const ledger = prisma as unknown as LedgerClient;
  const existing = await ledger.placesUsageLedger.findUnique({ where: { idempotencyKey } });
  if (existing?.sent && existing.placeId) {
    return { placeId: existing.placeId, sent: false, deduped: true };
  }
  if (existing && !existing.sent && existing.blockedReason) {
    return { placeId: null, sent: false, deduped: true, blockedReason: existing.blockedReason };
  }

  const decision = await placesBudgetDecision(ledger, "TEXT_SEARCH_IDS");
  if (!decision.ok) {
    await claimOrHit(ledger, {
      sku: "TEXT_SEARCH_IDS",
      operation: "TEXT_SEARCH_IDS",
      purpose: input.purpose,
      fieldMask: IDS_ONLY_FIELD_MASK,
      idempotencyKey,
      queryKeyHash: hashKey(query.toLowerCase()),
      sent: false,
      dedupeHit: false,
      blockedReason: decision.reason,
      estimatedUsdMicros: 0,
    });
    return { placeId: null, sent: false, deduped: false, blockedReason: decision.reason };
  }
  if (!key) {
    return { placeId: null, sent: false, deduped: false, blockedReason: "no_server_key" };
  }

  const run = async (): Promise<IdsSearchResult> => {
    const claim = await claimOrHit(ledger, {
      sku: "TEXT_SEARCH_IDS",
      operation: "TEXT_SEARCH_IDS",
      purpose: input.purpose,
      fieldMask: IDS_ONLY_FIELD_MASK,
      idempotencyKey,
      queryKeyHash: hashKey(query.toLowerCase()),
      sent: true,
      dedupeHit: false,
      estimatedUsdMicros: 0,
      responseClass: "pending",
    });
    if (!claim.claimed) {
      return {
        placeId: claim.existing?.placeId ?? null,
        sent: false,
        deduped: true,
        blockedReason: claim.existing?.blockedReason ?? undefined,
      };
    }
    const fetchImpl = input.fetchImpl ?? fetch;
    const res = await fetchImpl("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": IDS_ONLY_FIELD_MASK,
      },
      body: JSON.stringify({
        textQuery: query,
        regionCode: "US",
        languageCode: "en",
        maxResultCount: 1,
      }),
    });
    if (!res.ok) {
      return { placeId: null, sent: true, deduped: false, blockedReason: `http_${res.status}` };
    }
    const data = (await res.json()) as { places?: Array<{ id?: string }> };
    const placeId = data.places?.[0]?.id ?? null;
    return { placeId, sent: true, deduped: false };
  };

  const pending = inflight.get(idempotencyKey) as Promise<IdsSearchResult> | undefined;
  if (pending) {
    const shared = await pending;
    return { ...shared, sent: false, deduped: true };
  }
  const promise = run().finally(() => inflight.delete(idempotencyKey));
  inflight.set(idempotencyKey, promise);
  return promise;
}

export type ProDetails = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  types?: string[];
  businessStatus?: string;
  addressComponents?: Array<{ longText?: string; shortText?: string; types?: string[] }>;
};

export async function placesDetailsPro(
  prisma: PrismaClient,
  input: { placeId: string; purpose: string; fetchImpl?: PlacesFetch },
): Promise<{ place: ProDetails | null; sent: boolean; deduped: boolean; blockedReason?: string }> {
  const placeId = input.placeId.trim();
  const idempotencyKey = `pro:${placeId}`;
  const key = googleMapsServerApiKey();
  const ledger = prisma as unknown as LedgerClient;
  const existing = await ledger.placesUsageLedger.findUnique({ where: { idempotencyKey } });
  if (existing) {
    return { place: null, sent: false, deduped: true, blockedReason: existing.blockedReason ?? "already_resolved" };
  }

  const decision = await placesBudgetDecision(ledger, "DETAILS_PRO");
  if (!decision.ok) {
    await claimOrHit(ledger, {
      sku: "DETAILS_PRO",
      operation: "DETAILS_PRO",
      purpose: input.purpose,
      fieldMask: DETAILS_PRO_FIELD_MASK,
      idempotencyKey,
      placeId,
      sent: false,
      dedupeHit: false,
      blockedReason: decision.reason,
      estimatedUsdMicros: 0,
    });
    return { place: null, sent: false, deduped: false, blockedReason: decision.reason };
  }
  if (!key) return { place: null, sent: false, deduped: false, blockedReason: "no_server_key" };
  if (DETAILS_PRO_FIELD_MASK.includes("*") || DETAILS_PRO_FIELD_MASK.includes("websiteUri")) {
    return { place: null, sent: false, deduped: false, blockedReason: "illegal_mask" };
  }

  const claim = await claimOrHit(ledger, {
    sku: "DETAILS_PRO",
    operation: "DETAILS_PRO",
    purpose: input.purpose,
    fieldMask: DETAILS_PRO_FIELD_MASK,
    idempotencyKey,
    placeId,
    sent: true,
    dedupeHit: false,
    estimatedUsdMicros: Math.round(decision.incrementalUsd * 1_000_000),
  });
  if (!claim.claimed) {
    return { place: null, sent: false, deduped: true };
  }

  const fetchImpl = input.fetchImpl ?? fetch;
  const res = await fetchImpl(
    `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?languageCode=en`,
    { headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": DETAILS_PRO_FIELD_MASK } },
  );
  if (!res.ok) return { place: null, sent: true, deduped: false, blockedReason: `http_${res.status}` };
  const place = (await res.json()) as ProDetails;
  return { place, sent: true, deduped: false };
}
