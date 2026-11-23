import type { MicstageVideo } from "@/lib/media/micstageVideos";
import { youtubeVideoObjectJsonLd } from "@/lib/media/micstageVideos";

/**
 * Responsive 16:9 YouTube embed — no autoplay, lazy iframe below the fold.
 */
export function YouTubeEmbed({
  video,
  className = "",
  includeJsonLd = true,
}: {
  video: MicstageVideo;
  className?: string;
  includeJsonLd?: boolean;
}) {
  return (
    <figure className={`grid gap-2 ${className}`}>
      {includeJsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(youtubeVideoObjectJsonLd(video)) }}
        />
      ) : null}
      <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-white/10 bg-black/50">
        <iframe
          className="absolute inset-0 h-full w-full"
          src={video.embedUrl}
          title={video.title}
          loading="lazy"
          allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
        />
      </div>
      <figcaption className="flex flex-wrap items-baseline justify-between gap-2 text-xs text-white/55">
        <span>{video.title}</span>
        <a
          href={video.watchUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-[rgb(var(--om-neon))] underline decoration-[rgb(var(--om-neon))]/35 underline-offset-2 hover:brightness-110"
        >
          Watch on YouTube
        </a>
      </figcaption>
    </figure>
  );
}
