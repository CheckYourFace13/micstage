import { permanentRedirect } from "next/navigation";

/** Legacy `/open-mics` index → discovery search. Listing detail stays at `/open-mics/[slug]`. */
export default function OpenMicsIndexRedirectPage() {
  permanentRedirect("/find-open-mics");
}
