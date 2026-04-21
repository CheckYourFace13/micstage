import Link from "next/link";
import { BetaNote } from "@/components/BetaNote";
import { getAuthUiState } from "@/lib/authUiState";

export async function SiteFooter() {
  const { role } = await getAuthUiState();
  const adminOk = role === "admin";

  return (
    <footer className="border-t border-white/10 bg-black">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-5">
        <BetaNote className="mb-5 max-w-xl border-l border-[rgba(var(--om-neon),0.22)] pl-3" />
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <nav className="flex flex-wrap gap-x-5 gap-y-2 text-xs font-medium text-white/65" aria-label="Site">
            <Link className="hover:text-white" href="/contact">
              Contact
            </Link>
            <Link className="hover:text-white" href="/resources">
              Open Mic Resources
            </Link>
            <Link className="hover:text-white" href="/privacy">
              Privacy Policy
            </Link>
            <Link className="hover:text-white" href="/terms">
              Terms of Service
            </Link>
            <Link className="hover:text-white" href="/media">
              Media
            </Link>
            {adminOk ? (
              <Link className="hover:text-white" href="/internal/admin">
                Admin
              </Link>
            ) : (
              <Link className="hover:text-white" href="/internal/admin/login">
                Admin login
              </Link>
            )}
          </nav>
          <div className="text-xs text-white/45">
            <span>© {new Date().getFullYear()} MicStage</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
