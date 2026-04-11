/**
 * Default cold-outreach copy for growth leads and venue marketing drafts.
 * Keep HTML/text bodies aligned; escape all interpolated names/URLs in HTML builders.
 */

import { resolveArtistOutreachSalutationParts } from "@/lib/marketing/artistOutreachGreeting";
import { resolveVenueOutreachSalutationParts } from "@/lib/marketing/venueOutreachGreeting";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export const GROWTH_VENUE_OUTREACH_SUBJECT = "A free, easier way to run your open mic";
export const GROWTH_ARTIST_OUTREACH_SUBJECT = "Be one of the first to use MicStage";
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

function artistSalutationLines(
  displayName: string,
  contactEmail: string | null | undefined,
): { text: string; html: string } {
  const parts = resolveArtistOutreachSalutationParts(displayName, contactEmail);
  if (parts.kind === "neutral") {
    return { text: "Hey there,", html: "<p>Hey there,</p>" };
  }
  return {
    text: `Hi ${parts.label},`,
    html: `<p>Hi ${escapeHtml(parts.label)},</p>`,
  };
}

function artistCoreParagraphsText(claimArtistUrl?: string): string[] {
  const lines: string[] = [
    "We just launched MicStage, a new free platform built to help artists find local open mics faster and sign up more easily.",
    "You'd be one of the first to use it — which means you can get in early, find nearby opportunities, and register for open mics before they fill up.",
    "It's simple:",
    "- create your free account",
    "- find local open mics",
    "- sign up quickly",
    "- keep up with new opportunities as they're added",
  ];
  if (claimArtistUrl?.trim()) {
    lines.push("Get started here:", claimArtistUrl.trim());
  } else {
    lines.push("Get started here — reply to this email and I'll send you the artist signup link.");
  }
  lines.push("If you want, just reply and I can help get you set up.");
  return lines;
}

export function buildArtistOutreachLetter(
  displayName: string,
  opts?: { contactEmail?: string | null; claimArtistUrl?: string },
): { textBody: string; htmlBody: string } {
  const claimArtistUrl = opts?.claimArtistUrl?.trim();
  const { text: salText, html: salHtml } = artistSalutationLines(displayName, opts?.contactEmail);
  const coreText = artistCoreParagraphsText(claimArtistUrl);
  const textBody = [salText, "", ...coreText, "", SIGN_OFF_TEXT].join("\n");

  const htmlCoreParas = [
    "We just launched MicStage, a new free platform built to help artists find local open mics faster and sign up more easily.",
    "You'd be one of the first to use it — which means you can get in early, find nearby opportunities, and register for open mics before they fill up.",
    "It's simple:",
  ];
  const bullets = [
    "create your free account",
    "find local open mics",
    "sign up quickly",
    "keep up with new opportunities as they're added",
  ];
  const ctaHtml = claimArtistUrl
    ? [
        "<p>Get started here:</p>",
        `<p><a href="${escapeHtml(claimArtistUrl)}">${escapeHtml(claimArtistUrl)}</a></p>`,
      ]
    : ["<p>Get started here — reply to this email and I'll send you the artist signup link.</p>"];
  const htmlBody = [
    salHtml,
    ...htmlCoreParas.map((p) => `<p>${escapeHtml(p)}</p>`),
    `<ul style="margin:0 0 1em 1.2em;padding:0;">${bullets.map((b) => `<li style="margin:0.25em 0;">${escapeHtml(b)}</li>`).join("")}</ul>`,
    ...ctaHtml,
    "<p>If you want, just reply and I can help get you set up.</p>",
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
