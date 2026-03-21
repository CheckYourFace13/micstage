import { NextResponse } from "next/server";
import { getPrismaOrNull } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Uptime / deploy checks. Does not expose secrets.
 * Use: GET /api/health
 */
export async function GET() {
  const prisma = getPrismaOrNull();
  if (!prisma) {
    return NextResponse.json(
      {
        ok: false,
        database: "unconfigured",
        timestamp: new Date().toISOString(),
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json(
      {
        ok: true,
        database: "up",
        timestamp: new Date().toISOString(),
      },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      {
        ok: false,
        database: "down",
        timestamp: new Date().toISOString(),
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
