import { useState } from "react";
import { useLocale } from "./i18n/LocaleContext.js";
import "./YouTubeVideoPlayer.css";

interface SelfHostedVideoPlayerProps {
  url: string | null;
  // True only while the signed URL itself is being fetched from Express —
  // distinct from `url === null`, which is also the state for a lesson
  // that genuinely has no video. Without this the trainee saw "No video
  // available for this lesson" during every single load, not just a real
  // absence — a real, reported UX gap (the load looked like a dead end).
  loading?: boolean;
}

const NO_VIDEO_TEXT = { en: "No video available for this lesson.", hi: "इस पाठ के लिए कोई वीडियो उपलब्ध नहीं है।" };
const LOADING_TEXT = { en: "Loading video…", hi: "वीडियो लोड हो रहा है…" };
const BUFFERING_TEXT = { en: "Buffering…", hi: "बफ़रिंग हो रही है…" };

// Plays a lesson video uploaded to self-hosted object storage (Backblaze B2
// — see docs/DECISIONS.md #20) via the short-lived signed URL
// GET /lessons/:id/video-url returns. Sibling to YouTubeVideoPlayer.tsx,
// same empty-state message and aspect-ratio box, reusing its stylesheet.
export function SelfHostedVideoPlayer({ url, loading }: SelfHostedVideoPlayerProps) {
  const { locale } = useLocale();
  // Separate from `loading` above (the signed-URL fetch, before a src even
  // exists): this tracks the browser's own network activity once playback
  // has a real src — `waiting` fires on a genuine mid-playback stall
  // (still pulling bytes from B2), `playing`/`canplay` clear it again.
  const [buffering, setBuffering] = useState(false);

  if (loading) {
    return (
      <div className="yt-player yt-player-empty">
        <span className="yt-player-spinner" aria-hidden="true" />
        <p>{LOADING_TEXT[locale]}</p>
      </div>
    );
  }

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
      <video
        src={url}
        controls
        // Starts pulling bytes from B2 the instant a src is set rather than
        // waiting for the trainee to press play — previously left to
        // browser defaults, which are inconsistent about how eagerly they
        // prefetch an unstarted video.
        preload="auto"
        onWaiting={() => setBuffering(true)}
        onPlaying={() => setBuffering(false)}
        onCanPlay={() => setBuffering(false)}
      />
      {buffering && (
        <div className="yt-player-buffering" aria-live="polite">
          <span className="yt-player-spinner" aria-hidden="true" />
          <p>{BUFFERING_TEXT[locale]}</p>
        </div>
      )}
    </div>
  );
}
