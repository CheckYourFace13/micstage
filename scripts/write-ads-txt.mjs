/**
 * Writes public/ads.txt from the MicStage AdSense publisher ID.
 * Keep ADSENSE_PUBLISHER_NUMERIC_ID in sync with src/lib/adsense.ts.
 */
import { writeFileSync } from "node:fs";

const ADSENSE_PUBLISHER_NUMERIC_ID = "9572509189594279";
const line = `google.com, pub-${ADSENSE_PUBLISHER_NUMERIC_ID}, DIRECT, f08c47fec0942fa0\n`;

writeFileSync("public/ads.txt", line, "utf8");
console.log("Wrote public/ads.txt");
