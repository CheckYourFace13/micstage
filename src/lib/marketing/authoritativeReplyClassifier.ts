export type CorrectionIntent =
  | "high_confidence_removal"
  | "high_confidence_reverify"
  | "unsubscribe"
  | "ambiguous_review"
  | "none";

export type AuthoritativeReplyClassification = {
  intent: CorrectionIntent;
  confidence: "high" | "medium" | "low";
  matchedPhrases: string[];
};

const REMOVAL_PHRASES: Array<{ phrase: string; re: RegExp }> = [
  { phrase: "please delete", re: /\bplease\s+delete\b/i },
  { phrase: "please remove", re: /\bplease\s+remove\b/i },
  { phrase: "remove this listing", re: /\bremove\s+this\s+listing\b/i },
  { phrase: "delete this listing", re: /\bdelete\s+this\s+listing\b/i },
  { phrase: "delete the listing", re: /\bdelete\s+the\s+listing\b/i },
  { phrase: "we no longer host this", re: /\bno\s+longer\s+host(?:s)?(?:\s+this)?\b/i },
  { phrase: "we do not host", re: /\bwe\s+do(?:\s+not|n't)\s+host\b/i },
  { phrase: "event ended", re: /\bevent\s+ended\b/i },
  { phrase: "not held anymore", re: /\bnot\s+held\s+anymore\b/i },
  { phrase: "no longer held", re: /\bno\s+longer\s+held\b/i },
  { phrase: "not held anymore / since", re: /\bnot\s+been\s+held\b/i },
  { phrase: "has not been held", re: /\bhas\s+not\s+been\s+held\b/i },
  { phrase: "we no longer have", re: /\bno\s+longer\s+(?:have|run|offer)\s+(?:an?\s+)?open\s+mic\b/i },
  { phrase: "take this down", re: /\btake\s+(?:this|it|the listing)\s+down\b/i },
  { phrase: "stop listing", re: /\bstop\s+listing\b/i },
  { phrase: "outdated listing", re: /\boutdated\s+listing\b/i },
  { phrase: "no longer valid", re: /\bno\s+longer\s+valid\b/i },
  { phrase: "discontinued", re: /\b(?:discontinued|cancelled permanently|permanently closed)\b/i },
];

const REVERIFY_PHRASES: Array<{ phrase: string; re: RegExp }> = [
  { phrase: "wrong dates", re: /\bwrong\s+dates?\b/i },
  { phrase: "wrong location", re: /\bwrong\s+(?:location|address|venue|place)\b/i },
  { phrase: "wrong time", re: /\bwrong\s+(?:time|times|schedule)\b/i },
  { phrase: "dates are no longer valid", re: /\b(?:dates?|times?|location)\s+(?:are|is)\s+no\s+longer\s+valid\b/i },
  { phrase: "we've moved", re: /\bwe(?:'ve| have)\s+moved\b/i },
  { phrase: "schedule changed", re: /\bschedule\s+(?:has\s+)?changed\b/i },
];

const UNSUBSCRIBE_PHRASES: Array<{ phrase: string; re: RegExp }> = [
  { phrase: "unsubscribe", re: /\bunsubscribe\b/i },
  { phrase: "stop emailing", re: /\bstop\s+emailing\b/i },
  { phrase: "remove me from your list", re: /\bremove\s+me\s+from\s+(?:your\s+)?(?:list|emails?|mailing)\b/i },
  { phrase: "do not contact", re: /\bdo\s+not\s+contact\b/i },
  { phrase: "stop sending", re: /\bstop\s+sending\b/i },
];

const AMBIGUOUS_QUESTION =
  /\?|can you (?:help|tell|confirm)|what (?:is|are)|who (?:is|are)|how (?:do|does|can)/i;

function matchPhrases(text: string, rows: Array<{ phrase: string; re: RegExp }>): string[] {
  const hits: string[] = [];
  for (const row of rows) {
    if (row.re.test(text)) hits.push(row.phrase);
  }
  return hits;
}

/**
 * Classify inbound outreach / claim-reminder reply text.
 * High-confidence first-party removal language is explicit; questions stay review-only.
 */
export function classifyAuthoritativeCorrectionReply(raw: string | null | undefined): AuthoritativeReplyClassification {
  const text = (raw ?? "").replace(/\s+/g, " ").trim();
  if (!text) return { intent: "none", confidence: "low", matchedPhrases: [] };

  const removal = matchPhrases(text, REMOVAL_PHRASES);
  const reverify = matchPhrases(text, REVERIFY_PHRASES);
  const unsub = matchPhrases(text, UNSUBSCRIBE_PHRASES);
  const looksLikeQuestion = AMBIGUOUS_QUESTION.test(text) && text.length < 280 && removal.length === 0;

  if (removal.length > 0 && !looksLikeQuestion) {
    return {
      intent: "high_confidence_removal",
      confidence: "high",
      matchedPhrases: [...removal, ...reverify],
    };
  }

  if (reverify.length > 0 && removal.length === 0) {
    if (looksLikeQuestion) {
      return { intent: "ambiguous_review", confidence: "medium", matchedPhrases: reverify };
    }
    return {
      intent: "high_confidence_reverify",
      confidence: "high",
      matchedPhrases: reverify,
    };
  }

  if (unsub.length > 0 && removal.length === 0 && reverify.length === 0) {
    return { intent: "unsubscribe", confidence: "high", matchedPhrases: unsub };
  }

  if (looksLikeQuestion && removal.length === 0 && reverify.length === 0 && unsub.length === 0) {
    return { intent: "none", confidence: "low", matchedPhrases: [] };
  }

  if (looksLikeQuestion || (unsub.length > 0 && (removal.length > 0 || reverify.length > 0))) {
    return {
      intent: "ambiguous_review",
      confidence: "medium",
      matchedPhrases: [...removal, ...reverify, ...unsub],
    };
  }

  if (removal.length > 0) {
    return { intent: "ambiguous_review", confidence: "medium", matchedPhrases: removal };
  }

  return { intent: "none", confidence: "low", matchedPhrases: [] };
}
