export type MediaCategoryCard = {
  href: string;
  title: string;
  description: string;
  /** Optional pill on the media landing card only. */
  badge?: "downloadable";
};

export const MEDIA_CATEGORY_CARDS: MediaCategoryCard[] = [
  {
    href: "/media/press-releases",
    title: "Press Releases",
    description:
      "Official MicStage announcements for media, venues, artists, and partners: milestones, launches, and product news.",
  },
  {
    href: "/media/brand-images",
    title: "Brand Images",
    description:
      "MicStage brand reference area for logos, icons, usage notes, and visual identity guidance for editorial, partner, and event mentions.",
    badge: "downloadable",
  },
  {
    href: "/media/how-to-venues",
    title: "How-To Sheets for Venues",
    description:
      "A practical venue guide to launching and managing open mic scheduling, recurring templates, performer discovery, and promotion on MicStage.",
  },
  {
    href: "/media/how-to-artists",
    title: "How-To Sheets for Artists",
    description:
      "A concise performer guide to profile setup, finding open mics, booking open slots, and keeping your public presence current on MicStage.",
  },
];

export const PRESS_RELEASE_META = {
  headline: "MicStage Open Mic Platform Launches in Beta on April 20, 2026",
  subheadline:
    "MicStage helps venues publish open mic schedules, helps performers get found, and gives audiences a clearer way to discover local shows.",
  releaseLine: "CHICAGO, IL | April 20, 2026",
};
