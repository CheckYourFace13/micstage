import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { unstable_rethrow } from "next/navigation";
import { getPrismaOrNull } from "@/lib/prisma";
import { consumeRateLimit } from "@/lib/rateLimit";
import { PROMOTER_DASHBOARD_HREF, safeAfterAuthPath } from "@/lib/safeRedirect";
import { setSession } from "@/lib/session";
import { absoluteServerRedirectUrl } from "@/lib/publicSeo";

export const runtime = "nodejs";

function promoterLoginQuery(code: string, nextField: string): string {
  const q = new URLSearchParams({ error: code });
  if (nextField) q.set("next", nextField);
  return `/login/promoter?${q.toString()}`;
}

function redirectTo(path: string) {
  return NextResponse.redirect(absoluteServerRedirectUrl(path));
}

export async function POST(request: Request) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return redirectTo("/login/promoter?error=invalid");
  }

  const nextEntry = formData.get("next");
  const nextField = (typeof nextEntry === "string" ? nextEntry : "").trim();

  const emailRaw = formData.get("email");
  const passwordRaw = formData.get("password");
  if (
    typeof emailRaw !== "string" ||
    !emailRaw.trim() ||
    typeof passwordRaw !== "string" ||
    !passwordRaw.trim()
  ) {
    return redirectTo(promoterLoginQuery("invalid", nextField));
  }
  const email = emailRaw.trim().toLowerCase();
  const password = passwordRaw;

  const rl = await consumeRateLimit({
    scope: "login:promoter",
    identifier: email,
    limit: 10,
    windowSec: 60 * 15,
  });
  if (!rl.allowed) return redirectTo(promoterLoginQuery("rate", nextField));

  const prisma = getPrismaOrNull();
  if (!prisma) {
    console.error("[loginPromoter] database not configured");
    return redirectTo(promoterLoginQuery("unavailable", nextField));
  }

  let user;
  try {
    user = await prisma.promoterUser.findUnique({
      where: { email },
      select: { id: true, email: true, passwordHash: true },
    });
  } catch (e) {
    unstable_rethrow(e);
    console.error("[loginPromoter] findUnique", e);
    return redirectTo(promoterLoginQuery("unavailable", nextField));
  }
  if (!user) return redirectTo(promoterLoginQuery("invalid", nextField));

  let passwordOk: boolean;
  try {
    passwordOk = await bcrypt.compare(password, user.passwordHash);
  } catch (e) {
    unstable_rethrow(e);
    console.error("[loginPromoter] bcrypt", e);
    return redirectTo(promoterLoginQuery("unavailable", nextField));
  }
  if (!passwordOk) return redirectTo(promoterLoginQuery("invalid", nextField));

  try {
    await setSession({ kind: "promoter", promoterId: user.id, email: user.email });
  } catch (e) {
    unstable_rethrow(e);
    console.error("[loginPromoter] setSession", e);
    return redirectTo(promoterLoginQuery("unavailable", nextField));
  }

  return redirectTo(safeAfterAuthPath(nextField, PROMOTER_DASHBOARD_HREF));
}
