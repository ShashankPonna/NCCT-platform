import { useLocale } from "./i18n/LocaleContext.js";
import "./YouTubeVideoPlayer.css";

interface SelfHostedVideoPlayerProps {
  url: string | null;
}

const NO_VIDEO_TEXT = { en: "No video available for this lesson.", hi: "इस पाठ के लिए कोई वीडियो उपलब्ध नहीं है।" };

// Plays a lesson video uploaded to self-hosted object storage (Backblaze B2
// — see docs/DECISIONS.md #20) via the short-lived signed URL
// GET /lessons/:id/video-url returns. Sibling to YouTubeVideoPlayer.tsx,
// same empty-state message and aspect-ratio box, reusing its stylesheet.
export function SelfHostedVideoPlayer({ url }: SelfHostedVideoPlayerProps) {
  const { locale } = useLocale();
  if (!url) {
    return (
      <div className="yt-player yt-player-empty">
        <p>{NO_VIDEO_TEXT[locale]}</p>
      </div>
    );
  }

  return (
    <div className="yt-player">
      {/* eslint-disable-next-line jsx-a11y/media-has-caption -- captions aren't authored anywhere in this pipeline yet; tracked as a gap, not silently ignored */}
      <video src={url} controls />
    </div>
  );
}
