/**
 * Legacy: DB-backed unsubscribe token hash (optional). Live beta uses HMAC signing — see `unsubscribeSigning.ts`.
 */
import { createHash, randomBytes } from "node:crypto";
import type { PrismaClient } from "@/generated/prisma/client";

export function hashUnsubscribeToken(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

export function generateRawUnsubscribeToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Optional: pre-provision hash if you later switch to opaque tokens stored hashed-only. */
export async function provisionHashedUnsubscribeToken(prisma: PrismaClient, contactId: string): Promise<void> {
  const cur = await prisma.marketingContact.findUnique({
    where: { id: contactId },
    select: { unsubscribeTokenHash: true },
  });
  if (cur?.unsubscribeTokenHash) return;
  const raw = generateRawUnsubscribeToken();
  await prisma.marketingContact.update({
    where: { id: contactId },
    data: { unsubscribeTokenHash: hashUnsubscribeToken(raw) },
  });
}
