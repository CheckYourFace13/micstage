import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  experimental: {
    workerThreads: false,
    cpus: 1,
  },
  async redirects() {
    return [{ source: "/pricing", destination: "/faq#pricing-and-trust", permanent: true }];
  },
  async rewrites() {
    const key = process.env.INDEXNOW_API_KEY?.trim();
    if (!key) return [];
    return [{ source: `/${key}.txt`, destination: "/api/seo/indexnow-key" }];
  },
  /**
   * Explicit shared-cache hints for a few public assets Hostinger CDN can store.
   * Do not apply blanket Cache-Control to private app routes — Next route handlers
   * and auth pages keep private/no-store.
   */
  async headers() {
    return [
      {
        source: "/sitemap.xml",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
          },
        ],
      },
      {
        source: "/api/public/map/venues",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=0, s-maxage=300, stale-while-revalidate=86400",
          },
        ],
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  silent: true,
  telemetry: false,
  webpack: {
    /** Skip webpack plugin / org+token requirement; runtime SDK still captures errors. */
    disableSentryConfig: true,
  },
});

