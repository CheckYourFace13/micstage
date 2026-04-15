import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { unstable_rethrow } from "next/navigation";
import { getPrismaOrNull } from "@/lib/prisma";
import { consumeRateLimit } from "@/lib/rateLimit";
import { safeAfterAuthPath } from "@/lib/safeRedirect";
import { setSession } from "@/lib/session";

export const runtime = "nodejs";

function venueLoginQuery(code: string, nextField: string): string {
  const q = new URLSearchParams({ error: code });
  if (nextField) q.set("next", nextField);
  return `/login/venue?${q.toString()}`;
}

function redirectTo(request: Request, path: string) {
  return NextResponse.redirect(new URL(path, request.url));
}

export async function POST(request: Request) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return redirectTo(request, "/login/venue?error=invalid");
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
    return redirectTo(request, venueLoginQuery("invalid", nextField));
  }
  const email = emailRaw.trim().toLowerCase();
  const password = passwordRaw;

  const rl = await consumeRateLimit({
    scope: "login:venue",
    identifier: email,
    limit: 10,
    windowSec: 60 * 15,
  });
  if (!rl.allowed) return redirectTo(request, venueLoginQuery("rate", nextField));

  const prisma = getPrismaOrNull();
  if (!prisma) {
    console.error("[loginVenue] database not configured");
    return redirectTo(request, venueLoginQuery("unavailable", nextField));
  }

  let owner;
  try {
    owner = await prisma.venueOwner.findUnique({
      where: { email },
      select: { id: true, email: true, passwordHash: true },
    });
  } catch (e) {
    unstable_rethrow(e);
    console.error("[loginVenue] venueOwner findUnique", e);
    return redirectTo(request, venueLoginQuery("unavailable", nextField));
  }

  if (owner) {
    let ownerOk: boolean;
    try {
      ownerOk = await bcrypt.compare(password, owner.passwordHash);
    } catch (e) {
      unstable_rethrow(e);
      console.error("[loginVenue] bcrypt owner", e);
      return redirectTo(request, venueLoginQuery("unavailable", nextField));
    }
    if (ownerOk) {
      try {
        await setSession({ kind: "venue", venueOwnerId: owner.id, email: owner.email });
      } catch (e) {
        unstable_rethrow(e);
        console.error("[loginVenue] setSession owner", e);
        return redirectTo(request, venueLoginQuery("unavailable", nextField));
      }
      return redirectTo(request, safeAfterAuthPath(nextField, "/venue"));
    }
  }

  let manager;
  try {
    manager = await prisma.venueManager.findUnique({
      where: { email },
      select: { id: true, email: true, passwordHash: true },
    });
  } catch (e) {
    unstable_rethrow(e);
    console.error("[loginVenue] venueManager findUnique", e);
    return redirectTo(request, venueLoginQuery("unavailable", nextField));
  }

  if (manager) {
    let managerOk: boolean;
    try {
      managerOk = await bcrypt.compare(password, manager.passwordHash);
    } catch (e) {
      unstable_rethrow(e);
      console.error("[loginVenue] bcrypt manager", e);
      return redirectTo(request, venueLoginQuery("unavailable", nextField));
    }
    if (managerOk) {
      try {
        await setSession({ kind: "venue", venueManagerId: manager.id, email: manager.email });
      } catch (e) {
        unstable_rethrow(e);
        console.error("[loginVenue] setSession manager", e);
        return redirectTo(request, venueLoginQuery("unavailable", nextField));
      }
      return redirectTo(request, safeAfterAuthPath(nextField, "/venue"));
    }
  }

  return redirectTo(request, venueLoginQuery("invalid", nextField));
}

