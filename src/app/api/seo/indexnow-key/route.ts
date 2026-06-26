import { indexNowApiKey } from "@/lib/seo/searchEnginePing";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Serves IndexNow verification at `/{INDEXNOW_API_KEY}.txt` via rewrite in next.config.ts */
export async function GET() {
  const key = indexNowApiKey();
  if (!key) {
    return new Response("IndexNow key not configured", { status: 404 });
  }
  return new Response(key, {
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}
