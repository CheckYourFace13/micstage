import { NextResponse } from "next/server";
import {
  applyAdminLoginSessionCookiesToResponse,
  getAdminSecretOrNull,
  validateAdminLogin,
} from "@/lib/adminAuth";
import { absoluteServerRedirectUrl } from "@/lib/publicSeo";

/**
 * Admin sign-in via plain POST (not a Server Action). Cookies + `Location` are on one response so production is reliable
 * and we avoid Next.js’s post-action internal RSC `fetch` to the redirect URL (source of `failed to get redirect response`
 * noise when that fetch fails).
 */
export async function POST(request: Request) {
  const envSecret = getAdminSecretOrNull();
  const loginBase = absoluteServerRedirectUrl("/internal/admin/login");

  const redirectWithError = (code: "config" | "secret" | "email") => {
    const u = new URL(loginBase);
    u.searchParams.set("error", code);
    return NextResponse.redirect(u.toString());
  };

  if (!envSecret) {
    return redirectWithError("config");
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return redirectWithError("secret");
  }

  const secretInput = String(formData.get("secret") ?? "");
  const emailInput = String(formData.get("email") ?? "");
  const v = validateAdminLogin(secretInput, emailInput || null);
  if (v === "secret") return redirectWithError("secret");
  if (v === "email") return redirectWithError("email");

  const target = absoluteServerRedirectUrl("/internal/admin");
  const res = NextResponse.redirect(target);
  applyAdminLoginSessionCookiesToResponse(res, envSecret, emailInput.trim() || null);
  return res;
}
