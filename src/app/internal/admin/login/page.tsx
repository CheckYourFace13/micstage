import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { privateNoIndexMetadata } from "@/lib/privateSeo";
import { ADMIN_COOKIE_NAME, ADMIN_LOGIN_SUBMIT_PATH } from "@/lib/adminEdge";
import { adminSessionNodeToken, getAdminSecretOrNull } from "@/lib/adminAuth";
import { parseAdminEmailAllowlist } from "@/lib/adminAuthShared";

export const metadata: Metadata = {
  title: "Admin sign-in",
  robots: { ...privateNoIndexMetadata.robots },
};

export const dynamic = "force-dynamic";

export default async function AdminLoginPage(props: {
  searchParams: Promise<{ error?: string }>;
}) {
  try {
    const { error } = await props.searchParams;
    const secret = getAdminSecretOrNull();
    if (!secret) {
      return (
        <div className="min-h-dvh bg-zinc-950 p-8 text-zinc-100">
          <p className="text-sm text-amber-200/90">
            Admin is not configured (<code className="rounded bg-zinc-800 px-1">MICSTAGE_ADMIN_SECRET</code> missing).
          </p>
        </div>
      );
    }

    const jar = await cookies();
    const tok = jar.get(ADMIN_COOKIE_NAME)?.value;
    if (tok && tok === adminSessionNodeToken(secret)) {
      redirect("/internal/admin");
    }

    const allow = parseAdminEmailAllowlist();

    return (
      <div className="min-h-dvh bg-zinc-950 px-4 py-10 text-zinc-100">
        <main className="mx-auto max-w-md rounded-lg border border-zinc-700 bg-zinc-900 p-6 shadow-xl">
          <p className="text-xs font-semibold uppercase tracking-wider text-amber-200/80">MicStage internal</p>
          <h1 className="mt-2 text-xl font-semibold text-white">Admin sign-in</h1>
          <p className="mt-2 text-sm text-zinc-400">
            Operations back-office. Not indexed; requires shared secret
            {allow.length > 0 ? " and an allowlisted operator email." : "."}
          </p>

          {error === "secret" ? (
            <p className="mt-4 rounded border border-red-500/40 bg-red-950/40 px-3 py-2 text-sm text-red-100">
              Invalid secret.
            </p>
          ) : null}
          {error === "email" ? (
            <p className="mt-4 rounded border border-red-500/40 bg-red-950/40 px-3 py-2 text-sm text-red-100">
              Email not allowlisted for admin access.
            </p>
          ) : null}
          {error === "config" ? (
            <p className="mt-4 rounded border border-amber-500/40 bg-amber-950/40 px-3 py-2 text-sm text-amber-100">
              Admin secret missing on server.
            </p>
          ) : null}

          <form method="post" action={ADMIN_LOGIN_SUBMIT_PATH} className="mt-6 grid gap-3">
            <label className="grid gap-1 text-sm">
              <span className="text-zinc-300">Secret</span>
              <input
                name="secret"
                type="password"
                autoComplete="off"
                required
                className="rounded border border-zinc-600 bg-zinc-950 px-3 py-2 text-white"
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-zinc-300">
                Operator email {allow.length > 0 ? "(required)" : "(optional)"}
              </span>
              <input
                name="email"
                type="email"
                autoComplete="username"
                required={allow.length > 0}
                className="rounded border border-zinc-600 bg-zinc-950 px-3 py-2 text-white"
                placeholder={allow.length > 0 ? "you@company.com" : "Optional audit trail"}
              />
            </label>
            <button
              type="submit"
              className="mt-2 rounded bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-white"
            >
              Sign in
            </button>
          </form>

          <p className="mt-6 text-xs text-zinc-500">
            Session cookie uses path <code className="rounded bg-zinc-800 px-1">/</code>. You can also use{" "}
            <code className="rounded bg-zinc-800 px-1">?key=…&amp;email=…</code> on an admin URL once to set the session cookie.
          </p>
        </main>
      </div>
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[micstage:admin/login] render failed", msg, e instanceof Error ? e.stack : "");
    return (
      <div className="min-h-dvh bg-zinc-950 p-8 text-zinc-100">
        <h1 className="text-lg font-semibold text-white">Admin login unavailable</h1>
        <p className="mt-2 text-sm text-red-200/90">
          The login page crashed while rendering. Check server logs for{" "}
          <code className="rounded bg-zinc-800 px-1">[micstage:admin/login]</code>.
        </p>
        <p className="mt-2 font-mono text-xs text-zinc-500">{msg}</p>
      </div>
    );
  }
}
