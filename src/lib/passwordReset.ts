import crypto from "node:crypto";
import { requirePrisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/mailer";
import { PasswordResetAccountType } from "@/generated/prisma/client";

const TOKEN_TTL_MINUTES = 30;

function appUrl() {
  return process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

async function accountExistsForReset(accountType: PasswordResetAccountType, email: string): Promise<boolean> {
  const prisma = requirePrisma();
  if (accountType === "VENUE") {
    const owner = await prisma.venueOwner.findUnique({ where: { email } });
    if (owner) return true;
    const manager = await prisma.venueManager.findUnique({ where: { email } });
    return !!manager;
  }
  const user = await prisma.musicianUser.findUnique({ where: { email } });
  return !!user;
}

/** Creates DB row; returns raw token for URL. */
async function issuePasswordResetToken(input: {
  accountType: PasswordResetAccountType;
  email: string;
}): Promise<{ rawToken: string; path: string } | null> {
  const prisma = requirePrisma();
  const email = input.email.trim().toLowerCase();
  const exists = await accountExistsForReset(input.accountType, email);
  if (!exists) return null;

  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MINUTES * 60 * 1000);

  await prisma.passwordResetToken.create({
    data: {
      accountType: input.accountType,
      email,
      tokenHash,
      expiresAt,
    },
  });

  const path =
    input.accountType === "VENUE" ? `/reset/venue/${rawToken}` : `/reset/musician/${rawToken}`;
  return { rawToken, path };
}

export async function createPasswordReset(input: {
  accountType: PasswordResetAccountType;
  email: string;
}): Promise<{ sent: boolean }> {
  const email = input.email.trim().toLowerCase();
  const issued = await issuePasswordResetToken({ accountType: input.accountType, email });
  if (!issued) return { sent: true };

  const link = `${appUrl()}${issued.path}`;
  await sendEmail({
    to: email,
    subject: "Reset your MicStage password",
    html: `<p>You requested a password reset.</p><p><a href="${link}">Reset password</a></p><p>This link expires in ${TOKEN_TTL_MINUTES} minutes.</p>`,
    text: `You requested a password reset.\n\nOpen this link: ${link}\n\nThis link expires in ${TOKEN_TTL_MINUTES} minutes.`,
  });

  return { sent: true };
}

/** Internal admin: returns full URL or error (surfaces missing account). */
export async function createPasswordResetLinkForAdmin(input: {
  accountType: PasswordResetAccountType;
  email: string;
}): Promise<{ ok: true; link: string } | { ok: false; error: string }> {
  const email = input.email.trim().toLowerCase();
  const issued = await issuePasswordResetToken({ accountType: input.accountType, email });
  if (!issued) {
    return { ok: false, error: "No account found for that email and type (venue vs artist)." };
  }
  return { ok: true, link: `${appUrl()}${issued.path}` };
}

/** Internal admin: sends reset email and surfaces transport errors. */
export async function sendPasswordResetEmailForAdmin(input: {
  accountType: PasswordResetAccountType;
  email: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const email = input.email.trim().toLowerCase();
  const issued = await issuePasswordResetToken({ accountType: input.accountType, email });
  if (!issued) {
    return { ok: false, error: "No account found for that email and type (venue vs artist)." };
  }
  const link = `${appUrl()}${issued.path}`;
  try {
    await sendEmail({
      to: email,
      subject: "Reset your MicStage password",
      html: `<p>You requested a password reset.</p><p><a href="${link}">Reset password</a></p><p>This link expires in ${TOKEN_TTL_MINUTES} minutes.</p>`,
      text: `You requested a password reset.\n\nOpen this link: ${link}\n\nThis link expires in ${TOKEN_TTL_MINUTES} minutes.`,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Email send failed.";
    console.error("[passwordReset] admin send failed", { message });
    return { ok: false, error: message };
  }
  return { ok: true };
}

export async function verifyResetToken(input: {
  token: string;
  accountType: PasswordResetAccountType;
}) {
  const prisma = requirePrisma();
  const tokenHash = hashToken(input.token);
  const rec = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });
  if (!rec) return null;
  if (rec.accountType !== input.accountType) return null;
  if (rec.usedAt) return null;
  if (rec.expiresAt.getTime() < Date.now()) return null;
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
