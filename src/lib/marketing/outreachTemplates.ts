/**
 * Default cold-outreach copy for growth leads and venue marketing drafts.
 * Keep HTML/text bodies aligned; escape all interpolated names/URLs in HTML builders.
 */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export const GROWTH_VENUE_OUTREACH_SUBJECT = "MicStage is launching — free help growing your open mic night";
export const GROWTH_ARTIST_OUTREACH_SUBJECT = "New free way to find open mics and get more opportunities";
export const GROWTH_PROMOTER_OUTREACH_SUBJECT = "MicStage is launching in Chicagoland";

const SIGN_OFF_TEXT = ["Thanks,", "Chris", "MicStage"].join("\n");
const SIGN_OFF_HTML = "<p>Thanks,<br />Chris<br />MicStage</p>";

function venueBodyParagraphs(venueName: string, claimVenueUrl?: string): string[] {
  const core: string[] = [
    "I'm reaching out because we're launching MicStage right now — a new, free platform focused on helping venues like yours grow real open mic nights (music, comedy, poetry, and mixed rooms).",
    "Here's what we want to do for you at no cost: help market your open mic, help you grow attendance for the night, and help performers discover your venue when they're looking for a stage in Chicagoland.",
    "MicStage is intentionally young — that means we're actively building it and we're willing to adapt the product so it's easier for venues to use day to day (scheduling, discovery, and how you show up to artists and guests).",
    "For venues, we focus on:",
    "- more visibility for your open mic night",
    "- more performers finding you and signing up",
    "- less friction growing and managing the night over time",
    `There is no fee to be listed or included — we would love to feature ${venueName} if it's a fit.`,
  ];
  if (claimVenueUrl?.trim()) {
    core.push(
      `The fastest next step is to create a free venue account (about a minute). That lets you claim your place, publish your open mic, and show up where performers search: ${claimVenueUrl.trim()}`,
      "If you prefer, just reply to this email and I can help you get set up manually.",
    );
  } else {
    core.push(
      "If you're open to it, reply and I'll send a link to create your free venue account — about a minute — or walk you through setup.",
    );
  }
  return core;
}

/** Plain text + HTML for venue-style outreach (growth VENUE leads + marketing venue cold drafts). */
export function buildVenueOutreachLetter(
  venueName: string,
  opts?: { claimVenueUrl?: string },
): { textBody: string; htmlBody: string } {
  const claimVenueUrl = opts?.claimVenueUrl?.trim();
  const textBody = [`Hi ${venueName},`, "", ...venueBodyParagraphs(venueName, claimVenueUrl), "", SIGN_OFF_TEXT].join("\n");

  const bullets = [
    "more visibility for your open mic night",
    "more performers finding your venue",
    "less friction growing and managing the night",
  ];
  const htmlParasBeforeList = [
    "I'm reaching out because we're launching MicStage right now — a new, free platform focused on helping venues like yours grow real open mic nights (music, comedy, poetry, and mixed rooms).",
    "Here's what we want to do for you at no cost: help market your open mic, help you grow attendance for the night, and help performers discover your venue when they're looking for a stage in Chicagoland.",
    "MicStage is intentionally young — that means we're actively building it and we're willing to adapt the product so it's easier for venues to use day to day (scheduling, discovery, and how you show up to artists and guests).",
    "For venues, we focus on:",
  ];
  const ctaBlock = claimVenueUrl
    ? [
        `<p>There is no fee to be listed or included — we would love to feature ${escapeHtml(venueName)} if it's a fit.</p>`,
        `<p>The fastest next step is to create a free venue account (about a minute). That lets you claim your place, publish your open mic, and show up where performers search:<br /><a href="${escapeHtml(claimVenueUrl)}">${escapeHtml(claimVenueUrl)}</a></p>`,
        `<p>If you prefer, just reply to this email and I can help you get set up manually.</p>`,
      ]
    : [
        `<p>There is no fee to be listed or included — we would love to feature ${escapeHtml(venueName)} if it's a fit.</p>`,
        `<p>If you're open to it, reply and I'll send a link to create your free venue account or walk you through setup.</p>`,
      ];
  const htmlBody = [
    `<p>Hi ${escapeHtml(venueName)},</p>`,
    ...htmlParasBeforeList.map((p) => `<p>${escapeHtml(p)}</p>`),
    `<ul>${bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join("")}</ul>`,
    ...ctaBlock,
    SIGN_OFF_HTML,
  ].join("");

  return { textBody, htmlBody };
}

function artistBodyParagraphs(): string[] {
  return [
    "We're launching MicStage, a new free platform to help musicians, comedians, and other performers find open mics more easily and get more visibility for what they do.",
    "The goal is not just to list venues, but to help market artists too — so performers can get discovered more easily, find more open mics, and create more chances for gigs and future opportunities.",
    "We're starting with Chicagoland and nearby suburbs, and since it's still new, we're actively improving it and open to feedback from performers as we grow.",
    "If you want, I can send you the link and a quick overview.",
  ];
}

export function buildArtistOutreachLetter(firstName: string): { textBody: string; htmlBody: string } {
  const textBody = [`Hi ${firstName},`, "", ...artistBodyParagraphs(), "", SIGN_OFF_TEXT].join("\n");
  const htmlBody = [
    `<p>Hi ${escapeHtml(firstName)},</p>`,
    ...artistBodyParagraphs().map((p) => `<p>${escapeHtml(p)}</p>`),
    SIGN_OFF_HTML,
  ].join("");
  return { textBody, htmlBody };
}

function promoterBodyParagraphs(): string[] {
  return [
    "We're launching MicStage, a new free platform built to help venues, performers, and open mic communities grow.",
    "We're starting in Chicagoland and working outward, and the goal is to help market open mic nights, artists, and local scenes more effectively so venues get more visibility and performers get more opportunities.",
    "Since we're just launching, we're also open to feedback and willing to make changes that help the local scene use it more easily.",
    "If you're open to it, I'd love to send over a quick overview.",
  ];
}

export function buildPromoterOutreachLetter(name: string): { textBody: string; htmlBody: string } {
  const textBody = [`Hi ${name},`, "", ...promoterBodyParagraphs(), "", SIGN_OFF_TEXT].join("\n");
  const htmlBody = [
    `<p>Hi ${escapeHtml(name)},</p>`,
    ...promoterBodyParagraphs().map((p) => `<p>${escapeHtml(p)}</p>`),
    SIGN_OFF_HTML,
  ].join("");
  return { textBody, htmlBody };
}

export const OUTREACH_DRAFT_FOOTER_TEXT = "MicStage draft — not sent";

/** Minimal HTML mirroring plain text (paragraphs + line breaks) for deliverability-friendly outreach. */
export function outreachPlainLeanHtml(plainBody: string): string {
  return plainBody
    .split(/\n\n+/)
    .map((block) => {
      const inner = escapeHtml(block).replace(/\n/g, "<br />");
      return `<p style="margin:0 0 1em 0;line-height:1.45;">${inner}</p>`;
    })
    .join("");
}
