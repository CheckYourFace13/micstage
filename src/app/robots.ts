import type { MetadataRoute } from "next";

function baseUrl(): string {
  const raw = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://micstage.com";
  return raw.replace(/\/$/, "");
}

export default function robots(): MetadataRoute.Robots {
  const base = baseUrl();
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
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
