-- Broad growth: ensure every known rollup discovery slug exists and all launch markets are ACTIVE.
-- Keeps outbound gating (`growthMarketAllowsOutboundSend`); only data changes.
-- Rollup slugs align with `ROLLUP_DISCOVERY_SLUGS` in `src/lib/discoveryMarket.ts` + default cron pair in `marketsConfig.ts`.

INSERT INTO "GrowthLaunchMarket" (
    "id",
    "createdAt",
    "updatedAt",
    "discoveryMarketSlug",
    "label",
    "regionDefault",
    "status",
    "sortOrder",
    "activatedAt",
    "pausedAt",
    "coldApprovalRelaxed",
    "autoExpansionEnabled"
)
VALUES
    (
        'growth_launch_seed_chicagoland',
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP,
        'chicagoland-il',
        'Chicagoland',
        'IL',
        'ACTIVE',
        0,
        CURRENT_TIMESTAMP,
        NULL,
        false,
        true
    ),
    (
        'growth_launch_seed_national_us',
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP,
        'national-discovery-us',
        'United States (discovery queue)',
        NULL,
        'ACTIVE',
        1,
        CURRENT_TIMESTAMP,
        NULL,
        false,
        true
    ),
    (
        'growth_launch_seed_central_il',
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP,
        'central-illinois-il',
        'Central Illinois',
        'IL',
        'ACTIVE',
        2,
        CURRENT_TIMESTAMP,
        NULL,
        false,
        true
    ),
    (
        'growth_launch_seed_il_regional',
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP,
        'illinois-regional',
        'Illinois (regional)',
        'IL',
        'ACTIVE',
        3,
        CURRENT_TIMESTAMP,
        NULL,
        false,
        true
    )
ON CONFLICT ("discoveryMarketSlug") DO UPDATE SET
    "status" = 'ACTIVE',
    "label" = EXCLUDED."label",
    "regionDefault" = COALESCE("GrowthLaunchMarket"."regionDefault", EXCLUDED."regionDefault"),
    "updatedAt" = CURRENT_TIMESTAMP,
    "activatedAt" = COALESCE("GrowthLaunchMarket"."activatedAt", EXCLUDED."activatedAt"),
    "pausedAt" = NULL;

-- Activate any additional admin-created launch markets (not in the rollup insert above).
UPDATE "GrowthLaunchMarket"
SET
    "status" = 'ACTIVE',
    "updatedAt" = CURRENT_TIMESTAMP,
    "activatedAt" = COALESCE("activatedAt", CURRENT_TIMESTAMP),
    "pausedAt" = NULL
WHERE "status" IS DISTINCT FROM 'ACTIVE'
   OR "pausedAt" IS NOT NULL;
