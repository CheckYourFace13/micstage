import type { Metadata } from "next";
import { Suspense } from "react";
import { Analytics } from "@vercel/analytics/next";
import { Bebas_Neue, Inter } from "next/font/google";
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
const siteTagline = "Artists to music to marketing";
const defaultDescription =
  "MicStage connects open mic venues and artists—bookable slots, artist discovery, and public venue pages built for local SEO and sharing.";

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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
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
      target: `${absoluteUrl("/locations")}?q={search_term_string}`,
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
      <body className="min-h-full bg-black font-[var(--font-body)] text-white">
        <SiteHeader />
        {children}
        <SiteFooter />
        {!isAnalyticsDisabled() ? <Analytics /> : null}
        {!isAnalyticsDisabled() ? (
          <Suspense fallback={null}>
            <MicStageProductAnalytics />
          </Suspense>
        ) : null}
      </body>
    </html>
  );
}

