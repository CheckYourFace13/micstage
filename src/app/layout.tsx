import type { Metadata } from "next";
import { Bebas_Neue, Inter } from "next/font/google";
import { SiteHeader } from "@/components/SiteHeader";
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

const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? "https://micstage.com";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "MicStage",
    template: "%s | MicStage",
  },
  description:
    "MicStage markets your venue and your artists: open mic scheduling, performer discovery, and SEO-ready pages built in.",
  applicationName: "MicStage",
  openGraph: {
    siteName: "MicStage",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
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

