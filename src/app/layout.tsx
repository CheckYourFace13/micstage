import type { Metadata } from "next";
import { Bebas_Neue, Inter } from "next/font/google";
import { SiteHeader } from "@/components/SiteHeader";
import { siteOrigin } from "@/lib/publicSeo";
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
const defaultDescription =
  "MicStage connects open mic venues and artists: bookable schedules, performer discovery, and public pages built for local marketing and search.";

export const metadata: Metadata = {
  metadataBase: new URL(origin),
  title: {
    default: "MicStage",
    template: "%s | MicStage",
  },
  description: defaultDescription,
  applicationName: "MicStage",
  openGraph: {
    siteName: "MicStage",
    type: "website",
    locale: "en_US",
    url: `${origin}/`,
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
  return (
    <html lang="en" className={`${heading.variable} ${body.variable} h-full antialiased`}>
      <body className="min-h-full bg-black font-[var(--font-body)] text-white">
        <SiteHeader />
        {children}
      </body>
    </html>
  );
}

