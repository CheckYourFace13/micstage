import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Temporary: remove before shipping if you do not want env presence probe exposed.
 * Returns only a boolean — never the secret.
 */
export async function GET() {
  try {
    const raw = process.env.MICSTAGE_ADMIN_SECRET;
    const defined = Boolean(raw?.trim());
    if (process.env.MICSTAGE_ADMIN_DEBUG_LOG === "1") {
      console.info("[micstage:debug-admin-env]", {
        defined,
        hasUtf8Bom: raw != null && raw.charCodeAt(0) === 0xfeff,
      });
    }
    return NextResponse.json({ micstageAdminSecretDefined: defined });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[micstage:debug-admin-env] handler error", msg);
    return NextResponse.json({ error: "handler_exception", hint: msg }, { status: 500 });
  }
}
