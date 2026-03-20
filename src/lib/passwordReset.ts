import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/mailer";
import { PasswordResetAccountType } from "@/generated/prisma/enums";

const TOKEN_TTL_MINUTES = 30;

function appUrl() {
  return process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function createPasswordReset(input: {
  accountType: PasswordResetAccountType;
  email: string;
}): Promise<{ sent: boolean }> {
  const email = input.email.trim().toLowerCase();

  const exists =
    input.accountType === "VENUE"
      ? (await prisma.venueOwner.findUnique({ where: { email } })) ||
        (await prisma.venueManager.findUnique({ where: { email } }))
      : await prisma.musicianUser.findUnique({ where: { email } });

  // Do not reveal whether account exists.
  if (!exists) return { sent: true };

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
  const link = `${appUrl()}${path}`;

  await sendEmail({
    to: email,
    subject: "Reset your MicStage password",
    html: `<p>You requested a password reset.</p><p><a href="${link}">Reset password</a></p><p>This link expires in ${TOKEN_TTL_MINUTES} minutes.</p>`,
    text: `You requested a password reset.\n\nOpen this link: ${link}\n\nThis link expires in ${TOKEN_TTL_MINUTES} minutes.`,
  });

  return { sent: true };
}

export async function verifyResetToken(input: {
  token: string;
  accountType: PasswordResetAccountType;
}) {
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

  await prisma.$transaction(async (tx) => {
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
          return;
        }
      }
    } else {
      const user = await tx.musicianUser.findUnique({ where: { email: rec.email } });
      if (!user) return;
      await tx.musicianUser.update({
        where: { email: rec.email },
        data: { passwordHash: input.newPasswordHash },
      });
    }

    await tx.passwordResetToken.update({
      where: { id: rec.id },
      data: { usedAt: new Date() },
    });
  });

  return { ok: true as const };
}

