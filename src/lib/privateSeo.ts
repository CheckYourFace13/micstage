import type { Metadata } from "next";

/** Use on authenticated, auth, or token pages so HTML meta aligns with robots.txt disallow rules. */
export const privateNoIndexMetadata = {
  robots: {
    index: false,
    follow: false,
    googleBot: { index: false, follow: false },
  },
} satisfies Pick<Metadata, "robots">;
