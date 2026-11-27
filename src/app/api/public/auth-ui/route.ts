import { NextResponse } from "next/server";
import { getAuthUiState } from "@/lib/authUiState";
import { countUnreadThreads } from "@/lib/messaging/inboxQueries";
import { getPrismaOrNull } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Session-scoped chrome state for the public header/footer.
 * Must never be CDN-cached — always private/no-store.
 */
export async function GET() {
  const state = await getAuthUiState();
  let messageUnread = 0;
  if (state.role === "artist" || state.role === "venue") {
    const session = await getSession();
    const prisma = getPrismaOrNull();
    if (session && prisma && (session.kind === "musician" || session.kind === "venue")) {
      try {
        messageUnread = await countUnreadThreads(prisma, session);
      } catch {
        messageUnread = 0;
      }
    }
  }
  return NextResponse.json(
    { ...state, messageUnread },
    {
      headers: {
        "Cache-Control": "private, no-store, max-age=0, must-revalidate",
      },
    },
  );
}
