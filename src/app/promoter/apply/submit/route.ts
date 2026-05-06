import { NextResponse } from "next/server";
import { consumeRateLimit } from "@/lib/rateLimit";
import { getPrismaOrNull } from "@/lib/prisma";
import { absoluteServerRedirectUrl } from "@/lib/publicSeo";
import { createPromoterApplicationAndNotify } from "@/lib/promoterApplications";

function reqString(fd: FormData, key: string): string {
  const v = fd.get(key);
  if (typeof v !== "string") return "";
  return v.trim();
}

function cleanOptional(v: string): string | undefined {
  const t = v.trim();
  return t ? t : undefined;
}

function redirectTo(path: string): NextResponse {
  return NextResponse.redirect(absoluteServerRedirectUrl(path));
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return redirectTo("/promoter/apply?error=unavailable");
  }

  // Hidden anti-bot field.
  if (reqString(formData, "website")) {
    return redirectTo("/promoter/apply?ok=1");
  }

  const contactName = reqString(formData, "contactName");
  const email = reqString(formData, "email").toLowerCase();
  const cityRegion = cleanOptional(reqString(formData, "cityRegion"));
  const brandName = cleanOptional(reqString(formData, "brandName"));
  const socialUrl = cleanOptional(reqString(formData, "socialUrl"));
  const notes = cleanOptional(reqString(formData, "notes"));

  if (!contactName || !email || !EMAIL_RE.test(email) || contactName.length > 140 || email.length > 190) {
    return redirectTo("/promoter/apply?error=invalid");
  }

  const rl = await consumeRateLimit({
    scope: "promoter:apply",
    identifier: email,
    limit: 3,
    windowSec: 24 * 60 * 60,
  });
  if (!rl.allowed) return redirectTo("/promoter/apply?error=rate");

  const prisma = getPrismaOrNull();
  if (!prisma) {
    return redirectTo("/promoter/apply?error=unavailable");
  }

  try {
    await createPromoterApplicationAndNotify(prisma, {
      contactName,
      email,
      cityRegion,
      brandName,
      socialUrl,
      notes,
    });
    return redirectTo("/promoter/apply?ok=1");
  } catch (e) {
    console.error("[promoter apply] submit failed", e);
    return redirectTo("/promoter/apply?error=unavailable");
  }
}
