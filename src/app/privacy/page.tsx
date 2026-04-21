import type { Metadata } from "next";
import Link from "next/link";
import { LegalDocument } from "@/components/LegalDocument";
import { buildPublicMetadata } from "@/lib/publicSeo";

const updated = "April 14, 2026";

export const metadata: Metadata = buildPublicMetadata({
  title: "Privacy Policy",
  description:
    "How MicStage collects, uses, and protects account, booking, and analytics data for artists and venues.",
  path: "/privacy",
});

export default function PrivacyPage() {
  return (
    <LegalDocument title="Privacy Policy" updated={updated}>
      <p>
        MicStage (“we,” “us”) operates an online platform that helps open mic venues and artists coordinate schedules
        and bookings. This policy explains what information we handle and how we use it.
      </p>

      <h2>Information we collect</h2>
      <ul>
        <li>
          <strong>Account information.</strong> When you register or log in, we collect data you provide, such as email
          address, password (stored securely), and profile details you choose to add (for example, stage name for
          artists or venue and location information for venues). When you complete registration, we record the time and
          policy version associated with your acceptance of our Terms, Privacy Policy, and the content-use permissions
          described there, so we can demonstrate what was agreed for compliance and support.
        </li>
        <li>
          <strong>Booking and scheduling data.</strong> We store information needed to run the service: open mic
          schedules, slot reservations, artist names or labels you submit for a booking, optional notes, and related
          timestamps. Some artist or venue information may appear on public pages you or the venue make available.
        </li>
        <li>
          <strong>Technical data.</strong> Like most sites, our servers and partners may receive standard technical
          information (such as IP address, browser type, and approximate region) when you use MicStage.
        </li>
      </ul>

      <h2>How we use your information</h2>
      <ul>
        <li>To create and maintain your account and to authenticate you.</li>
        <li>
          To display schedules, process bookings, and show information you or venues choose to make public, including
          using submitted names, images, logos, and similar materials to operate and promote MicStage as outlined in our{" "}
          <Link className="text-[rgb(var(--om-neon))] underline hover:brightness-110" href="/terms">
            Terms of Service
          </Link>
          .
        </li>
        <li>To send service-related emails (for example, account verification, password resets, and important notices).</li>
        <li>To improve reliability, security, and product experience, including through aggregated analytics.</li>
        <li>To comply with law or protect rights and safety where required.</li>
      </ul>

      <h2>Email communications</h2>
      <p>
        We use your email for account and booking-related messages. We do not sell your email address. If we send
        product updates or marketing, we will do so in line with applicable law and your choices where required.
      </p>

      <h2>Analytics</h2>
      <p>
        We use analytics and advertising measurement tools to understand usage and improve discovery performance. This may
        include privacy-conscious product analytics, Google Analytics 4 event/page tracking, and Meta Pixel browser events
        for audience measurement and future retargeting readiness. These tools can use cookies or similar identifiers. We do
        not sell personal data, and we do not currently run a server-side Conversions API pipeline. You can disable optional
        client analytics where we provide an environment flag; server-side error reporting may still run to keep the service
        stable.
      </p>

      <h2>Sharing</h2>
      <p>
        We use trusted infrastructure providers (such as hosting, database, and email delivery) to operate MicStage.
        They process data only as needed to provide those services. We do not sell your personal information.
      </p>

      <h2>Retention</h2>
      <p>
        We keep information as long as your account is active or as needed to provide the service, comply with law,
        resolve disputes, and enforce our agreements. You may request deletion or correction of your account data by
        contacting us (see below), subject to legal and operational limits.
      </p>

      <h2>Security</h2>
      <p>
        We use reasonable technical and organizational measures to protect information. No method of transmission or
        storage is 100% secure.
      </p>

      <h2>Children</h2>
      <p>
        MicStage is not directed at children under 13, and we do not knowingly collect their personal information.
      </p>

      <h2>Changes</h2>
      <p>
        We may update this policy from time to time. We will post the updated version on this page and adjust the “Last
        updated” date above.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about this policy: use the{" "}
        <Link className="text-[rgb(var(--om-neon))] underline hover:brightness-110" href="/contact">
          contact form
        </Link>
        .
      </p>
    </LegalDocument>
  );
}
