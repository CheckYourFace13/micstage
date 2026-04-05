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

export const GROWTH_VENUE_OUTREACH_SUBJECT = "New free tool to help grow your open mic night";
export const GROWTH_ARTIST_OUTREACH_SUBJECT = "New free way to find open mics and get more opportunities";
export const GROWTH_PROMOTER_OUTREACH_SUBJECT = "MicStage is launching in Chicagoland";

const SIGN_OFF_TEXT = ["Thanks,", "Chris", "MicStage"].join("\n");
const SIGN_OFF_HTML = "<p>Thanks,<br />Chris<br />MicStage</p>";

function venueBodyParagraphs(venueName: string): string[] {
  return [
    "I'm reaching out because we're launching a new free platform called MicStage, built to help venues grow and organize open mic nights more easily.",
    "A big part of that is simple: we help market your open mic for free so more performers and potential guests can find it, while also making it easier to manage signups and build the night over time.",
    "MicStage is still a new project, so I also wanted to be upfront about that. The upside is that we're actively building it now, and we're very open to feedback and making changes that would make it easier and more useful for venues like yours.",
    "Our goal is to help venues:",
    "- get more visibility for their open mic nights",
    "- attract more performers and more interest",
    "- make the night easier to manage and grow",
    `There's no cost to be included, and we'd love to get ${venueName} added if it seems like a fit.`,
    "If you're open to it, I can send over a quick overview or help get your venue set up.",
  ];
}

/** Plain text + HTML for venue-style outreach (growth VENUE leads + marketing venue cold drafts). */
export function buildVenueOutreachLetter(venueName: string): { textBody: string; htmlBody: string } {
  const textBody = [`Hi ${venueName},`, "", ...venueBodyParagraphs(venueName), "", SIGN_OFF_TEXT].join("\n");

  const bullets = [
    "get more visibility for their open mic nights",
    "attract more performers and more interest",
    "make the night easier to manage and grow",
  ];
  const htmlParasBeforeList = [
    "I'm reaching out because we're launching a new free platform called MicStage, built to help venues grow and organize open mic nights more easily.",
    "A big part of that is simple: we help market your open mic for free so more performers and potential guests can find it, while also making it easier to manage signups and build the night over time.",
    "MicStage is still a new project, so I also wanted to be upfront about that. The upside is that we're actively building it now, and we're very open to feedback and making changes that would make it easier and more useful for venues like yours.",
    "Our goal is to help venues:",
  ];
  const htmlBody = [
    `<p>Hi ${escapeHtml(venueName)},</p>`,
    ...htmlParasBeforeList.map((p) => `<p>${escapeHtml(p)}</p>`),
    `<ul>${bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join("")}</ul>`,
    `<p>There's no cost to be included, and we'd love to get ${escapeHtml(venueName)} added if it seems like a fit.</p>`,
    `<p>If you're open to it, I can send over a quick overview or help get your venue set up.</p>`,
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
