import type { MetadataRoute } from "next";
import { siteOrigin } from "@/lib/publicSeo";
import { marketingRobotsDisallowExtra } from "@/lib/marketing/indexability";

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
        ...marketingRobotsDisallowExtra(),
      ],
    },
    sitemap: `${base}/sitemap.xml`,
  };
}
