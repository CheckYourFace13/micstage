import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Suspense } from "react";
import { Analytics } from "@vercel/analytics/next";
import { Bebas_Neue, Inter } from "next/font/google";
import { MarketingTrackingClient } from "@/components/MarketingTrackingClient";
import { MicStageProductAnalytics } from "@/components/MicStageProductAnalytics";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { isAnalyticsDisabled } from "@/lib/productAnalytics";
import { absoluteUrl, siteOrigin } from "@/lib/publicSeo";
import "./globals.css";

const heading = Bebas_Neue({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-heading",
});

const body = Inter({
  subsets: ["latin"],
  variable: "--font-body",
});

const origin = siteOrigin();
const siteTagline = "Find open mics · Book slots · Grow your room";
const defaultDescription =
  "MicStage helps you find local open mics and helps venues run bookable schedules, with public pages that make discovery and marketing easier for rooms and artists.";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  metadataBase: new URL(origin),
  title: {
    default: "MicStage",
    template: "%s | MicStage",
  },
  description: siteTagline,
  applicationName: "MicStage",
  icons: {
    icon: [{ url: "/favicon.png", type: "image/png" }],
  },
  openGraph: {
    siteName: "MicStage",
    type: "website",
    locale: "en_US",
    url: absoluteUrl("/"),
    title: "MicStage",
    description: defaultDescription,
  },
  twitter: {
    card: "summary_large_image",
    title: "MicStage",
    description: defaultDescription,
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const embed = (await headers()).get("x-micstage-embed") === "1";
  const orgJsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "MicStage",
    url: absoluteUrl("/"),
    logo: absoluteUrl("/favicon.png"),
  };
  const siteJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "MicStage",
    url: absoluteUrl("/"),
    potentialAction: {
      "@type": "SearchAction",
      target: `${absoluteUrl("/find-open-mics")}?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };
  return (
    <html lang="en" className={`${heading.variable} ${body.variable} h-full antialiased`}>
      <head>
        <link rel="icon" href="/favicon.png" type="image/png" />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(orgJsonLd) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(siteJsonLd) }} />
      </head>
      <body className="min-h-dvh overflow-x-hidden bg-black pb-[env(safe-area-inset-bottom)] font-[var(--font-body)] text-white">
        {!embed ? <SiteHeader /> : null}
        {children}
        {!embed ? <SiteFooter /> : null}
        {!isAnalyticsDisabled() ? <Analytics /> : null}
        {!isAnalyticsDisabled() ? (
          <Suspense fallback={null}>
            <MarketingTrackingClient />
          </Suspense>
        ) : null}
        {!isAnalyticsDisabled() ? (
          <Suspense fallback={null}>
            <MicStageProductAnalytics />
          </Suspense>
        ) : null}
      </body>
    </html>
  );
}

