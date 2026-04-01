import { isAdminSessionCookieValid } from "@/lib/adminAuth";
import { getPrismaOrNull } from "@/lib/prisma";
import { ARTIST_DASHBOARD_HREF } from "@/lib/safeRedirect";
import { getSession, type Session } from "@/lib/session";

export type AuthUiRole = "admin" | "venue" | "artist" | "public";

export type AuthUiState = {
  role: AuthUiRole;
  /** e.g. "You're on stage, {name}" — null for public/admin */
  signedInLine: string | null;
  /** Dashboard for artist/venue; null for public/admin */
  signedInHref: string | null;
};

function emailLocalPart(email: string | undefined): string {
  const t = email?.trim();
  if (!t) return "";
  const at = t.indexOf("@");
  return at > 0 ? t.slice(0, at) : t;
}

async function resolveArtistLine(session: Extract<Session, { kind: "musician" }>): Promise<{
  signedInLine: string;
  signedInHref: string;
}> {
  const prisma = getPrismaOrNull();
  if (!prisma) {
    const name = emailLocalPart(session.email) || "Artist";
    return {
      signedInLine: `You're on stage, ${name}`,
      signedInHref: ARTIST_DASHBOARD_HREF,
    };
  }
  try {
    const m = await prisma.musicianUser.findUnique({
      where: { id: session.musicianId },
      select: { stageName: true, firstName: true, lastName: true, email: true },
    });
    const legal = [m?.firstName, m?.lastName].filter(Boolean).join(" ").trim();
    const name =
      legal ||
      m?.stageName?.trim() ||
      emailLocalPart(m?.email ?? session.email) ||
      "Artist";
    return {
      signedInLine: `You're on stage, ${name}`,
      signedInHref: ARTIST_DASHBOARD_HREF,
    };
  } catch {
    const name = emailLocalPart(session.email) || "Artist";
    return {
      signedInLine: `You're on stage, ${name}`,
      signedInHref: ARTIST_DASHBOARD_HREF,
    };
  }
}

async function resolveVenueLine(session: Extract<Session, { kind: "venue" }>): Promise<{
  signedInLine: string;
  signedInHref: string;
}> {
  const prisma = getPrismaOrNull();
  if (!prisma) {
    const name = emailLocalPart(session.email) || "your venue";
    return {
      signedInLine: `You're running the room, ${name}`,
      signedInHref: "/venue",
    };
  }
  try {
    let venueName: string | null = null;
    if (session.venueOwnerId) {
      const v = await prisma.venue.findFirst({
        where: { ownerId: session.venueOwnerId },
        orderBy: { name: "asc" },
        select: { name: true },
      });
      venueName = v?.name ?? null;
    } else if (session.venueManagerId) {
      const row = await prisma.venueManagerAccess.findFirst({
        where: { managerId: session.venueManagerId },
        orderBy: { venue: { name: "asc" } },
        include: { venue: { select: { name: true } } },
      });
      venueName = row?.venue.name ?? null;
    }
    const name = venueName?.trim() || emailLocalPart(session.email) || "your venue";
    return {
      signedInLine: `You're running the room, ${name}`,
      signedInHref: "/venue",
    };
  } catch {
    const name = emailLocalPart(session.email) || "your venue";
    return {
      signedInLine: `You're running the room, ${name}`,
      signedInHref: "/venue",
    };
  }
}

/** Single source of truth for header/footer: one active role (admin wins over om_session). */
export async function getAuthUiState(): Promise<AuthUiState> {
  const [session, adminOk] = await Promise.all([getSession(), isAdminSessionCookieValid()]);
  if (adminOk) {
    return { role: "admin", signedInLine: null, signedInHref: null };
  }
  if (session?.kind === "venue") {
    const { signedInLine, signedInHref } = await resolveVenueLine(session);
    return { role: "venue", signedInLine, signedInHref };
  }
  if (session?.kind === "musician") {
    const { signedInLine, signedInHref } = await resolveArtistLine(session);
    return { role: "artist", signedInLine, signedInHref };
  }
  return { role: "public", signedInLine: null, signedInHref: null };
}
