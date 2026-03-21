import type { MetadataRoute } from "next";
import { siteOrigin } from "@/lib/publicSeo";

export default function robots(): MetadataRoute.Robots {
  const base = siteOrigin();
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/internal",
        "/artist",
        "/venue",
        "/dashboard",
        "/logout",
        "/api",
        "/login",
        "/register",
        "/reset",
      ],
    },
    sitemap: `${base}/sitemap.xml`,
  };
}
