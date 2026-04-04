import type { Prisma } from "@/generated/prisma/client";
import type { MarketingJobKind, MarketingJobStatus } from "@/generated/prisma/client";
import type { PrismaClient } from "@/generated/prisma/client";

export type EnqueueMarketingJobInput = {
  kind: MarketingJobKind;
  venueId?: string | null;
  contactId?: string | null;
  discoveryMarketSlug?: string | null;
  payload?: Prisma.InputJsonValue;
  runAfter?: Date | null;
  idempotencyKey?: string | null;
  actorEmail?: string | null;
};

/**
 * Persist a queued job + audit event. Does not run workers or send anything.
 */
export async function enqueueMarketingJobWithAudit(
  prisma: PrismaClient,
  input: EnqueueMarketingJobInput,
): Promise<{ jobId: string; eventId: string }> {
  return prisma.$transaction(async (tx) => {
    const job = await tx.marketingJob.create({
      data: {
        kind: input.kind,
        status: "PENDING",
        venueId: input.venueId ?? undefined,
        contactId: input.contactId ?? undefined,
        discoveryMarketSlug: input.discoveryMarketSlug ?? undefined,
        payload: input.payload ?? undefined,
        runAfter: input.runAfter ?? undefined,
        idempotencyKey: input.idempotencyKey ?? undefined,
      },
    });
    const ev = await tx.marketingEvent.create({
      data: {
        type: "JOB_ENQUEUED",
        jobId: job.id,
        venueId: input.venueId ?? undefined,
        contactId: input.contactId ?? undefined,
        discoveryMarketSlug: input.discoveryMarketSlug ?? undefined,
        actorEmail: input.actorEmail ?? undefined,
        payload: { kind: input.kind } as Prisma.InputJsonValue,
      },
    });
    return { jobId: job.id, eventId: ev.id };
  });
}

/** Claim the next due job for a future worker (phase 1: unused in production paths). */
export async function claimNextPendingMarketingJob(prisma: PrismaClient) {
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const next = await tx.marketingJob.findFirst({
      where: {
        status: "PENDING",
        OR: [{ runAfter: null }, { runAfter: { lte: now } }],
      },
      orderBy: [{ createdAt: "asc" }],
    });
    if (!next) return null;
    return tx.marketingJob.update({
      where: { id: next.id },
      data: { status: "PROCESSING", attempts: { increment: 1 } },
    });
  });
}

export async function completeMarketingJob(
  prisma: PrismaClient,
  jobId: string,
  opts?: { actorEmail?: string | null },
) {
  await prisma.$transaction(async (tx) => {
    await tx.marketingJob.update({
      where: { id: jobId },
      data: { status: "SUCCEEDED", lastError: null },
    });
    await tx.marketingEvent.create({
      data: {
        type: "JOB_COMPLETED",
        jobId,
        actorEmail: opts?.actorEmail ?? undefined,
      },
    });
  });
}

export async function failMarketingJob(
  prisma: PrismaClient,
  jobId: string,
  message: string,
  opts?: { actorEmail?: string | null },
) {
  await prisma.$transaction(async (tx) => {
    await tx.marketingJob.update({
      where: { id: jobId },
      data: { status: "FAILED", lastError: message.slice(0, 4000) },
    });
    await tx.marketingEvent.create({
      data: {
        type: "JOB_FAILED",
        jobId,
        actorEmail: opts?.actorEmail ?? undefined,
        payload: { message: message.slice(0, 500) } as Prisma.InputJsonValue,
      },
    });
  });
}

export function isTerminalMarketingJobStatus(s: MarketingJobStatus): boolean {
  return s === "SUCCEEDED" || s === "FAILED" || s === "CANCELLED";
}
