/**
 * Temporary safe request-source logging for growth discovery invocations.
 * Never logs Authorization, CRON_SECRET, or other credentials.
 */

type RecentFingerprint = { atMs: number; requestId: string };

const RECENT_TTL_MS = 3 * 60_000;
const recentByFingerprint = new Map<string, RecentFingerprint>();

function redactIpv4(ip: string): string {
  const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return ip.includes(":") ? "ipv6-redacted" : "ip-redacted";
  return `${m[1]}.${m[2]}.*.*`;
}

function firstHop(xff: string | null): string | null {
  if (!xff?.trim()) return null;
  const hop = xff.split(",")[0]?.trim();
  return hop ? redactIpv4(hop) : null;
}

function trustedSourceIp(request: Request): string | null {
  const xff = request.headers.get("x-forwarded-for");
  const fromXff = firstHop(xff);
  if (fromXff) return fromXff;
  const realIp =
    request.headers.get("x-real-ip")?.trim() ||
    request.headers.get("cf-connecting-ip")?.trim() ||
    request.headers.get("x-hcdn-client-ip")?.trim() ||
    null;
  return realIp ? redactIpv4(realIp) : null;
}

function pruneRecent(now: number) {
  for (const [k, v] of recentByFingerprint) {
    if (now - v.atMs > RECENT_TTL_MS) recentByFingerprint.delete(k);
  }
}

export type DiscoveryRequestSourceSnapshot = {
  requestId: string;
  timestamp: string;
  method: string;
  host: string | null;
  phase: string;
  userAgent: string | null;
  sourceIpRedacted: string | null;
  xForwardedFor: { present: boolean; hopCount: number; firstHopRedacted: string | null };
  authorizationPassed: boolean;
  inboundRequestIdHeader: string | null;
  possibleRetryOfRequestId: string | null;
};

export function beginDiscoveryRequestSourceLog(
  request: Request,
  opts: { phase: string; authorizationPassed: boolean },
): DiscoveryRequestSourceSnapshot {
  const now = Date.now();
  pruneRecent(now);

  const url = new URL(request.url);
  const inboundRequestId =
    request.headers.get("x-request-id")?.trim() ||
    request.headers.get("x-hcdn-request-id")?.trim() ||
    null;
  const requestId = inboundRequestId || `ms-disc-${crypto.randomUUID()}`;

  const xffRaw = request.headers.get("x-forwarded-for");
  const xffHops = xffRaw
    ? xffRaw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
  const ua = request.headers.get("user-agent");
  const sourceIpRedacted = trustedSourceIp(request);

  const fingerprint = [
    opts.phase,
    request.method,
    ua ?? "",
    sourceIpRedacted ?? "",
    url.host,
  ].join("|");

  const prior = recentByFingerprint.get(fingerprint);
  const possibleRetryOfRequestId =
    prior && now - prior.atMs < RECENT_TTL_MS && prior.requestId !== requestId
      ? prior.requestId
      : null;

  recentByFingerprint.set(fingerprint, { atMs: now, requestId });

  const snapshot: DiscoveryRequestSourceSnapshot = {
    requestId,
    timestamp: new Date(now).toISOString(),
    method: request.method,
    host: request.headers.get("host") || url.host,
    phase: opts.phase,
    userAgent: ua,
    sourceIpRedacted,
    xForwardedFor: {
      present: Boolean(xffRaw?.trim()),
      hopCount: xffHops.length,
      firstHopRedacted: firstHop(xffRaw),
    },
    authorizationPassed: opts.authorizationPassed,
    inboundRequestIdHeader: inboundRequestId,
    possibleRetryOfRequestId,
  };

  console.info("[growth-discovery-source] start", {
    ...snapshot,
    note: "temporary source logging — no Authorization/CRON_SECRET",
  });

  return snapshot;
}

export function endDiscoveryRequestSourceLog(
  snapshot: DiscoveryRequestSourceSnapshot,
  opts: {
    discoveryRunId: string | null;
    discoveryError: string | null;
    startedAtMs: number;
  },
): void {
  const endedAt = Date.now();
  console.info("[growth-discovery-source] end", {
    timestamp: new Date(endedAt).toISOString(),
    requestId: snapshot.requestId,
    phase: snapshot.phase,
    authorizationPassed: snapshot.authorizationPassed,
    userAgent: snapshot.userAgent,
    sourceIpRedacted: snapshot.sourceIpRedacted,
    xForwardedFor: snapshot.xForwardedFor,
    host: snapshot.host,
    method: snapshot.method,
    growthDiscoveryRunId: opts.discoveryRunId,
    discoveryError: opts.discoveryError,
    possibleRetryOfRequestId: snapshot.possibleRetryOfRequestId,
    sameRequestRetried: Boolean(snapshot.possibleRetryOfRequestId),
    durationMs: endedAt - opts.startedAtMs,
    invocationStart: snapshot.timestamp,
    invocationEnd: new Date(endedAt).toISOString(),
  });
}
