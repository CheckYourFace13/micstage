import { headers } from "next/headers";
import { requirePrisma } from "@/lib/prisma";

function nowBucket(windowSec: number): string {
  return Math.floor(Date.now() / (windowSec * 1000)).toString();
}

function normalizeIdentifier(id: string): string {
  return id.trim().toLowerCase();
}

async function requesterIp(): Promise<string> {
  const h = await headers();
  const xfwd = h.get("x-forwarded-for");
  if (!xfwd) return "unknown";
  return xfwd.split(",")[0]?.trim() || "unknown";
}

export async function consumeRateLimit(input: {
  scope: string;
  identifier: string;
  limit: number;
  windowSec: number;
}): Promise<{ allowed: boolean; remaining: number }> {
  const ip = await requesterIp();
  const key = `${input.scope}:${normalizeIdentifier(input.identifier)}:${ip}`;
  const bucket = nowBucket(input.windowSec);

  const prisma = requirePrisma();
  const updated = await prisma.authRateLimitCounter.upsert({
    where: { key_bucket: { key, bucket } },
    update: { count: { increment: 1 } },
    create: { key, bucket, count: 1 },
  });

  const remaining = Math.max(0, input.limit - updated.count);
  return { allowed: updated.count <= input.limit, remaining };
}

