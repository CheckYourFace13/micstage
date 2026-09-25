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
const PRICE_ESSENTIALS_USD = 0.005;
const PRICE_PRO_USD = 0.017;
const PRICE_ENTERPRISE_USD = 0.02;
const BUDGET_LOCK = 84123011;

export const ZERO_RESULT_COOLDOWN_MS = 30 * 24 * 3600 * 1000;
export const TRANSIENT_COOLDOWN_MS = 60 * 60 * 1000;

export type PlacesSku = "TEXT_SEARCH_IDS" | "DETAILS_ESSENTIALS" | "DETAILS_PRO" | "DETAILS_ENTERPRISE";
export type PlacesFetch = (url: string, init?: RequestInit) => Promise<Response>;

type LedgerRow = {
  sent: boolean;
  responseClass: string | null;
  placeId: string | null;
  blockedReason: string | null;
  retryAfter: Date | null;
};

export type LedgerClient = {
  placesUsageLedger: {
    create: (args: { data: Record<string, unknown> }) => Promise<{ id?: string } | unknown>;
    update: (args: { where: { idempotencyKey: string }; data: Record<string, unknown> }) => Promise<unknown>;
    findUnique: (args: { where: { idempotencyKey: string } }) => Promise<LedgerRow | null>;
    count: (args: { where: Record<string, unknown> }) => Promise<number>;
    aggregate: (args: { where: Record<string, unknown>; _sum: { estimatedUsdMicros: true } }) => Promise<{
      _sum: { estimatedUsdMicros: number | null };
    }>;
  };
  placesQueryIdentity: {
    findUnique: (args: { where: { logicalKey: string } }) => Promise<IdentityRow | null>;
    upsert: (args: {
      where: { logicalKey: string };
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    }) => Promise<IdentityRow>;
  };
  $transaction?: <T>(fn: (tx: LedgerClient) => Promise<T>) => Promise<T>;
  $executeRawUnsafe?: (query: string) => Promise<unknown>;
};

type IdentityRow = {
  logicalKey: string;
  placeId: string | null;
  responseClass: string | null;
  retryAfter: Date | null;
  permanentBlock: boolean;
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
  return process.env.GOOGLE_MAPS_SERVER_API_KEY?.trim() || process.env.GOOGLE_PLACES_API_KEY?.trim() || null;
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
  if (sku === "DETAILS_ENTERPRISE") return { ok: false, reason: "enterprise_background_blocked" };
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
  if (spent + incremental > LIMITS.hardCeilingUsd) return { ok: false, reason: "hard_ceiling_30" };
  if (sku !== "TEXT_SEARCH_IDS" && incremental > 0 && spent + incremental > LIMITS.softTargetUsd) {
    return { ok: false, reason: "soft_target_20" };
  }
  return { ok: true, incrementalUsd: incremental };
}

let memoryTail: Promise<unknown> = Promise.resolve();
function memorySerialize<T>(fn: () => Promise<T>): Promise<T> {
  const run = memoryTail.then(fn, fn);
  memoryTail = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function withBudgetLock<T>(prisma: LedgerClient, fn: (tx: LedgerClient) => Promise<T>): Promise<T> {
  if (typeof prisma.$transaction === "function") {
    return prisma.$transaction(async (tx) => {
      if (typeof tx.$executeRawUnsafe === "function") {
        await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${BUDGET_LOCK})`);
      }
      return fn(tx);
    });
  }
  return memorySerialize(() => fn(prisma));
}

export function nextUtcDay(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
}

export function nextUtcMonth(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

/** When a blocked request may be considered again. Enterprise never resumes. */
export function retryAfterForBlock(reason: string, now = new Date()): Date | null {
  if (reason === "enterprise_background_blocked") return null;
  if (reason === "pro_daily_cap" || reason === "essentials_daily_cap") return nextUtcDay(now);
  if (
    reason === "pro_monthly_cap" ||
    reason === "essentials_monthly_cap" ||
    reason === "soft_target_20" ||
    reason === "hard_ceiling_30"
  ) {
    return nextUtcMonth(now);
  }
  return nextUtcDay(now);
}

type AttemptGate =
  | { kind: "cached_id"; placeId: string | null }
  | { kind: "wait"; reason: string }
  | { kind: "reserved"; attemptKey: string };

async function saveIdentity(tx: LedgerClient, logicalKey: string, patch: Record<string, unknown>) {
  await tx.placesQueryIdentity.upsert({
    where: { logicalKey },
    create: { logicalKey, permanentBlock: false, ...patch },
    update: patch,
  });
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

async function gateOutbound(
  prisma: LedgerClient,
  input: {
    sku: PlacesSku;
    operation: string;
    purpose: string;
    fieldMask: string;
    logicalKey: string;
    placeId?: string | null;
  },
): Promise<AttemptGate> {
  return withBudgetLock(prisma, async (tx) => {
    const existing = await tx.placesQueryIdentity.findUnique({ where: { logicalKey: input.logicalKey } });
    if (existing?.permanentBlock) return { kind: "wait", reason: "enterprise_background_blocked" };
    if (input.sku === "TEXT_SEARCH_IDS" && existing?.responseClass === "success" && existing.placeId) {
      return { kind: "cached_id", placeId: existing.placeId };
    }
    if (existing?.retryAfter && existing.retryAfter.getTime() > Date.now()) {
      return { kind: "wait", reason: existing.responseClass ?? "cooldown" };
    }
    const decision = await placesBudgetDecision(tx, input.sku);
    if (!decision.ok) {
      const retryAfter = retryAfterForBlock(decision.reason);
      await saveIdentity(tx, input.logicalKey, {
        placeId: input.placeId ?? existing?.placeId ?? null,
        responseClass: decision.reason,
        retryAfter,
        permanentBlock: decision.reason === "enterprise_background_blocked",
      });
      return { kind: "wait", reason: decision.reason };
    }
    const attemptKey = `${input.logicalKey}:attempt:${createHash("sha256").update(`${Date.now()}:${Math.random()}`).digest("hex").slice(0, 16)}`;
    await tx.placesUsageLedger.create({
      data: {
        ...utcParts(),
        operation: input.operation,
        purpose: input.purpose,
        sku: input.sku,
        queryKeyHash: input.logicalKey,
        placeId: input.placeId ?? null,
        fieldMask: input.fieldMask,
        idempotencyKey: attemptKey,
        sent: true,
        dedupeHit: false,
        responseClass: "reserved",
        estimatedUsdMicros: Math.round(decision.incrementalUsd * 1_000_000),
        retryAfter: null,
      },
    });
    await saveIdentity(tx, input.logicalKey, {
      placeId: input.placeId ?? existing?.placeId ?? null,
      responseClass: "reserved",
      retryAfter: new Date(Date.now() + 120_000),
      permanentBlock: false,
    });
    return { kind: "reserved", attemptKey };
  });
}

async function finishAttempt(
  prisma: LedgerClient,
  input: {
    attemptKey: string;
    logicalKey: string;
    responseClass: string;
    placeId?: string | null;
    retryAfter?: Date | null;
    blockedReason?: string | null;
    permanentBlock?: boolean;
  },
) {
  await prisma.placesUsageLedger.update({
    where: { idempotencyKey: input.attemptKey },
    data: {
      responseClass: input.responseClass,
      placeId: input.placeId ?? null,
      blockedReason: input.blockedReason ?? null,
      retryAfter: input.retryAfter ?? null,
    },
  });
  await saveIdentity(prisma, input.logicalKey, {
    placeId: input.placeId ?? null,
    responseClass: input.logicalKey.startsWith("pro:") && input.responseClass === "success" ? "details_complete" : input.responseClass,
    retryAfter: input.retryAfter ?? null,
    permanentBlock: Boolean(input.permanentBlock),
  });
}

const inflight = new Map<string, Promise<unknown>>();

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
  const logicalKey = `ids:${hashKey(query.toLowerCase())}`;
  const ledger = prisma as unknown as LedgerClient;
  const key = googleMapsServerApiKey();

  const run = async (): Promise<IdsSearchResult> => {
    const gate = await gateOutbound(ledger, {
      sku: "TEXT_SEARCH_IDS",
      operation: "TEXT_SEARCH_IDS",
      purpose: input.purpose,
      fieldMask: IDS_ONLY_FIELD_MASK,
      logicalKey,
    });
    if (gate.kind === "cached_id") {
      return { placeId: gate.placeId, sent: false, deduped: true };
    }
    if (gate.kind === "wait") return { placeId: null, sent: false, deduped: true, blockedReason: gate.reason };
    if (!key) {
      await finishAttempt(ledger, {
        attemptKey: gate.attemptKey,
        logicalKey,
        responseClass: "transient",
        retryAfter: new Date(Date.now() + TRANSIENT_COOLDOWN_MS),
        blockedReason: "no_server_key",
      });
      return { placeId: null, sent: true, deduped: false, blockedReason: "no_server_key" };
    }
    const fetchImpl = input.fetchImpl ?? fetch;
    try {
      const res = await fetchImpl("https://places.googleapis.com/v1/places:searchText", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": key,
          "X-Goog-FieldMask": IDS_ONLY_FIELD_MASK,
        },
        body: JSON.stringify({ textQuery: query, regionCode: "US", languageCode: "en", maxResultCount: 1 }),
      });
      if (!res.ok) {
        const transient = res.status >= 500 || res.status === 429;
        await finishAttempt(ledger, {
          attemptKey: gate.attemptKey,
          logicalKey,
          responseClass: transient ? "transient" : `http_${res.status}`,
          retryAfter: new Date(Date.now() + (transient ? TRANSIENT_COOLDOWN_MS : ZERO_RESULT_COOLDOWN_MS)),
          blockedReason: `http_${res.status}`,
        });
        return { placeId: null, sent: true, deduped: false, blockedReason: `http_${res.status}` };
      }
      const data = (await res.json()) as { places?: Array<{ id?: string }> };
      const placeId = data.places?.[0]?.id ?? null;
      if (!placeId) {
        await finishAttempt(ledger, {
          attemptKey: gate.attemptKey,
          logicalKey,
          responseClass: "zero_results",
          retryAfter: new Date(Date.now() + ZERO_RESULT_COOLDOWN_MS),
        });
        return { placeId: null, sent: true, deduped: false };
      }
      await finishAttempt(ledger, {
        attemptKey: gate.attemptKey,
        logicalKey,
        placeId,
        responseClass: "success",
        retryAfter: null,
      });
      return { placeId, sent: true, deduped: false };
    } catch {
      await finishAttempt(ledger, {
        attemptKey: gate.attemptKey,
        logicalKey,
        responseClass: "transient",
        retryAfter: new Date(Date.now() + TRANSIENT_COOLDOWN_MS),
        blockedReason: "network",
      });
      return { placeId: null, sent: true, deduped: false, blockedReason: "network" };
    }
  };

  const pending = inflight.get(logicalKey) as Promise<IdsSearchResult> | undefined;
  if (pending) {
    const shared = await pending;
    return { ...shared, sent: false, deduped: true };
  }
  const promise = run().finally(() => inflight.delete(logicalKey));
  inflight.set(logicalKey, promise);
  return promise;
}

export async function placesDetailsPro(
  prisma: PrismaClient,
  input: { placeId: string; purpose: string; fetchImpl?: PlacesFetch },
): Promise<{ place: ProDetails | null; sent: boolean; deduped: boolean; blockedReason?: string }> {
  const placeId = input.placeId.trim();
  const logicalKey = `pro:${placeId}`;
  const ledger = prisma as unknown as LedgerClient;
  const key = googleMapsServerApiKey();
  if (DETAILS_PRO_FIELD_MASK.includes("*") || DETAILS_PRO_FIELD_MASK.includes("websiteUri")) {
    return { place: null, sent: false, deduped: false, blockedReason: "illegal_mask" };
  }
  const gate = await gateOutbound(ledger, {
    sku: "DETAILS_PRO",
    operation: "DETAILS_PRO",
    purpose: input.purpose,
    fieldMask: DETAILS_PRO_FIELD_MASK,
    logicalKey,
    placeId,
  });
  if (gate.kind === "cached_id") return { place: null, sent: false, deduped: true, blockedReason: "identity_without_payload" };
  if (gate.kind === "wait") return { place: null, sent: false, deduped: true, blockedReason: gate.reason };
  if (!key) {
    await finishAttempt(ledger, {
      attemptKey: gate.attemptKey,
      logicalKey,
      placeId,
      responseClass: "transient",
      retryAfter: new Date(Date.now() + TRANSIENT_COOLDOWN_MS),
      blockedReason: "no_server_key",
    });
    return { place: null, sent: true, deduped: false, blockedReason: "no_server_key" };
  }
  const fetchImpl = input.fetchImpl ?? fetch;
  try {
    const res = await fetchImpl(
      `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?languageCode=en`,
      { headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": DETAILS_PRO_FIELD_MASK } },
    );
    if (!res.ok) {
      const transient = res.status >= 500 || res.status === 429;
      await finishAttempt(ledger, {
        attemptKey: gate.attemptKey,
        logicalKey,
        placeId,
        responseClass: transient ? "transient" : `http_${res.status}`,
        retryAfter: new Date(Date.now() + (transient ? TRANSIENT_COOLDOWN_MS : ZERO_RESULT_COOLDOWN_MS)),
        blockedReason: `http_${res.status}`,
      });
      return { place: null, sent: true, deduped: false, blockedReason: `http_${res.status}` };
    }
    const place = (await res.json()) as ProDetails;
    await finishAttempt(ledger, {
      attemptKey: gate.attemptKey,
      logicalKey,
      placeId: place.id ?? placeId,
      responseClass: "success",
      retryAfter: null,
    });
    return { place, sent: true, deduped: false };
  } catch {
    await finishAttempt(ledger, {
      attemptKey: gate.attemptKey,
      logicalKey,
      placeId,
      responseClass: "transient",
      retryAfter: new Date(Date.now() + TRANSIENT_COOLDOWN_MS),
      blockedReason: "network",
    });
    return { place: null, sent: true, deduped: false, blockedReason: "network" };
  }
}
