export type ResourceArticle = {
  slug: string;
  title: string;
  description: string;
  category: "venue-ops" | "community" | "performer" | "strategy";
  readingMinutes: number;
  publishedAt: string;
  updatedAt: string;
  intro: string;
  sections: { heading: string; paragraphs: string[] }[];
  practicalTips?: string[];
  faq?: { q: string; a: string }[];
  relatedGuides?: { slug: string; label: string }[];
  keyTakeaways: string[];
  relatedDiscoveryLinks: { href: string; label: string }[];
};
