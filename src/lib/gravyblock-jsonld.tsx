import { getManagedJsonLd } from "./gravyblock-managed";

/** Renders a signed GravyBlock structured-data override for this path. Renders nothing when there is none. */
export async function ManagedJsonLd({ path }: { path: string }) {
  const ld = await getManagedJsonLd(path);
  if (!ld) return null;
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, "\\u003c") }} />;
}