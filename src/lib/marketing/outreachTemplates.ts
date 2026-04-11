/**
 * Default cold-outreach copy for growth leads and venue marketing drafts.
 * Keep HTML/text bodies aligned; escape all interpolated names/URLs in HTML builders.
 */

import { resolveVenueOutreachSalutationParts } from "@/lib/marketing/venueOutreachGreeting";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export const GROWTH_VENUE_OUTREACH_SUBJECT = "A free, easier way to run your open mic";
export const GROWTH_ARTIST_OUTREACH_SUBJECT = "New free way to find open mics and get more opportunities";
export const GROWTH_PROMOTER_OUTREACH_SUBJECT = "MicStage is launching in Chicagoland";

const SIGN_OFF_TEXT = ["Thanks,", "Chris", "MicStage"].join("\n");
const SIGN_OFF_HTML = "<p>Thanks,<br />Chris<br />MicStage</p>";

function venueSalutationLines(venueName: string, contactEmail: string | null | undefined): { text: string; html: string } {
  const parts = resolveVenueOutreachSalutationParts(venueName, contactEmail);
  if (parts.kind === "neutral") {
    return { text: "Hey there,", html: "<p>Hey there,</p>" };
  }
  return {
    text: `Hi ${parts.label},`,
    html: `<p>Hi ${escapeHtml(parts.label)},</p>`,
  };
}

function venueCoreParagraphsText(claimVenueUrl?: string): string[] {
  const lines: string[] = [
    "We built MicStage to make open mic nights easier for venues, and it's completely free to use.",
    "It gives you a simple way to set up and manage your open mic, helps market it for free, and makes signups easier for artists too — including QR code signup options we provide so performers can join quickly.",
    "We're launching now, and you'd be one of the first venues on it.",
    "Getting started is simple:",
    "- create your free account",
    "- set up your open mic schedule",
    "- share your link or QR code",
    "- let MicStage help do the rest",
    "You can also require artists to be on-site before signing up if you want to confirm attendance first.",
  ];
  if (claimVenueUrl?.trim()) {
    lines.push("Get started here:", claimVenueUrl.trim());
  } else {
    lines.push("Get started here — reply to this email and I'll send you the venue signup link.");
  }
  lines.push("If you want, just reply and I can help get it set up.");
  return lines;
}

/** Plain text + HTML for venue-style outreach (growth VENUE leads + marketing venue cold drafts). */
export function buildVenueOutreachLetter(
  venueName: string,
  opts?: { claimVenueUrl?: string; contactEmail?: string | null },
): { textBody: string; htmlBody: string } {
  const claimVenueUrl = opts?.claimVenueUrl?.trim();
  const { text: salText, html: salHtml } = venueSalutationLines(venueName, opts?.contactEmail);
  const coreText = venueCoreParagraphsText(claimVenueUrl);
  const textBody = [salText, "", ...coreText, "", SIGN_OFF_TEXT].join("\n");

  const htmlCoreParas = [
    "We built MicStage to make open mic nights easier for venues, and it's completely free to use.",
    "It gives you a simple way to set up and manage your open mic, helps market it for free, and makes signups easier for artists too — including QR code signup options we provide so performers can join quickly.",
    "We're launching now, and you'd be one of the first venues on it.",
    "Getting started is simple:",
  ];
  const bullets = [
    "create your free account",
    "set up your open mic schedule",
    "share your link or QR code",
    "let MicStage help do the rest",
  ];
  const afterList = [
    "You can also require artists to be on-site before signing up if you want to confirm attendance first.",
  ];
  const ctaHtml = claimVenueUrl
    ? [
        "<p>Get started here:</p>",
        `<p><a href="${escapeHtml(claimVenueUrl)}">${escapeHtml(claimVenueUrl)}</a></p>`,
      ]
    : ["<p>Get started here — reply to this email and I'll send you the venue signup link.</p>"];
  const htmlBody = [
    salHtml,
    ...htmlCoreParas.map((p) => `<p>${escapeHtml(p)}</p>`),
    `<ul style="margin:0 0 1em 1.2em;padding:0;">${bullets.map((b) => `<li style="margin:0.25em 0;">${escapeHtml(b)}</li>`).join("")}</ul>`,
    ...afterList.map((p) => `<p>${escapeHtml(p)}</p>`),
    ...ctaHtml,
    "<p>If you want, just reply and I can help get it set up.</p>",
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
