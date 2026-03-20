import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const COOKIE_NAME = "om_session";

type VenueSession = {
  kind: "venue";
  venueOwnerId?: string;
  venueManagerId?: string;
  email: string;
};

type MusicianSession = {
  kind: "musician";
  musicianId: string;
  email: string;
};

export type Session = VenueSession | MusicianSession;

function getAuthSecret(): string {
  const fromEnv = process.env.AUTH_SECRET?.trim();
  if (fromEnv) return fromEnv;

  // Local dev: avoid crashing login when .env is missing AUTH_SECRET.
  // Production MUST set AUTH_SECRET (see .env.example).
  if (process.env.NODE_ENV === "development") {
    return "micstage-dev-only-auth-secret-change-me";
  }

  throw new Error(
    "Missing AUTH_SECRET. Add AUTH_SECRET to your environment (see .env.example).",
  );
}

function secretKey() {
  return new TextEncoder().encode(getAuthSecret());
}

export async function setSession(session: Session) {
  const token = await new SignJWT(session)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secretKey());

  const jar = await cookies();
  jar.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
}

export async function clearSession() {
  const jar = await cookies();
  jar.set(COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

export async function getSession(): Promise<Session | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (payload && typeof payload === "object" && typeof payload.kind === "string") {
      return payload as unknown as Session;
    }
    return null;
  } catch {
    return null;
  }
}

