import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { unstable_rethrow } from "next/navigation";
import { getPrismaOrNull } from "@/lib/prisma";
import { consumeRateLimit } from "@/lib/rateLimit";
import { safeAfterMusicianLoginPath } from "@/lib/safeRedirect";
import { setSession } from "@/lib/session";
import { absoluteServerRedirectUrl } from "@/lib/publicSeo";

export const runtime = "nodejs";

function musicianLoginQuery(code: string, nextField: string): string {
  const q = new URLSearchParams({ error: code });
  if (nextField) q.set("next", nextField);
  return `/login/musician?${q.toString()}`;
}

function redirectTo(path: string) {
  return NextResponse.redirect(absoluteServerRedirectUrl(path));
}

export async function POST(request: Request) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return redirectTo("/login/musician?error=invalid");
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
    return redirectTo(musicianLoginQuery("invalid", nextField));
  }
  const email = emailRaw.trim().toLowerCase();
  const password = passwordRaw;

  const rl = await consumeRateLimit({
    scope: "login:musician",
    identifier: email,
    limit: 10,
    windowSec: 60 * 15,
  });
  if (!rl.allowed) return redirectTo(musicianLoginQuery("rate", nextField));

  const prisma = getPrismaOrNull();
  if (!prisma) {
    console.error("[loginMusician] database not configured");
    return redirectTo(musicianLoginQuery("unavailable", nextField));
  }

  let user;
  try {
    user = await prisma.musicianUser.findUnique({
      where: { email },
      select: { id: true, email: true, passwordHash: true },
    });
  } catch (e) {
    unstable_rethrow(e);
    console.error("[loginMusician] findUnique", e);
    return redirectTo(musicianLoginQuery("unavailable", nextField));
  }
  if (!user) return redirectTo(musicianLoginQuery("invalid", nextField));

  let passwordOk: boolean;
  try {
    passwordOk = await bcrypt.compare(password, user.passwordHash);
  } catch (e) {
    unstable_rethrow(e);
    console.error("[loginMusician] bcrypt", e);
    return redirectTo(musicianLoginQuery("unavailable", nextField));
  }
  if (!passwordOk) return redirectTo(musicianLoginQuery("invalid", nextField));

  try {
    await setSession({ kind: "musician", musicianId: user.id, email: user.email });
  } catch (e) {
    unstable_rethrow(e);
    console.error("[loginMusician] setSession", e);
    return redirectTo(musicianLoginQuery("unavailable", nextField));
  }

  return redirectTo(safeAfterMusicianLoginPath(nextField));
}

