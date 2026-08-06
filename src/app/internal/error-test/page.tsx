import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Nonproduction-only route to verify global-error / error boundaries.
 * Enable with MICSTAGE_ENABLE_ERROR_TEST_ROUTE=1. Never enable in production.
 */
export default function InternalErrorTestPage() {
  if (process.env.MICSTAGE_ENABLE_ERROR_TEST_ROUTE !== "1") {
    notFound();
  }
  if (process.env.NODE_ENV === "production" && process.env.MICSTAGE_ALLOW_PROD_ERROR_TEST !== "1") {
    notFound();
  }
  throw new Error("micstage-internal-error-test");
}
