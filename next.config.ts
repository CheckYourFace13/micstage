import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  experimental: {
    workerThreads: false,
    cpus: 1,
  },
  async rewrites() {
    const key = process.env.INDEXNOW_API_KEY?.trim();
    if (!key) return [];
    return [{ source: `/${key}.txt`, destination: "/api/seo/indexnow-key" }];
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

