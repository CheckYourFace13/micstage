"use client";

import { useState } from "react";
import { importClaudeGrowthLeadsCsvAction } from "@/app/internal/admin/growthActions";
import { LEAD_UPLOAD_CSV_HEADERS, parseClaudeGrowthLeadCsv } from "@/lib/growth/csvImport";

export function ClaudeGrowthCsvImportPanel() {
  const [previewLabel, setPreviewLabel] = useState<string | null>(null);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<string[][]>([]);

  return (
    <div className="mt-3 space-y-3">
      <form action={importClaudeGrowthLeadsCsvAction} encType="multipart/form-data" className="space-y-3">
        <div className="flex flex-wrap items-end gap-2">
          <label className="grid gap-1 text-xs">
            <span className="text-zinc-500">Lead spreadsheet (.csv)</span>
            <input
              name="leadCsvFile"
              type="file"
              accept=".csv,text/csv"
              required
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) {
                  setPreviewLabel(null);
                  setPreviewRows([]);
                  setParseErrors([]);
                  return;
                }
                const text = await f.text();
                const { rows, errors } = parseClaudeGrowthLeadCsv(text);
                setParseErrors(errors);
                setPreviewLabel(`${f.name} — ${rows.length} data row(s), showing first 6`);
                const head = rows.slice(0, 6).map((r) => [
                  r.name,
                  r.leadType,
                  r.discoveryMarketSlug ?? "",
                  r.city ?? "",
                  r.suburb ?? "",
                  r.contactEmail ?? "",
                  r.additionalContactEmails.join("; "),
                  r.contactUrl ?? "",
                ]);
                setPreviewRows(head);
              }}
              className="text-sm text-zinc-300 file:mr-2 file:rounded file:border-0 file:bg-zinc-700 file:px-2 file:py-1 file:text-white"
            />
          </label>
          <button
            type="submit"
            className="rounded-md bg-teal-700 px-3 py-2 text-sm font-medium text-white hover:bg-teal-600"
          >
            Import Lead CSV
          </button>
        </div>
        <p className="text-[11px] leading-relaxed text-zinc-500">
          Headers (exact names, case-insensitive):{" "}
          <code className="text-zinc-400">{LEAD_UPLOAD_CSV_HEADERS.join(", ")}</code>. Rows are deduped against
          existing growth leads and marketing contacts; venue rows use the same contact + path automation as other
          imports. Sends still obey daily caps, domain caps, cooldowns, and suppression — unchanged.
        </p>
      </form>

      {parseErrors.length ? (
        <div className="rounded border border-amber-700/40 bg-amber-950/25 px-2 py-2">
          <p className="text-xs font-medium text-amber-200">Parse warnings / row errors</p>
          <ul className="mt-1 max-h-32 space-y-0.5 overflow-y-auto font-mono text-[11px] text-amber-100/90">
            {parseErrors.slice(0, 24).map((err) => (
              <li key={err}>{err}</li>
            ))}
            {parseErrors.length > 24 ? <li>…</li> : null}
          </ul>
        </div>
      ) : null}

      {previewLabel && previewRows.length > 0 ? (
        <div>
          <p className="text-xs text-zinc-400">{previewLabel}</p>
          <div className="mt-2 overflow-x-auto rounded border border-zinc-800">
            <table className="w-full min-w-[720px] text-left text-[11px] text-zinc-300">
              <thead>
                <tr className="border-b border-zinc-800 bg-black/30 text-zinc-500">
                  <th className="px-2 py-1.5">name</th>
                  <th className="px-2 py-1.5">leadType</th>
                  <th className="px-2 py-1.5">market</th>
                  <th className="px-2 py-1.5">city</th>
                  <th className="px-2 py-1.5">suburb</th>
                  <th className="px-2 py-1.5">contactEmail</th>
                  <th className="px-2 py-1.5">additional</th>
                  <th className="px-2 py-1.5">contactUrl</th>
                </tr>
              </thead>
              <tbody>
                {previewRows.map((cells, i) => (
                  <tr key={i} className="border-b border-zinc-800/80">
                    {cells.map((c, j) => (
                      <td key={j} className="max-w-[140px] truncate px-2 py-1.5 font-mono text-zinc-400" title={c}>
                        {c}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : previewLabel ? (
        <p className="text-xs text-zinc-500">No data rows after the header (check commas / quoting).</p>
      ) : null}
    </div>
  );
}
