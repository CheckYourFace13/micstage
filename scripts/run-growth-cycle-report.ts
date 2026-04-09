import { requirePrisma } from "../src/lib/prisma";
import { runGrowthLeadDiscovery } from "../src/lib/growth/growthDiscoveryRun";
import { runAutoGrowthOutreachDrafts } from "../src/lib/growth/growthDraftAutomation";

async function main() {
  const prisma = requirePrisma();
  const discovery = await runGrowthLeadDiscovery(prisma);
  const draftRun = await runAutoGrowthOutreachDrafts(prisma);
  const out = {
    discovery: {
      candidates_by_source: discovery.candidates_by_source,
      drafts_created_by_source: discovery.drafts_created_by_source,
      sent_by_source: discovery.sent_by_source,
      serpapi_calls_today: discovery.serpapi_calls_today,
      serpapi_calls_month: discovery.serpapi_calls_month,
      serpapi_disabled_until: discovery.serpapi_disabled_until,
      serpapi_reason: discovery.serpapi_reason,
      search_provider_status: discovery.search_provider_status,
    },
    draftRun,
  };
  console.log(JSON.stringify(out, null, 2));
}

void main();
