import { permanentRedirect } from "next/navigation";

/** Short city alias → canonical Chicagoland open-mics discovery page. */
export default function ChicagoAliasRedirectPage() {
  permanentRedirect("/locations/chicago-il/open-mics");
}
