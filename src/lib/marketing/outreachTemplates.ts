/**
 * Default cold-outreach copy for growth leads and venue marketing drafts.
 * Keep HTML/text bodies aligned; escape all interpolated names/URLs in HTML builders.
 */

import type { GrowthLeadType } from "@/generated/prisma/client";
import { resolveArtistOutreachSalutationParts } from "@/lib/marketing/artistOutreachGreeting";
import { resolveVenueOutreachSalutationParts } from "@/lib/marketing/venueOutreachGreeting";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Step 1 cold intro subjects (growth + venue marketing payload). Steps 2–3 use {@link growthOutreachSubject}. */
export const GROWTH_VENUE_OUTREACH_SUBJECT = "MicStage — an easier way to run your open mic";
export const GROWTH_ARTIST_OUTREACH_SUBJECT = "MicStage — find and sign up for nearby open mics";
export const GROWTH_PROMOTER_OUTREACH_SUBJECT = "MicStage — tools for venues and open mic nights";

export type GrowthOutreachSequenceStep = 1 | 2 | 3;

const GROWTH_FIXED_SALUTATION = { text: "Hi there,", html: "<p>Hi there,</p>" } as const;

/** City, else a readable market slug fragment; used in step 3 body (not salutation). */
export function formatGrowthOutreachAreaLabel(
  city: string | null | undefined,
  discoveryMarketSlug: string | null | undefined,
): string {
  const c = city?.replace(/\s+/g, " ").trim();
  if (c) return c;
  const raw = discoveryMarketSlug?.trim().toLowerCase();
  if (!raw) return "your area";
  const words = raw.split("-").filter((w) => w.length > 0 && !/^(il|in|tx|ca|ny|usa|us)$/i.test(w));
  if (words.length === 0) return "your area";
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

export function growthOutreachSubject(leadType: GrowthLeadType, step: GrowthOutreachSequenceStep): string {
  if (step === 2) return "Wanted to follow up";
  if (step === 3) return "We're getting traction in your area";
  switch (leadType) {
    case "VENUE":
      return GROWTH_VENUE_OUTREACH_SUBJECT;
    case "ARTIST":
      return GROWTH_ARTIST_OUTREACH_SUBJECT;
    case "PROMOTER_ACCOUNT":
      return GROWTH_PROMOTER_OUTREACH_SUBJECT;
    default:
      return "MicStage — quick introduction";
  }
}

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

/** Growth-lead cold sequence: fixed salutation, no mailbox-derived names. */
export function buildVenueGrowthOutreachLetter(
  _venueName: string,
  step: GrowthOutreachSequenceStep,
  opts?: { claimVenueUrl?: string | null; areaLabel?: string | null },
): { textBody: string; htmlBody: string } {
  const claimVenueUrl = opts?.claimVenueUrl?.trim();
  const area = (opts?.areaLabel?.trim() || "your area").replace(/\s+/g, " ").trim();
  const sal = GROWTH_FIXED_SALUTATION;

  if (step === 2) {
    const paras = [
      "I'm following up on my last note about MicStage — a free tool for venues that run open mics.",
      "It covers the practical stuff: a simple signup page, optional QR codes for the room, and light help getting the word out so you are not juggling spreadsheets or random inboxes.",
      "If you want to try it, reply here and I will help, or use the link below when you have a minute.",
    ];
    const cta =
      claimVenueUrl != null && claimVenueUrl.length > 0
        ? ["Get started here:", claimVenueUrl]
        : ["If you would like the venue signup link, reply to this email and I will send it."];
    const textBody = [sal.text, "", ...paras, "", ...cta, "", SIGN_OFF_TEXT].join("\n");
    const htmlBody = [
      sal.html,
      ...paras.map((p) => `<p>${escapeHtml(p)}</p>`),
      claimVenueUrl
        ? `<p>Get started here:</p><p><a href="${escapeHtml(claimVenueUrl)}">${escapeHtml(claimVenueUrl)}</a></p>`
        : `<p>${escapeHtml("If you would like the venue signup link, reply to this email and I will send it.")}</p>`,
      SIGN_OFF_HTML,
    ].join("");
    return { textBody, htmlBody };
  }

  if (step === 3) {
    const paras = [
      `We are seeing more venues and artists connect on MicStage around ${area}. Nothing flashy — mostly people trying to make signups and weekly promotion a little less manual.`,
      "It is still free for venues. If you want to take a look, the link below creates your account and walks you through a first open mic setup.",
      "If timing is not right, no worries — a quick \"not interested\" reply helps me close the loop.",
    ];
    const cta =
      claimVenueUrl != null && claimVenueUrl.length > 0
        ? ["Link:", claimVenueUrl]
        : ["Reply anytime and I will send the venue signup link."];
    const textBody = [sal.text, "", ...paras, "", ...cta, "", SIGN_OFF_TEXT].join("\n");
    const htmlBody = [
      sal.html,
      ...paras.map((p) => `<p>${escapeHtml(p)}</p>`),
      claimVenueUrl
        ? `<p>Link:</p><p><a href="${escapeHtml(claimVenueUrl)}">${escapeHtml(claimVenueUrl)}</a></p>`
        : `<p>${escapeHtml("Reply anytime and I will send the venue signup link.")}</p>`,
      SIGN_OFF_HTML,
    ].join("");
    return { textBody, htmlBody };
  }

  const coreText = venueCoreParagraphsText(claimVenueUrl);
  const textBody = [sal.text, "", ...coreText, "", SIGN_OFF_TEXT].join("\n");
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
    sal.html,
    ...htmlCoreParas.map((p) => `<p>${escapeHtml(p)}</p>`),
    `<ul style="margin:0 0 1em 1.2em;padding:0;">${bullets.map((b) => `<li style="margin:0.25em 0;">${escapeHtml(b)}</li>`).join("")}</ul>`,
    ...afterList.map((p) => `<p>${escapeHtml(p)}</p>`),
    ...ctaHtml,
    "<p>If you want, just reply and I can help get it set up.</p>",
    SIGN_OFF_HTML,
  ].join("");
  return { textBody, htmlBody };
}

export function buildArtistGrowthOutreachLetter(
  _displayName: string,
  step: GrowthOutreachSequenceStep,
  opts?: { claimArtistUrl?: string | null; areaLabel?: string | null },
): { textBody: string; htmlBody: string } {
  const claimArtistUrl = opts?.claimArtistUrl?.trim();
  const area = (opts?.areaLabel?.trim() || "your area").replace(/\s+/g, " ").trim();
  const sal = GROWTH_FIXED_SALUTATION;

  if (step === 2) {
    const paras = [
      "Quick follow-up on MicStage — the free artist side is basically: find nearby open mics, sign up in one place, and get fewer \"DM the host\" loops.",
      "If you want to try it, reply and I will send the signup link, or use the link below.",
    ];
    const cta =
      claimArtistUrl != null && claimArtistUrl.length > 0
        ? ["Get started here:", claimArtistUrl]
        : ["Reply to this email and I will send the artist signup link."];
    const textBody = [sal.text, "", ...paras, "", ...cta, "", SIGN_OFF_TEXT].join("\n");
    const htmlBody = [
      sal.html,
      ...paras.map((p) => `<p>${escapeHtml(p)}</p>`),
      claimArtistUrl
        ? `<p>Get started here:</p><p><a href="${escapeHtml(claimArtistUrl)}">${escapeHtml(claimArtistUrl)}</a></p>`
        : `<p>${escapeHtml("Reply to this email and I will send the artist signup link.")}</p>`,
      SIGN_OFF_HTML,
    ].join("");
    return { textBody, htmlBody };
  }

  if (step === 3) {
    const paras = [
      `More artists in ${area} are starting to use MicStage to browse and register for open mics — still early, but the list is growing week to week.`,
      "If you want early access, the link below creates a free account. If it is not for you, a one-line reply is totally fine.",
    ];
    const cta =
      claimArtistUrl != null && claimArtistUrl.length > 0
        ? ["Link:", claimArtistUrl]
        : ["Reply and I will send the artist signup link."];
    const textBody = [sal.text, "", ...paras, "", ...cta, "", SIGN_OFF_TEXT].join("\n");
    const htmlBody = [
      sal.html,
      ...paras.map((p) => `<p>${escapeHtml(p)}</p>`),
      claimArtistUrl
        ? `<p>Link:</p><p><a href="${escapeHtml(claimArtistUrl)}">${escapeHtml(claimArtistUrl)}</a></p>`
        : `<p>${escapeHtml("Reply and I will send the artist signup link.")}</p>`,
      SIGN_OFF_HTML,
    ].join("");
    return { textBody, htmlBody };
  }

  const coreText = artistCoreParagraphsText(claimArtistUrl);
  const textBody = [sal.text, "", ...coreText, "", SIGN_OFF_TEXT].join("\n");
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
    sal.html,
    ...htmlCoreParas.map((p) => `<p>${escapeHtml(p)}</p>`),
    `<ul style="margin:0 0 1em 1.2em;padding:0;">${bullets.map((b) => `<li style="margin:0.25em 0;">${escapeHtml(b)}</li>`).join("")}</ul>`,
    ...ctaHtml,
    "<p>If you want, just reply and I can help get you set up.</p>",
    SIGN_OFF_HTML,
  ].join("");
  return { textBody, htmlBody };
}

export function buildPromoterGrowthOutreachLetter(
  step: GrowthOutreachSequenceStep,
  opts?: { areaLabel?: string | null },
): { textBody: string; htmlBody: string } {
  const area = (opts?.areaLabel?.trim() || "your area").replace(/\s+/g, " ").trim();
  const sal = GROWTH_FIXED_SALUTATION;

  if (step === 2) {
    const paras = [
      "Following up on MicStage — we are trying to give venues a cleaner way to run open mics (signup links, light promotion) and give performers an easier way to discover what is happening nearby.",
      "If a short overview would help, reply here and I will send it.",
    ];
    const textBody = [sal.text, "", ...paras, "", SIGN_OFF_TEXT].join("\n");
    const htmlBody = [sal.html, ...paras.map((p) => `<p>${escapeHtml(p)}</p>`), SIGN_OFF_HTML].join("");
    return { textBody, htmlBody };
  }

  if (step === 3) {
    const paras = [
      `We are seeing steady pickup around ${area} — mostly small venues and hosts trying MicStage for weekly signups. Still free on the venue side while we prove it out.`,
      "If you want to see what it looks like in practice, reply and I will share a concise overview.",
    ];
    const textBody = [sal.text, "", ...paras, "", SIGN_OFF_TEXT].join("\n");
    const htmlBody = [sal.html, ...paras.map((p) => `<p>${escapeHtml(p)}</p>`), SIGN_OFF_HTML].join("");
    return { textBody, htmlBody };
  }

  const paras = [
    "MicStage is a new, free platform focused on open mic nights: venues get a simple signup flow (including optional QR codes in the room), and artists get one place to find and register for nearby mics.",
    "We are rolling out market by market and trying to keep the onboarding light — mostly setup help and feedback loops with hosts.",
    "If you are open to a short overview (or a 10-minute call), reply here and I will follow up.",
  ];
  const textBody = [sal.text, "", ...paras, "", SIGN_OFF_TEXT].join("\n");
  const htmlBody = [sal.html, ...paras.map((p) => `<p>${escapeHtml(p)}</p>`), SIGN_OFF_HTML].join("");
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
