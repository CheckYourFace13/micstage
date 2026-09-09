import { NextResponse } from "next/server";
import { getPrismaOrNull } from "@/lib/prisma";
import { DEPLOY_COMMIT_SHORT } from "@/generated/deployCommit";

/** Always run fresh; safe for uptime probes. */
export const dynamic = "force-dynamic";

/** Prisma + pg adapter require Node (not Edge). */
export const runtime = "nodejs";

type HealthBody = {
  /** Stable string for monitors and humans */
  status: "healthy" | "unhealthy";
  /** Boolean alias for simple checks */
  ok: boolean;
  timestamp: string;
  /** Database probe result only — no host, URL, or errors */
  database: "up" | "down" | "unconfigured";
  /** Deployed Git short SHA (baked at build; optional env fallback) */
  deployCommit?: string;
};

function resolveDeployCommit(): string | undefined {
  const baked = DEPLOY_COMMIT_SHORT?.trim();
  if (baked) return baked.slice(0, 7);
  const fromEnv = process.env.DEPLOY_GIT_SHA?.trim();
  return fromEnv ? fromEnv.slice(0, 7) : undefined;
}

function json(body: HealthBody, status: number) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      Pragma: "no-cache",
    },
  });
}

/**
 * Production uptime / readiness probe.
 * GET /api/health
 *
 * - 200: app up and database responds to a trivial query.
 * - 503: DATABASE_URL missing, or database unreachable (no error details in body).
 */
export async function GET() {
  const timestamp = new Date().toISOString();
  const deployCommit = resolveDeployCommit();


  const prisma = getPrismaOrNull();
  if (!prisma) {
    return json(
      {
        status: "unhealthy",
        ok: false,
        timestamp,
        database: "unconfigured",
        ...(deployCommit ? { deployCommit } : {}),
      },
      503,
    );
  }

  try {
    await prisma.$queryRaw`SELECT 1`;
    return json(
      {
        status: "healthy",
        ok: true,
        timestamp,
        database: "up",
        ...(deployCommit ? { deployCommit } : {}),
      },
      200,
    );
  } catch {
    return json(
      {
        status: "unhealthy",
        ok: false,
        timestamp,
        database: "down",
        ...(deployCommit ? { deployCommit } : {}),
      },
      503,
    );
  }
}
