import crypto from "node:crypto";
import { requirePrisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/mailer";
import { publicOriginForOutboundEmail } from "@/lib/publicSeo";
import { PasswordResetAccountType } from "@/generated/prisma/client";

/** Self-service forgot-password / claim setup: short-lived. */
export const PASSWORD_RESET_TTL_MINUTES = 120;

/** Admin/support recovery: long enough for a delayed inbox click. */
export const SUPPORT_PASSWORD_RESET_TTL_MINUTES = 24 * 60;

export function passwordResetExpiryLabel(ttlMinutes: number): string {
  if (ttlMinutes > 0 && ttlMinutes % 60 === 0) {
    const hours = ttlMinutes / 60;
    return hours === 1 ? "1 hour" : `${hours} hours`;
  }
  return `${ttlMinutes} minutes`;
}

export const ALL_PASSWORD_RESET_ACCOUNT_TYPES: PasswordResetAccountType[] = [
  "VENUE",
  "PROMOTER",
  "MUSICIAN",
];

export function publicPasswordResetOrigin(): string {
  return publicOriginForOutboundEmail().replace(/\/$/, "");
}

export function passwordResetPathForType(accountType: PasswordResetAccountType): string {
  if (accountType === "VENUE") return "/reset/venue";
  if (accountType === "PROMOTER") return "/reset/promoter";
  return "/reset/musician";
}

export function passwordResetRoleLabel(accountType: PasswordResetAccountType): string {
  if (accountType === "VENUE") return "venue";
  if (accountType === "PROMOTER") return "host";
  return "performer";
}

export function isPasswordResetTokenUsable(
  rec: {
    accountType: PasswordResetAccountType;
    usedAt: Date | null;
    expiresAt: Date;
  },
  expectedType: PasswordResetAccountType,
  nowMs: number = Date.now(),
): boolean {
  if (rec.accountType !== expectedType) return false;
  if (rec.usedAt) return false;
  if (rec.expiresAt.getTime() < nowMs) return false;
  return true;
}

/**
 * Public forms always send for every matching role so a venue-login "forgot password"
 * still works for a performer or host on the same email. Admin can pin a type.
 */
export function selectResetAccountTypes(opts: {
  found: PasswordResetAccountType[];
  preferred?: PasswordResetAccountType | null;
  fallbackToAnyType: boolean;
}): PasswordResetAccountType[] {
  const found = ALL_PASSWORD_RESET_ACCOUNT_TYPES.filter((t) => opts.found.includes(t));
  if (found.length === 0) return [];
  if (opts.preferred && found.includes(opts.preferred) && !opts.fallbackToAnyType) {
    return [opts.preferred];
  }
  return found;
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function passwordResetEmailContent(
  links: Array<{ accountType: PasswordResetAccountType; link: string }>,
  opts?: { ttlMinutes?: number },
): {
  subject: string;
  html: string;
  text: string;
} {
  const ttlMinutes = opts?.ttlMinutes ?? PASSWORD_RESET_TTL_MINUTES;
  const expiry = passwordResetExpiryLabel(ttlMinutes);
  const subject = "MicStage password reset";
  const linkLinesText = links.map((row) => {
    const label = passwordResetRoleLabel(row.accountType);
    return `Reset your ${label} password: ${row.link}`;
  });
  const linkLinesHtml = links.map((row) => {
    const label = passwordResetRoleLabel(row.accountType);
    return `<p><a href="${row.link}">Reset your ${label} password</a></p>`;
  });
  const html = [
    "<p>Hi,</p>",
    "<p>We received a request to reset your MicStage password.</p>",
    ...linkLinesHtml,
    `<p>Each link expires in ${expiry}.</p>`,
    "<p>If you did not request this, you can ignore this email.</p>",
    "<p>Thanks,<br />MicStage</p>",
  ].join("");
  const text = [
    "Hi,",
    "",
    "We received a request to reset your MicStage password.",
    "",
    ...linkLinesText,
    "",
    `Each link expires in ${expiry}.`,
    "",
    "If you did not request this, you can ignore this email.",
    "",
    "Thanks,",
    "MicStage",
  ].join("\n");
  return { subject, html, text };
}

export async function findAccountTypesForEmail(email: string): Promise<PasswordResetAccountType[]> {
  const prisma = requirePrisma();
  const normalized = email.trim().toLowerCase();
  const found: PasswordResetAccountType[] = [];

  const [owner, manager, promoter, musician] = await Promise.all([
    prisma.venueOwner.findUnique({ where: { email: normalized }, select: { id: true } }),
    prisma.venueManager.findUnique({ where: { email: normalized }, select: { id: true } }),
    prisma.promoterUser.findUnique({ where: { email: normalized }, select: { id: true } }),
    prisma.musicianUser.findUnique({ where: { email: normalized }, select: { id: true } }),
  ]);
  if (owner || manager) found.push("VENUE");
  if (promoter) found.push("PROMOTER");
  if (musician) found.push("MUSICIAN");
  return found;
}

async function accountExistsForReset(accountType: PasswordResetAccountType, email: string): Promise<boolean> {
  const found = await findAccountTypesForEmail(email);
  return found.includes(accountType);
}

/** Expire unused prior tokens for the same email + role so only the newest link works. */
async function supersedeUnusedResetTokens(input: {
  accountType: PasswordResetAccountType;
  email: string;
}): Promise<number> {
  const prisma = requirePrisma();
  const now = new Date();
  const res = await prisma.passwordResetToken.updateMany({
    where: {
      email: input.email,
      accountType: input.accountType,
      usedAt: null,
      expiresAt: { gt: now },
    },
    data: { expiresAt: now },
  });
  return res.count;
}

/** Creates DB row; returns raw token for URL. */
async function issuePasswordResetToken(input: {
  accountType: PasswordResetAccountType;
  email: string;
  ttlMinutes: number;
}): Promise<{ rawToken: string; path: string } | null> {
  const prisma = requirePrisma();
  const email = input.email.trim().toLowerCase();
  const exists = await accountExistsForReset(input.accountType, email);
  if (!exists) return null;

  await supersedeUnusedResetTokens({ accountType: input.accountType, email });

  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + input.ttlMinutes * 60 * 1000);

  await prisma.passwordResetToken.create({
    data: {
      accountType: input.accountType,
      email,
      tokenHash,
      expiresAt,
    },
  });

  const path = `${passwordResetPathForType(input.accountType)}/${rawToken}`;
  return { rawToken, path };
}

async function issueLinksForTypes(
  email: string,
  types: PasswordResetAccountType[],
  ttlMinutes: number,
): Promise<Array<{ accountType: PasswordResetAccountType; link: string }>> {
  const origin = publicPasswordResetOrigin();
  const links: Array<{ accountType: PasswordResetAccountType; link: string }> = [];
  for (const accountType of types) {
    const issued = await issuePasswordResetToken({ accountType, email, ttlMinutes });
    if (!issued) continue;
    links.push({ accountType, link: `${origin}${issued.path}` });
  }
  return links;
}

async function sendResetLinks(
  email: string,
  links: Array<{ accountType: PasswordResetAccountType; link: string }>,
  ttlMinutes: number,
) {
  const content = passwordResetEmailContent(links, { ttlMinutes });
  await sendEmail({
    to: email,
    subject: content.subject,
    html: content.html,
    text: content.text,
  });
}

export async function createPasswordReset(input: {
  accountType?: PasswordResetAccountType;
  email: string;
  fallbackToAnyType?: boolean;
}): Promise<{ sent: boolean; types: PasswordResetAccountType[] }> {
  const email = input.email.trim().toLowerCase();
  const found = await findAccountTypesForEmail(email);
  const types = selectResetAccountTypes({
    found,
    preferred: input.accountType ?? null,
    fallbackToAnyType: input.fallbackToAnyType !== false,
  });
  if (types.length === 0) return { sent: true, types: [] };

  const links = await issueLinksForTypes(email, types, PASSWORD_RESET_TTL_MINUTES);
  if (links.length === 0) return { sent: true, types: [] };
  await sendResetLinks(email, links, PASSWORD_RESET_TTL_MINUTES);
  return { sent: true, types: links.map((l) => l.accountType) };
}

/** Internal admin: returns full URL(s) or error (surfaces missing account). Never returns hashes. */
export async function createPasswordResetLinkForAdmin(input: {
  accountType?: PasswordResetAccountType | null;
  email: string;
}): Promise<{ ok: true; link: string; types: PasswordResetAccountType[] } | { ok: false; error: string }> {
  const email = input.email.trim().toLowerCase();
  const found = await findAccountTypesForEmail(email);
  const types = selectResetAccountTypes({
    found,
    preferred: input.accountType ?? null,
    fallbackToAnyType: !input.accountType,
  });
  if (types.length === 0) {
    return {
      ok: false,
      error: "No MicStage account found for that email.",
    };
  }
  const links = await issueLinksForTypes(email, types, SUPPORT_PASSWORD_RESET_TTL_MINUTES);
  if (links.length === 0) {
    return { ok: false, error: "Could not issue a reset token for that account." };
  }
  return { ok: true, link: links.map((l) => l.link).join("\n"), types: links.map((l) => l.accountType) };
}

/** Internal admin: sends a secure reset email. Auto-detects role when type is omitted. */
export async function sendPasswordResetEmailForAdmin(input: {
  accountType?: PasswordResetAccountType | null;
  email: string;
}): Promise<{ ok: true; types: PasswordResetAccountType[] } | { ok: false; error: string }> {
  const email = input.email.trim().toLowerCase();
  const found = await findAccountTypesForEmail(email);
  const types = selectResetAccountTypes({
    found,
    preferred: input.accountType ?? null,
    fallbackToAnyType: !input.accountType,
  });
  if (types.length === 0) {
    return { ok: false, error: "No MicStage account found for that email." };
  }
  const links = await issueLinksForTypes(email, types, SUPPORT_PASSWORD_RESET_TTL_MINUTES);
  if (links.length === 0) {
    return { ok: false, error: "Could not issue a reset token for that account." };
  }
  try {
    await sendResetLinks(email, links, SUPPORT_PASSWORD_RESET_TTL_MINUTES);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Email send failed.";
    console.error("[passwordReset] admin send failed", { message });
    return { ok: false, error: message };
  }
  return { ok: true, types: links.map((l) => l.accountType) };
}

export async function verifyResetToken(input: {
  token: string;
  accountType: PasswordResetAccountType;
}) {
  const prisma = requirePrisma();
  const tokenHash = hashToken(input.token);
  const rec = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });
  if (!rec) return null;
  if (!isPasswordResetTokenUsable(rec, input.accountType)) return null;
  return rec;
}

export async function consumeResetToken(input: {
  token: string;
  accountType: PasswordResetAccountType;
  newPasswordHash: string;
}) {
  const rec = await verifyResetToken({ token: input.token, accountType: input.accountType });
  if (!rec) return { ok: false as const };

  const prisma = requirePrisma();
  const changed = await prisma.$transaction(async (tx) => {
    if (input.accountType === "VENUE") {
      const owner = await tx.venueOwner.findUnique({ where: { email: rec.email } });
      if (owner) {
        await tx.venueOwner.update({
          where: { email: rec.email },
          data: { passwordHash: input.newPasswordHash },
        });
      } else {
        const manager = await tx.venueManager.findUnique({ where: { email: rec.email } });
        if (manager) {
          await tx.venueManager.update({
            where: { email: rec.email },
            data: { passwordHash: input.newPasswordHash },
          });
        } else {
          return false;
        }
      }
    } else if (input.accountType === "PROMOTER") {
      const promoter = await tx.promoterUser.findUnique({ where: { email: rec.email } });
      if (!promoter) return false;
      await tx.promoterUser.update({
        where: { email: rec.email },
        data: { passwordHash: input.newPasswordHash },
      });
    } else {
      const user = await tx.musicianUser.findUnique({ where: { email: rec.email } });
      if (!user) return false;
      await tx.musicianUser.update({
        where: { email: rec.email },
        data: { passwordHash: input.newPasswordHash },
      });
    }

    await tx.passwordResetToken.update({
      where: { id: rec.id },
      data: { usedAt: new Date() },
    });

    return true;
  });

  if (!changed) return { ok: false as const };
  return { ok: true as const };
}
