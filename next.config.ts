import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  /* config options here */
};

export default withSentryConfig(nextConfig, {
  silent: true,
  telemetry: false,
  webpack: {
    /** Skip webpack plugin / org+token requirement; runtime SDK still captures errors. */
    disableSentryConfig: true,
  },
});

