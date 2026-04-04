import { slugify } from "@/lib/slug";

/** Public location URL segment: city + optional region so duplicate city names do not collide. */
export function locationDirectorySlug(city: string, region: string | null | undefined): string {
  const c = (city ?? "").trim();
  const r = (region ?? "").trim();
  if (!c) return "";
  return r ? slugify(`${c} ${r}`) : slugify(c);
}
