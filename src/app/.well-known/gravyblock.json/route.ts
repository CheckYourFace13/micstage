import { GRAVYBLOCK_BUSINESS_ID } from "@/lib/gravyblock-managed";

export const dynamic = "force-static";

/** Announces the GravyBlock connector so GravyBlock can attach this site to its account automatically. */
export function GET() {
  return Response.json({ connector: "gravyblock-managed", version: 1, businessId: GRAVYBLOCK_BUSINESS_ID });
}
