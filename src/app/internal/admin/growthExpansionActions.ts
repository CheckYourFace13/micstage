"use server";

import { assertAdminSession } from "@/lib/adminAuth";
import { evaluateAndActivateNextQueuedMarket } from "@/lib/growth/expansionHealth";
import { requirePrisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

function q(base: string, key: string, val: string) {
  return `${base}?${key}=${encodeURIComponent(val)}`;
}

function normalizeSlug(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, "-");
}

export async function addQueuedGrowthLaunchMarketAction(formData: FormData) {
  await assertAdminSession();
  const prisma = requirePrisma();
  const slug = normalizeSlug(String(formData.get("discoveryMarketSlug") ?? ""));
  const label = String(formData.get("label") ?? "").trim();
  const regionDefault = String(formData.get("regionDefault") ?? "").trim() || null;
  if (!slug || !label) redirect(q("/internal/admin/growth/expansion", "err", "slugLabel"));

  const maxRow = await prisma.growthLaunchMarket.aggregate({ _max: { sortOrder: true } });
  const sortOrder = (maxRow._max.sortOrder ?? -1) + 1;

  try {
    await prisma.growthLaunchMarket.create({
      data: {
        discoveryMarketSlug: slug,
        label,
        regionDefault,
        status: "QUEUED",
        sortOrder,
        coldApprovalRelaxed: false,
        autoExpansionEnabled: true,
      },
    });
  } catch {
    redirect(q("/internal/admin/growth/expansion", "err", "dupSlug"));
  }

  revalidatePath("/internal/admin/growth/expansion");
  redirect(q("/internal/admin/growth/expansion", "ok", "queued"));
}

export async function duplicateGrowthLaunchFromTemplateAction(formData: FormData) {
  await assertAdminSession();
  const prisma = requirePrisma();
  const templateSlug = normalizeSlug(String(formData.get("templateSlug") ?? "chicagoland-il"));
  const newSlug = normalizeSlug(String(formData.get("newDiscoveryMarketSlug") ?? ""));
  const label = String(formData.get("label") ?? "").trim();
  const regionDefault = String(formData.get("regionDefault") ?? "").trim() || null;
  if (!newSlug || !label) redirect(q("/internal/admin/growth/expansion", "err", "dupFields"));

  const template = await prisma.growthLaunchMarket.findFirst({
    where: { discoveryMarketSlug: { equals: templateSlug, mode: "insensitive" } },
  });

  const maxRow = await prisma.growthLaunchMarket.aggregate({ _max: { sortOrder: true } });
  const sortOrder = (maxRow._max.sortOrder ?? -1) + 1;

  try {
    await prisma.growthLaunchMarket.create({
      data: {
        discoveryMarketSlug: newSlug,
        label,
        regionDefault: regionDefault ?? template?.regionDefault,
        status: "QUEUED",
        sortOrder,
        coldApprovalRelaxed: false,
        autoExpansionEnabled: template?.autoExpansionEnabled ?? true,
        notes: template ? `Cloned queue defaults from ${template.discoveryMarketSlug}` : null,
      },
    });
  } catch {
    redirect(q("/internal/admin/growth/expansion", "err", "dupSlug"));
  }

  revalidatePath("/internal/admin/growth/expansion");
  redirect(q("/internal/admin/growth/expansion", "ok", "duplicated"));
}

export async function setGrowthLaunchMarketStatusAction(formData: FormData) {
  await assertAdminSession();
  const prisma = requirePrisma();
  const id = String(formData.get("id") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim() as "ACTIVE" | "QUEUED" | "PAUSED";
  if (!id || !["ACTIVE", "QUEUED", "PAUSED"].includes(status)) {
    redirect(q("/internal/admin/growth/expansion", "err", "badStatus"));
  }

  const now = new Date();
  await prisma.growthLaunchMarket.update({
    where: { id },
    data: {
      status,
      ...(status === "ACTIVE" ? { activatedAt: now, pausedAt: null } : {}),
      ...(status === "PAUSED" ? { pausedAt: now } : {}),
      ...(status === "QUEUED" ? { pausedAt: null } : {}),
    },
  });

  revalidatePath("/internal/admin/growth/expansion");
  redirect(q("/internal/admin/growth/expansion", "ok", "status"));
}

export async function toggleGrowthLaunchColdRelaxAction(formData: FormData) {
  await assertAdminSession();
  const prisma = requirePrisma();
  const id = String(formData.get("id") ?? "").trim();
  const next = String(formData.get("next") ?? "") === "true";
  if (!id) redirect(q("/internal/admin/growth/expansion", "err", "noId"));

  await prisma.growthLaunchMarket.update({
    where: { id },
    data: { coldApprovalRelaxed: next },
  });

  revalidatePath("/internal/admin/growth/expansion");
  redirect(q("/internal/admin/growth/expansion", "ok", "relax"));
}

export async function toggleGrowthLaunchAutoExpansionAction(formData: FormData) {
  await assertAdminSession();
  const prisma = requirePrisma();
  const id = String(formData.get("id") ?? "").trim();
  const next = String(formData.get("next") ?? "") === "true";
  if (!id) redirect(q("/internal/admin/growth/expansion", "err", "noId"));

  await prisma.growthLaunchMarket.update({
    where: { id },
    data: { autoExpansionEnabled: next },
  });

  revalidatePath("/internal/admin/growth/expansion");
  redirect(q("/internal/admin/growth/expansion", "ok", "autoexp"));
}

export async function setGrowthLaunchSortOrderAction(formData: FormData) {
  await assertAdminSession();
  const prisma = requirePrisma();
  const id = String(formData.get("id") ?? "").trim();
  const sortOrderRaw = String(formData.get("sortOrder") ?? "").trim();
  if (!id) redirect(q("/internal/admin/growth/expansion", "err", "noId"));
  const sortOrder = Number.parseInt(sortOrderRaw, 10);
  if (!Number.isFinite(sortOrder)) redirect(q("/internal/admin/growth/expansion", "err", "badOrder"));

  await prisma.growthLaunchMarket.update({
    where: { id },
    data: { sortOrder },
  });

  revalidatePath("/internal/admin/growth/expansion");
  redirect(q("/internal/admin/growth/expansion", "ok", "order"));
}

/** Admin-only: runs the same evaluator as cron but ignores GROWTH_AUTO_EXPANSION_ENABLED. */
export async function runGrowthExpansionCheckNowAction() {
  await assertAdminSession();
  const prisma = requirePrisma();
  const result = await evaluateAndActivateNextQueuedMarket(prisma, { bypassCronEnvGate: true });
  revalidatePath("/internal/admin/growth/expansion");
  if (result.didActivate) {
    redirect(`/internal/admin/growth/expansion?activated=${encodeURIComponent(result.activatedSlug)}`);
  }
  redirect(`/internal/admin/growth/expansion?info=${encodeURIComponent(result.message.slice(0, 400))}`);
}
