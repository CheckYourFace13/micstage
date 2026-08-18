/**
 * Separate DRAFT/PREVIEW representation from FINAL SEND representation.
 *
 * Internal-only labels (review banners, “not sent”, QA notes, email-meta dumps)
 * may appear in admin preview only. They must never be stored as the sendable
 * body, and the send pipeline strips them again as a last-line defense.
 */

/** Stored/admin-only banner. Never include this in a production send body. */
export const OUTREACH_DRAFT_FOOTER_TEXT = "MicStage draft — not sent";

const INTERNAL_LINE_PATTERNS: RegExp[] = [
  /micstage\s+draft\s*[—\-–]\s*not\s+sent/gi,
  /\[micstage_email_meta\][^\n<]*/gi,
  /\bqa\s+fixture\b[^\n<]*/gi,
  /\binternal\s+only\b[^\n<]*/gi,
  /\bdraft\s+preview\b[^\n<]*/gi,
  /\breview\s+notes?:\b[^\n<]*/gi,
  /\bdo\s+not\s+send\b[^\n<]*/gi,
];

const INTERNAL_HTML_BLOCKS: RegExp[] = [
  /<p[^>]*>\s*(?:<em>)?\s*MicStage draft\s*[—\-–]\s*not sent\s*(?:<\/em>)?\s*<\/p>/gi,
  /<em>\s*MicStage draft\s*[—\-–]\s*not sent\s*<\/em>/gi,
];

export function outreachBodyContainsInternalCopy(text: string): boolean {
  if (!text) return false;
  return INTERNAL_LINE_PATTERNS.some((re) => {
    re.lastIndex = 0;
    return re.test(text);
  });
}

function stripPatterns(input: string, patterns: RegExp[]): string {
  let out = input;
  for (const re of patterns) {
    out = out.replace(re, " ");
  }
  return out.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Remove internal-only copy from html + text. Safe to run on already-clean bodies. */
export function stripInternalOutreachCopy(input: { html: string; text: string }): { html: string; text: string } {
  return {
    html: stripPatterns(stripPatterns(input.html, INTERNAL_HTML_BLOCKS), INTERNAL_LINE_PATTERNS),
    text: stripPatterns(input.text, INTERNAL_LINE_PATTERNS),
  };
}

/**
 * Final send representation. Strips internal copy and refuses to send if any remains.
 */
export function finalizeOutreachSendBodies(input: { html: string; text: string }): {
  ok: true;
  html: string;
  text: string;
} | { ok: false; reason: string } {
  const stripped = stripInternalOutreachCopy(input);
  if (outreachBodyContainsInternalCopy(stripped.html) || outreachBodyContainsInternalCopy(stripped.text)) {
    return { ok: false, reason: "Internal-only draft copy remains in send body" };
  }
  if (!stripped.text.trim() && !stripped.html.trim()) {
    return { ok: false, reason: "Send body empty after removing internal draft copy" };
  }
  return { ok: true, html: stripped.html, text: stripped.text };
}

/** Admin/preview only — never persist the result as the sendable draft body. */
export function asOutreachDraftPreview(payload: {
  subject: string;
  textBody: string;
  htmlBody: string;
  tags?: string[];
}): { subject: string; textBody: string; htmlBody: string; tags?: string[] } {
  const banner = OUTREACH_DRAFT_FOOTER_TEXT;
  return {
    ...payload,
    textBody: `${payload.textBody}\n\n— ${banner}`,
    htmlBody: `${payload.htmlBody}<p><em>${banner}</em></p>`,
    tags: [...(payload.tags ?? []), "draft-preview"],
  };
}
