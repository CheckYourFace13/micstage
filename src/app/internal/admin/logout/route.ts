import { NextResponse } from "next/server";
import {
  ADMIN_COOKIE_NAME,
  ADMIN_EMAIL_COOKIE_NAME,
  ADMIN_PATH_PREFIX,
} from "@/lib/adminEdge";

export async function GET(request: Request) {
  const u = new URL("/internal/admin/login", request.url);
  const res = NextResponse.redirect(u);
  res.cookies.set(ADMIN_COOKIE_NAME, "", {
    path: ADMIN_PATH_PREFIX,
    maxAge: 0,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  res.cookies.set(ADMIN_EMAIL_COOKIE_NAME, "", {
    path: ADMIN_PATH_PREFIX,
    maxAge: 0,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  return res;
}
