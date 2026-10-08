import { permanentRedirect } from "next/navigation";

/** Legacy `/blog` → current editorial hub. */
export default function BlogRedirectPage() {
  permanentRedirect("/resources");
}
