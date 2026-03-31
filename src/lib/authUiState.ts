import { isAdminSessionCookieValid } from "@/lib/adminAuth";
import { getSession } from "@/lib/session";

export type AuthUiRole = "admin" | "venue" | "artist" | "public";

/** Single source of truth for header/footer: one active role (admin wins over om_session). */
export async function getAuthUiState(): Promise<{ role: AuthUiRole }> {
  const [session, adminOk] = await Promise.all([getSession(), isAdminSessionCookieValid()]);
  if (adminOk) return { role: "admin" };
  if (session?.kind === "venue") return { role: "venue" };
  if (session?.kind === "musician") return { role: "artist" };
  return { role: "public" };
}
