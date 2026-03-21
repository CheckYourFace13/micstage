import Link from "next/link";
import { legalContactEmail } from "@/lib/legalContact";

export function SiteFooter() {
  const email = legalContactEmail();

  return (
    <footer className="border-t border-white/10 bg-black">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 sm:flex-row sm:items-center sm:justify-between">
        <nav className="flex flex-wrap gap-x-5 gap-y-2 text-xs font-medium text-white/65" aria-label="Legal">
          <Link className="hover:text-white" href="/privacy">
            Privacy Policy
          </Link>
          <Link className="hover:text-white" href="/terms">
            Terms of Service
          </Link>
        </nav>
        <div className="text-xs text-white/45">
          <span>© {new Date().getFullYear()} MicStage</span>
          <span className="mx-2 text-white/25">·</span>
          <a className="underline hover:text-white/80" href={`mailto:${email}`}>
            {email}
          </a>
        </div>
      </div>
    </footer>
  );
}
