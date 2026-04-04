import { marketingPhysicalAddressFooter } from "@/lib/marketing/emailConfig";

export function appendCommercialEmailFooter(input: {
  html: string;
  text: string;
  unsubscribeUrl: string;
}): { html: string; text: string } {
  const addr = marketingPhysicalAddressFooter();
  const textFooter = [
    "",
    "---",
    `Unsubscribe: ${input.unsubscribeUrl}`,
    "",
    addr,
  ].join("\n");

  const htmlFooter = `
<hr style="border:none;border-top:1px solid #333;margin:24px 0" />
<p style="font-size:12px;color:#666;line-height:1.5">
  <a href="${escapeAttr(input.unsubscribeUrl)}">Unsubscribe from MicStage marketing emails</a>
</p>
<p style="font-size:11px;color:#888;white-space:pre-line">${escapeHtml(addr)}</p>`;

  return {
    text: `${input.text}${textFooter}`,
    html: `${input.html}${htmlFooter}`,
  };
}

export function appendTransactionalFooter(input: { html: string; text: string }): { html: string; text: string } {
  const addr = marketingPhysicalAddressFooter();
  const textFooter = ["", "---", addr].join("\n");
  const htmlFooter = `<hr style="border:none;border-top:1px solid #333;margin:24px 0" /><p style="font-size:11px;color:#888;white-space:pre-line">${escapeHtml(addr)}</p>`;
  return {
    text: `${input.text}${textFooter}`,
    html: `${input.html}${htmlFooter}`,
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/'/g, "&#39;");
}

export function buildListUnsubscribeHeaders(unsubscribeHttpsUrl: string, mailto?: string): Record<string, string> {
  const parts = [`<${unsubscribeHttpsUrl}>`];
  if (mailto) {
    const m = mailto.startsWith("mailto:") ? mailto : `mailto:${mailto}`;
    parts.push(`<${m}>`);
  }
  return {
    "List-Unsubscribe": parts.join(", "),
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}
