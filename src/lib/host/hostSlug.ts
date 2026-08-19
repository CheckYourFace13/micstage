const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function slugifyHostName(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "host"
  );
}

export function isValidHostSlug(slug: string): boolean {
  return SLUG_RE.test(slug) && slug.length <= 64;
}

export async function allocateUniqueHostSlug(
  baseName: string,
  isTaken: (slug: string) => Promise<boolean>,
): Promise<string> {
  const base = slugifyHostName(baseName);
  for (let attempt = 0; attempt < 12; attempt++) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
    if (!isValidHostSlug(candidate)) continue;
    if (!(await isTaken(candidate))) return candidate;
  }
  return `${base}-${Date.now().toString(36).slice(-6)}`;
}
