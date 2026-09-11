import { permanentRedirect } from "next/navigation";

/**
 * Exact `/hosts` (plural) is not a marketing page — public host profiles live at `/hosts/[slug]`.
 * Stale external links to `/hosts` permanently redirect to the Host marketing page `/host`.
 */
export default function HostsPluralRedirectPage() {
  permanentRedirect("/host");
}
