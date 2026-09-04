import { FACE_EMBEDDING_DIMENSIONS } from "@ncct/constants";
import { useEffect, useRef, useState } from "react";

interface FaceCaptureProps {
  actionLabel: string;
  onCapture: (embedding: number[]) => void;
  disabled?: boolean;
}

type Status = "idle" | "starting-camera" | "loading-model" | "ready" | "capturing" | "error";

// Runs @vladmandic/human entirely in the browser (WebGL) — no image or
// video frame is ever sent to Express, only the derived embedding. See
// docs/DECISIONS.md #16 for why extraction happens here rather than
// server-side. Human's model files (~30MB) are fetched from its own public
// CDN at runtime rather than bundled, same as this repo's other
// large-media choices (DECISIONS.md #12's YouTube embed).
const HUMAN_MODEL_BASE_PATH = "https://vladmandic.github.io/human-models/models/";

// A module-level singleton: loading Human's models is expensive (a few
// seconds, several MB), so every FaceCapture instance on a page shares one
// loaded instance instead of re-downloading per mount.
let humanPromise: Promise<import("@vladmandic/human").Human> | null = null;

// Exported so the ESP32-CAM kiosk flow (AttendanceManager.tsx) can share
// this exact loaded instance rather than loading Human's models a second
// time — same singleton, just fed a different frame source than getUserMedia.
export async function getHuman() {
  if (!humanPromise) {
    humanPromise = import("@vladmandic/human").then(async ({ Human }) => {
      const human = new Human({
        modelBasePath: HUMAN_MODEL_BASE_PATH,
        face: { enabled: true, detector: { enabled: true }, description: { enabled: true } },
        body: { enabled: false },
        hand: { enabled: false },
        object: { enabled: false },
        gesture: { enabled: false },
      });
      await human.load();
      return human;
    });
  }
  return humanPromise;
}

// Reusable webcam capture + face-embedding extraction, shared by enrollment
// and face check-in — both just need a 1024-number descriptor out of it.
export function FaceCapture({ actionLabel, onCapture, disabled }: FaceCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  async function startCamera() {
    setError(null);
    setStatus("starting-camera");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        // play() can resolve before a frame has actually been decoded —
        // detecting against the video before then silently sees a blank
        // frame, not an error, which would look exactly like "no face
        // detected" for reasons that have nothing to do with the trainee's
        // face. HAVE_CURRENT_DATA (readyState 2) is the first point a real
        // frame is guaranteed available.
        const video = videoRef.current;
        if (video.readyState < 2) {
          await new Promise<void>((resolve) => {
            video.addEventListener("loadeddata", () => resolve(), { once: true });
          });
        }
      }
      setStatus("loading-model");
      await getHuman();
      setStatus("ready");
    } catch (err) {
      setError((err as Error).message);
      setStatus("error");
    }
  }

  async function capture() {
    if (!videoRef.current) return;
    setStatus("capturing");
    setError(null);
    try {
      const human = await getHuman();
      const result = await human.detect(videoRef.current);
      const face = result.face[0];

      // These two failures are genuinely different and used to be reported
      // identically as "No face detected" — which actively misled debugging
      // when the descriptor length was wrong (the face WAS detected; the
      // length check rejected it). Keep them distinct.
      if (!face) {
        console.warn("FaceCapture: no face detected", {
          videoSize: [videoRef.current.videoWidth, videoRef.current.videoHeight],
        });
        setError("No face detected — face the camera directly in good light and try again");
        setStatus("ready");
        return;
      }
      if (!face.embedding || face.embedding.length !== FACE_EMBEDDING_DIMENSIONS) {
        console.warn("FaceCapture: face detected but no usable descriptor", {
          faceScore: face.score,
          embeddingLength: face.embedding?.length ?? null,
          expectedLength: FACE_EMBEDDING_DIMENSIONS,
        });
        setError(
          "Your face was detected but the model didn't return a usable descriptor. Please try again, or use QR check-in.",
        );
        setStatus("ready");
        return;
      }
      onCapture(face.embedding);
      setStatus("ready");
    } catch (err) {
      setError((err as Error).message);
      setStatus("ready");
    }
  }

  return (
    // `legacy-ui` applied directly (see AssessmentBuilder.tsx's comment) so
    // this stays correctly styled on mobile wherever a future kiosk-facing
    // caller re-embeds it (DECISIONS.md #21 — not wired into any screen
    // today, kept for that reuse rather than deleted).
    <div className="face-capture legacy-ui">
      <video ref={videoRef} className="face-capture-video" muted playsInline />
      {error && <p className="form-error">{error}</p>}
      {status === "idle" || status === "error" ? (
        <button type="button" onClick={startCamera} disabled={disabled}>
          Start camera
        </button>
      ) : (
        <button
          type="button"
          onClick={capture}
          disabled={disabled || status !== "ready"}
        >
          {status === "starting-camera" && "Starting camera..."}
          {status === "loading-model" && "Loading face model..."}
          {status === "ready" && actionLabel}
          {status === "capturing" && "Capturing..."}
        </button>
      )}
    </div>
  );
}
