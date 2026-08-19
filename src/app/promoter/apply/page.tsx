import { redirect } from "next/navigation";

/** Legacy application path — direct host signup replaces manual approval. */
export default function PromoterApplyRedirect() {
  redirect("/host");
}
