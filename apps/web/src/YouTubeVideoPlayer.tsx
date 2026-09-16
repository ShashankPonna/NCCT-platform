import { YOUTUBE_VIDEO_ID_PATTERN } from "@ncct/constants";
import { useLocale } from "./i18n/LocaleContext.js";
import "./YouTubeVideoPlayer.css";

interface YouTubeVideoPlayerProps {
  videoId: string | null | undefined;
}

const NO_VIDEO_TEXT = { en: "No video available for this lesson.", hi: "इस पाठ के लिए कोई वीडियो उपलब्ध नहीं है।" };

// SIH prototype: lesson video is hosted as a YouTube *unlisted* video and
// embedded via the official iframe player — see docs/DECISIONS.md. This is
// a deliberately swappable prototype layer, not a claim that unlisted
// YouTube videos are private/secure; production can replace this component
// with a signed-URL player against private object storage without changing
// how lessons reference their video (still a single opaque video_id/key).
export function YouTubeVideoPlayer({ videoId }: YouTubeVideoPlayerProps) {
  const { locale } = useLocale();
  if (!videoId || !YOUTUBE_VIDEO_ID_PATTERN.test(videoId)) {
    return (
      <div className="yt-player yt-player-empty">
        <p>{NO_VIDEO_TEXT[locale]}</p>
      </div>
    );
  }

  const src = new URL(`https://www.youtube.com/embed/${videoId}`);
  if (typeof window !== "undefined") {
    src.searchParams.set("origin", window.location.origin);
  }

  return (
    <div className="yt-player">
      <iframe
        src={src.toString()}
        title="Lesson video"
        allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
      />
    </div>
  );
}
