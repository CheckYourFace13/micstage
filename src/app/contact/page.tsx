import type { Metadata } from "next";
import Link from "next/link";
import { buildPublicMetadata } from "@/lib/publicSeo";
import { ContactForm } from "./ContactForm";

export const metadata: Metadata = buildPublicMetadata({
  title: "Contact & support",
  description:
    "Get help with your MicStage account, the platform, or bookings. Send a message to our team or contact the venue for room-specific questions.",
  path: "/contact",
});

export default function ContactPage() {
  return (
    <div className="min-h-dvh bg-black text-white">
      <main className="mx-auto max-w-2xl px-6 py-14 pb-24">
        <p className="text-xs font-medium uppercase tracking-widest text-white/50">MicStage</p>
        <h1 className="om-heading mt-2 text-4xl tracking-wide text-white">Contact &amp; support</h1>
        <p className="mt-3 text-sm leading-relaxed text-white/70">
          We are here for questions about using MicStage as a product. For on-the-night or venue-specific matters, your
          room is usually the best first stop.
        </p>

        <div className="mt-10 rounded-2xl border border-white/10 bg-white/5 p-6 sm:p-8">
          <h2 className="text-sm font-semibold text-white">Send us a message</h2>
          <p className="mt-2 text-sm text-white/70">
            Tell us how we can help. We will reply to the email address you provide.
          </p>
          <div className="mt-6">
            <ContactForm />
          </div>
        </div>

        <div className="mt-12 space-y-8 text-sm leading-relaxed text-white/80">
          <section>
            <h2 className="text-base font-semibold text-white">Contact MicStage for</h2>
            <ul className="mt-3 list-disc space-y-2 pl-5">
              <li>Account access, login, or registration issues</li>
              <li>Bugs, errors, or something not working on the website</li>
              <li>Privacy, data, or safety concerns related to the platform</li>
              <li>Feedback or partnership questions about MicStage itself</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-white">Contact the venue for</h2>
            <p className="mt-3 text-white/75">
              Open mics set their own house rules, schedules, and how cancellations work. MicStage does not run the room.
            </p>
            <ul className="mt-3 list-disc space-y-2 pl-5">
              <li>Whether you can book a specific slot, waitlists, or same-day changes</li>
              <li>Sound, lineup, cover charges, or on-site policies</li>
              <li>Cancellations or disputes about a particular show or reservation</li>
            </ul>
            <p className="mt-4 text-white/65">
              Browse the{" "}
              <Link className="text-[rgb(var(--om-neon))] underline hover:brightness-110" href="/venues">
                venue directory
              </Link>{" "}
              for every public room, see{" "}
              <Link className="text-[rgb(var(--om-neon))] underline hover:brightness-110" href="/locations">
                upcoming performers by market
              </Link>
              , or search{" "}
              <Link className="text-[rgb(var(--om-neon))] underline hover:brightness-110" href="/performers">
                artists by stage name
              </Link>
              . Each venue page may list website or social links when provided.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-white">Legal &amp; policies</h2>
            <p className="mt-3 text-white/75">
              See our{" "}
              <Link className="text-[rgb(var(--om-neon))] underline hover:brightness-110" href="/privacy">
                Privacy Policy
              </Link>{" "}
              and{" "}
              <Link className="text-[rgb(var(--om-neon))] underline hover:brightness-110" href="/terms">
                Terms of Service
              </Link>
              .
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
