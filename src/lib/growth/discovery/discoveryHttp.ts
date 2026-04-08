import { growthDiscoveryHttpDelayMs } from "@/lib/growth/discovery/autonomousConfig";

const UA = "MicStageDiscovery/1.0 (+https://micstage.com)";

let lastFetchAt = 0;

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

export async function discoveryFetchText(url: string, opts?: { timeoutMs?: number }): Promise<string | null> {
  const timeoutMs = opts?.timeoutMs ?? 14_000;
  const delay = growthDiscoveryHttpDelayMs();
  const now = Date.now();
  const wait = Math.max(0, delay - (now - lastFetchAt));
  if (wait > 0) await sleep(wait);

  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: ac.signal,
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    lastFetchAt = Date.now();
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") ?? "";
    if (!/text\/html|application\/xhtml/i.test(ct) && !ct.includes("text/plain")) {
      return null;
    }
    const text = await res.text();
    return text.length > 2_500_000 ? text.slice(0, 2_500_000) : text;
  } catch {
    lastFetchAt = Date.now();
    return null;
  } finally {
    clearTimeout(t);
  }
}
