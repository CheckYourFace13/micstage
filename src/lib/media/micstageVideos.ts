/**
 * Canonical MicStage explainer YouTube videos (real published URLs only).
 * Do not invent uploadDate / duration without a reliable source.
 */

export type MicstageVideo = {
  id: string;
  title: string;
  description: string;
  youtubeUrl: string;
  embedUrl: string;
  watchUrl: string;
};

function video(id: string, title: string, description: string): MicstageVideo {
  return {
    id,
    title,
    description,
    youtubeUrl: `https://www.youtube.com/watch?v=${id}`,
    embedUrl: `https://www.youtube.com/embed/${id}`,
    watchUrl: `https://www.youtube.com/watch?v=${id}`,
  };
}

export const MICSTAGE_VIDEO_OVERVIEW = video(
  "Im6wTMkxzeY",
  "MicStage overview",
  "See how MicStage helps performers, hosts, and venues find and run open mic nights.",
);

export const MICSTAGE_VIDEO_PERFORMER = video(
  "D0qwuHTCZTs",
  "MicStage for performers",
  "Find verified open mics, see schedules, and sign up for available performance times.",
);

export const MICSTAGE_VIDEO_HOST = video(
  "RbDn8O8FiJw",
  "MicStage for hosts",
  "Run open mic nights with schedules, signups, and shareable lineups — free.",
);

export const MICSTAGE_VIDEO_HOWTO_SHORT = video(
  "TvuW9YjZRW4",
  "MicStage quick how-to",
  "A short walkthrough of the MicStage basics.",
);

export function youtubeVideoObjectJsonLd(v: MicstageVideo) {
  return {
    "@context": "https://schema.org",
    "@type": "VideoObject",
    name: v.title,
    description: v.description,
    thumbnailUrl: `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`,
    contentUrl: v.youtubeUrl,
    embedUrl: v.embedUrl,
  };
}
