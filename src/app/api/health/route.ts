import { NextResponse } from "next/server";
import { getPrismaOrNull } from "@/lib/prisma";

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
};

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

  const prisma = getPrismaOrNull();
  if (!prisma) {
    return json(
      {
        status: "unhealthy",
        ok: false,
        timestamp,
        database: "unconfigured",
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
      },
      503,
    );
  }
}
