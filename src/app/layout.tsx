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
import { absoluteUrl, buildWebSiteJsonLd, defaultSocialImageAbsoluteUrls, OPEN_MIC_PLATFORM_DESCRIPTION, siteOrigin } from "@/lib/publicSeo";
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
const siteTagline = "Open mic nights for performers & venues";
const defaultDescription = OPEN_MIC_PLATFORM_DESCRIPTION;
const defaultOgImageUrls = defaultSocialImageAbsoluteUrls();

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
    images: defaultOgImageUrls.map((url) => ({ url })),
  },
  twitter: {
    card: "summary_large_image",
    title: "MicStage",
    description: defaultDescription,
    images: defaultOgImageUrls,
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
    description: OPEN_MIC_PLATFORM_DESCRIPTION,
    url: absoluteUrl("/"),
    logo: absoluteUrl("/favicon.png"),
    image: defaultOgImageUrls[0] ?? absoluteUrl("/favicon.png"),
  };
  const siteJsonLd = buildWebSiteJsonLd();
  return (
    <html lang="en" className={`${heading.variable} ${body.variable} h-full antialiased`}>
      <head>
        <meta charSet="utf-8" />
        <meta name="google-adsense-account" content="ca-pub-9572509189594279" />
        <link rel="icon" href="/favicon.png" type="image/png" />
        <script
          async
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-9572509189594279"
          crossOrigin="anonymous"
        />
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

