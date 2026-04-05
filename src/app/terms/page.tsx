import type { Metadata } from "next";
import Link from "next/link";
import { LegalDocument } from "@/components/LegalDocument";
import { buildPublicMetadata } from "@/lib/publicSeo";

const updated = "March 31, 2026";

export const metadata: Metadata = buildPublicMetadata({
  title: "Terms of Service",
  description:
    "Terms for using MicStage: accounts, bookings between artists and venues, acceptable use, and platform limitations.",
  path: "/terms",
});

export default function TermsPage() {
  return (
    <LegalDocument title="Terms of Service" updated={updated}>
      <p>
        These Terms of Service (“Terms”) govern your use of MicStage’s websites and services. By creating an account
        or using MicStage, you agree to these Terms.
      </p>

      <h2>The service</h2>
      <p>
        MicStage provides tools for open mic venues and artists to publish schedules, discover each other, and reserve
        time slots. We are a <strong>platform</strong>: bookings are arrangements between artists and venues (or their
        representatives). MicStage is not a party to your live performance, employment, or payment agreements unless we
        explicitly say otherwise in writing.
      </p>

      <h2>Accounts</h2>
      <ul>
        <li>You must provide accurate registration information and keep your credentials secure.</li>
        <li>You are responsible for activity under your account.</li>
        <li>We may suspend or terminate accounts that violate these Terms or put the service or others at risk.</li>
      </ul>

      <h2>Bookings and scheduling</h2>
      <ul>
        <li>Venues are responsible for accurate schedules, capacity, house rules, and on-site operations.</li>
        <li>
          Artists are responsible for honoring reservations they make, providing information the venue reasonably
          requests for the slot, and complying with venue rules and applicable law.
        </li>
        <li>
          Cancellations and changes should follow the venue’s stated process and any in-product rules. MicStage does
          not guarantee a particular outcome if a dispute arises between users.
        </li>
      </ul>

      <h2>Your responsibilities</h2>
      <ul>
        <li>Use MicStage lawfully and respectfully. No harassment, fraud, spam, or attempts to disrupt the service.</li>
        <li>
          Do not misrepresent your identity, venue, or eligibility. Do not scrape, overload, or reverse engineer the
          service except as allowed by law.
        </li>
        <li>
          Content you submit (for example, bios, names shown on public pages) must not infringe others’ rights or
          violate law.
        </li>
      </ul>

      <h2>Public information</h2>
      <p>
        Features may display information publicly (for example, venue pages, artist discovery, or metro/regional discovery
        listings). You choose what to publish within the product’s options; assume public-facing fields may be visible
        on the web or in search engines.
      </p>

      <h2>Intellectual property</h2>
      <p>
        MicStage and its branding, software, and content we create are owned by us or our licensors. You receive a
        limited, non-exclusive license to use the service as intended. You retain ownership of content and rights you
        already hold in materials you submit.
      </p>

      <h2>Your content and promotional use</h2>
      <p>
        You may upload or submit profile, venue, or booking-related materials—such as names, stage or venue branding,
        logos, photos or likeness, biographical text, links, and optional audio or music samples or clips you choose to
        provide. By submitting that material, you confirm you have the rights needed to share it on MicStage.
      </p>
      <p>
        You grant MicStage a worldwide, non-exclusive, royalty-free license to host, store, reproduce, display,
        distribute, and otherwise use those submitted materials to operate, improve, and promote the platform and
        MicStage’s products and community—including on the site, in email or in-app communications about the service,
        and in marketing or educational materials that reference MicStage (for example, showcasing how the platform
        works or highlighting public listings). Where reasonable, we will use good faith efforts to present your
        materials in a truthful, context-appropriate way. You may remove or update much of this content through the
        product; some copies may persist in backups or logs for a period as described in our{" "}
        <Link className="text-[rgb(var(--om-neon))] underline hover:brightness-110" href="/privacy">
          Privacy Policy
        </Link>
        .
      </p>
      <p>
        This license continues for as long as needed to provide the service and the uses above, subject to your
        account controls and applicable law. If you believe material on MicStage infringes your rights, contact us via
        the{" "}
        <Link className="text-[rgb(var(--om-neon))] underline hover:brightness-110" href="/contact">
          contact form
        </Link>
        .
      </p>

      <h2>Disclaimers</h2>
      <p>
        The service is provided <strong>“as is”</strong> to the fullest extent permitted by law. We do not warrant
        uninterrupted or error-free operation. We are not responsible for third-party venues, artists, audiences, or
        off-platform conduct.
      </p>

      <h2>Limitation of liability</h2>
      <p>
        To the maximum extent permitted by law, MicStage and its affiliates will not be liable for indirect, incidental,
        special, consequential, or punitive damages, or for lost profits, data, or goodwill, arising from your use of the
        service. Our total liability for claims relating to the service is limited to the greater of (a) the amounts you
        paid us for the service in the twelve months before the claim or (b) one hundred U.S. dollars (USD $100), except
        where law requires otherwise.
      </p>

      <h2>Changes</h2>
      <p>
        We may modify these Terms or the service. We will post updated Terms on this page and update the “Last updated”
        date. Continued use after changes become effective constitutes acceptance of the revised Terms where allowed by
        law.
      </p>

      <h2>Governing law</h2>
      <p>
        These Terms are governed by the laws of the United States and the State of Delaware, excluding conflict-of-law
        rules, unless a different governing law is required where you live.
      </p>

      <h2>Contact</h2>
      <p>
        For questions about these Terms, use the{" "}
        <Link className="text-[rgb(var(--om-neon))] underline hover:brightness-110" href="/contact">
          contact form
        </Link>
        .
      </p>
    </LegalDocument>
  );
}
