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
    "MicStage is a new project launching now. We built it to help venues run and grow open mic nights with less manual work.",
    "For your venue, this is free: we help market your open mic, help grow attendance for the night, and help performers discover your venue when they are actively looking for stages.",
    "We are willing to adapt the platform so it is easier for venues to use in real operations.",
    "After creating an account, the process is almost fully automated.",
    "For venues, the core steps are simple:",
    "- create your venue account",
    "- set up your open mic schedule",
    "- optionally require artists to be physically on premises before signup (to confirm attendance)",
    "- share your signup link on social media so performers can find and book",
    "MicStage then helps automate discovery and flow around your listing as much as possible.",
    `There is no cost to be included — we would love to feature ${venueName} if it's a fit.`,
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
    "create a free venue account",
    "set up your open mic schedule",
    "optionally require on-premises signups before artists can book",
    "share your signup link socially so performers discover your night",
  ];
  const htmlParasBeforeList = [
    "MicStage is a new project launching now. We built it to help venues run and grow open mic nights with less manual work.",
    "For your venue, this is free: we help market your open mic, help grow attendance for the night, and help performers discover your venue when they are actively looking for stages.",
    "We are willing to adapt the platform so it is easier for venues to use in real operations.",
    "After creating an account, the process is almost fully automated. For venues, the core setup is:",
  ];
  const ctaBlock = claimVenueUrl
    ? [
        `<p>There is no cost to be included — we would love to feature ${escapeHtml(venueName)} if it's a fit.</p>`,
        `<p>The fastest next step is to create a free venue account (about a minute). That lets you claim your place, publish your open mic, and show up where performers search:<br /><a href="${escapeHtml(claimVenueUrl)}">${escapeHtml(claimVenueUrl)}</a></p>`,
        "<p>You can also set your nights so performers must be physically on premises before signup if you want attendance confirmed first.</p>",
        "<p>If you prefer, just reply and I can help you get set up manually.</p>",
      ]
    : [
        `<p>There is no cost to be included — we would love to feature ${escapeHtml(venueName)} if it's a fit.</p>`,
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
