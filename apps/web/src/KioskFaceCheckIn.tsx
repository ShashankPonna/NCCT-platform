import { FACE_EMBEDDING_DIMENSIONS } from "@ncct/constants";
import { kioskFaceCheckIn } from "@ncct/api-client";
import type { AttendanceCheckInResult } from "@ncct/api-client";
import { useRef, useState } from "react";
import { getHuman } from "./FaceCapture.js";
import { useLocale, type Locale } from "./i18n/LocaleContext.js";

interface KioskFaceCheckInProps {
  accessToken: string;
  sessionId: string;
}

type Status =
  | "idle"
  | "loading-preview"
  | "capturing"
  | "submitting"
  | "no-face"
  | "matched"
  | "no-match"
  | "error";

const MAX_ATTEMPTS_PER_CLICK = 3;

interface KioskFaceCheckInText {
  heading: string;
  description: string;
  camPlaceholder: string;
  traineeIdPlaceholder: string;
  previewFailedLabel: string;
  captureFailedLabel: string;
  attemptError: (label: string, attempt: number, max: number, message: string) => string;
  cameraTimedOut: string;
  cameraHttpError: (status: number) => string;
  frameTruncated: (received: number, declared: number) => string;
  frameNotDecoded: (received: number) => string;
  previewCanvasNotReady: string;
  canvasContextUnavailable: string;
  noFaceInFrame: string;
  noConfidentMatch: (score: string) => string;
  checkedInMatch: (score: string) => string;
  notAvailable: string;
  loadingPreview: string;
  preview: string;
  capturing: string;
  submitting: string;
  captureAndCheckIn: string;
}

const content: Record<Locale, KioskFaceCheckInText> = {
  en: {
    heading: "ESP32-CAM Face Check-in",
    description:
      "Requires the session ID above, the trainee's id (from an NFC tap on the Kiosk tab or the roster), and the camera's local address printed in its Serial Monitor on boot. Use Preview to frame the shot, then Capture & Check In once ready.",
    camPlaceholder: "http://<esp32-cam-ip>",
    traineeIdPlaceholder: "Trainee ID (UUID)",
    previewFailedLabel: "Preview failed",
    captureFailedLabel: "Capture failed",
    attemptError: (label, attempt, max, message) => `${label} (attempt ${attempt}/${max}): ${message}`,
    cameraTimedOut: "Camera request timed out (weak WiFi signal?)",
    cameraHttpError: (status) => `Camera returned HTTP ${status}`,
    frameTruncated: (received, declared) => `Camera frame arrived truncated (${received} of ${declared} bytes)`,
    frameNotDecoded: (received) => `Camera frame could not be decoded (${received} bytes received)`,
    previewCanvasNotReady: "Preview canvas not ready",
    canvasContextUnavailable: "Canvas context unavailable",
    noFaceInFrame: "No face detected in that frame — reposition and try again",
    noConfidentMatch: (score) => `No confident match (score ${score}) — fall back to QR check-in`,
    checkedInMatch: (score) => `Checked in — match score ${score}`,
    notAvailable: "n/a",
    loadingPreview: "Loading preview...",
    preview: "Preview",
    capturing: "Capturing...",
    submitting: "Submitting...",
    captureAndCheckIn: "Capture & Check In",
  },
  hi: {
    heading: "ESP32-CAM फेस चेक-इन",
    description:
      "ऊपर दिए गए सत्र आईडी, प्रशिक्षणार्थी की आईडी (कियोस्क टैब पर NFC टैप से या रोस्टर से), और कैमरे के बूट पर सीरियल मॉनिटर में छपे स्थानीय पते की आवश्यकता है। शॉट फ़्रेम करने के लिए प्रीव्यू का उपयोग करें, फिर तैयार होने पर कैप्चर एवं चेक इन करें।",
    camPlaceholder: "http://<esp32-cam-ip>",
    traineeIdPlaceholder: "प्रशिक्षणार्थी आईडी (UUID)",
    previewFailedLabel: "प्रीव्यू विफल",
    captureFailedLabel: "कैप्चर विफल",
    attemptError: (label, attempt, max, message) => `${label} (प्रयास ${attempt}/${max}): ${message}`,
    cameraTimedOut: "कैमरा अनुरोध का समय समाप्त हो गया (कमज़ोर WiFi सिग्नल?)",
    cameraHttpError: (status) => `कैमरे ने HTTP ${status} लौटाया`,
    frameTruncated: (received, declared) => `कैमरा फ्रेम अधूरा प्राप्त हुआ (${declared} में से ${received} बाइट्स)`,
    frameNotDecoded: (received) => `कैमरा फ्रेम डिकोड नहीं किया जा सका (${received} बाइट्स प्राप्त हुए)`,
    previewCanvasNotReady: "प्रीव्यू कैनवास तैयार नहीं है",
    canvasContextUnavailable: "कैनवास संदर्भ अनुपलब्ध",
    noFaceInFrame: "उस फ्रेम में कोई चेहरा नहीं मिला — स्थिति बदलें और पुनः प्रयास करें",
    noConfidentMatch: (score) => `कोई विश्वसनीय मिलान नहीं (स्कोर ${score}) — QR चेक-इन पर वापस जाएं`,
    checkedInMatch: (score) => `चेक-इन हो गया — मिलान स्कोर ${score}`,
    notAvailable: "उपलब्ध नहीं",
    loadingPreview: "प्रीव्यू लोड हो रहा है...",
    preview: "प्रीव्यू",
    capturing: "कैप्चर हो रहा है...",
    submitting: "सबमिट हो रहा है...",
    captureAndCheckIn: "कैप्चर एवं चेक इन करें",
  },
};

// F5 kiosk face check-in (docs/DECISIONS.md #21): a staff-operated terminal
// has no trainee JWT to read an identity from, so trainee_id is typed here
// (or pasted from a preceding NFC lookup in KioskNfcReader.tsx) rather than
// inferred from the caller — same shift publicProfile.ts's NFC kiosk route
// already made for the same reason.
//
// Single-shot capture, not continuous live polling: real hardware testing
// showed the ESP32-CAM's WiFi link is marginal (observed transfer times
// ranging from 4.5s to full timeouts, occasional truncated frames), so
// hammering it every ~800ms the way an earlier version of this component
// did made things worse, not better, and risked the same brownout reset
// loop found on this board's power supply. A deliberate "position
// yourself, then capture" model — same shape as a webcam login prompt —
// asks far less of a connection that can't sustain continuous polling.
//
// Reuses FaceCapture.tsx's already-loaded @vladmandic/human instance to
// extract an embedding client-side, then submits it to the staff-only
// POST /timetable/:sessionId/kiosk-face-checkin route, which always
// recomputes the match server-side and never trusts a client verdict.
export function KioskFaceCheckIn({ accessToken, sessionId }: KioskFaceCheckInProps) {
  const { locale } = useLocale();
  const t = content[locale];
  const [camUrl, setCamUrl] = useState("");
  const [traineeId, setTraineeId] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AttendanceCheckInResult | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);

  function camBase(): string {
    // Tolerate either "http://<ip>" or "http://<ip>/capture" in the input —
    // pasting the exact "Frame endpoint: ..." line the firmware prints on
    // boot (which already ends in /capture) is a natural, observed thing to
    // do, and doubling the suffix would hit a route that doesn't exist on
    // the board at all.
    return camUrl.trim().replace(/\/$/, "").replace(/\/capture$/, "");
  }

  // One capture attempt: fetches a single frame and draws it to the canvas.
  // Throws on any failure (timeout, truncated transfer, bad decode) — the
  // caller decides how many times to retry.
  async function fetchFrameToCanvas(): Promise<HTMLCanvasElement> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    let res: Response;
    try {
      res = await fetch(`${camBase()}/capture`, { cache: "no-store", signal: controller.signal });
    } catch (err) {
      throw (err as Error).name === "AbortError" ? new Error(t.cameraTimedOut) : err;
    } finally {
      clearTimeout(timeout);
    }
    if (!res.ok) throw new Error(t.cameraHttpError(res.status));
    const blob = await res.blob();

    // A real, observed failure mode on weak WiFi: fetch() resolves "ok" but
    // the connection drops mid-body, handing back fewer bytes than the
    // server declared. Checking declared vs. actual size makes a truncated
    // transfer diagnosable instead of a mystery decode failure below.
    const declaredLength = Number(res.headers.get("content-length"));
    if (declaredLength && blob.size < declaredLength) {
      throw new Error(t.frameTruncated(blob.size, declaredLength));
    }

    let bitmap: ImageBitmap;
    try {
      bitmap = await createImageBitmap(blob);
    } catch {
      throw new Error(t.frameNotDecoded(blob.size));
    }

    const canvas = canvasRef.current;
    if (!canvas) throw new Error(t.previewCanvasNotReady);
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error(t.canvasContextUnavailable);
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    return canvas;
  }

  // A handful of quick attempts per click, not an unbounded background
  // loop — absorbs a single dropped/truncated frame (common on this
  // hardware) without needing the operator to click again, but still ends
  // with a clear result rather than retrying forever.
  async function withRetries<T>(label: string, attempt: () => Promise<T>): Promise<T> {
    let lastErr: Error | null = null;
    for (let i = 0; i < MAX_ATTEMPTS_PER_CLICK; i++) {
      try {
        return await attempt();
      } catch (err) {
        lastErr = err as Error;
        setError(t.attemptError(label, i + 1, MAX_ATTEMPTS_PER_CLICK, lastErr.message));
      }
    }
    throw lastErr;
  }

  async function handlePreview() {
    if (!camUrl.trim()) return;
    setError(null);
    setStatus("loading-preview");
    try {
      await withRetries(t.previewFailedLabel, fetchFrameToCanvas);
      setStatus("idle");
    } catch (err) {
      setError((err as Error).message);
      setStatus("error");
    }
  }

  async function handleCapture() {
    if (!camUrl.trim() || !traineeId.trim() || !sessionId.trim()) return;
    setError(null);
    setResult(null);
    setStatus("capturing");
    try {
      const canvas = await withRetries(t.captureFailedLabel, fetchFrameToCanvas);
      const human = await getHuman();
      const detected = await human.detect(canvas);
      const face = detected.face[0];
      if (!face?.embedding || face.embedding.length !== FACE_EMBEDDING_DIMENSIONS) {
        setStatus("no-face");
        setError(t.noFaceInFrame);
        return;
      }
      setError(null);
      await submit(face.embedding);
    } catch (err) {
      setError((err as Error).message);
      setStatus("error");
    }
  }

  async function submit(embedding: number[]) {
    setStatus("submitting");
    try {
      const res = await kioskFaceCheckIn(accessToken, sessionId.trim(), traineeId.trim(), embedding);
      setResult(res);
      setStatus(res.matched ? "matched" : "no-match");
    } catch (err) {
      setError((err as Error).message);
      setStatus("error");
    }
  }

  const busy = status === "loading-preview" || status === "capturing" || status === "submitting";

  return (
    <section className="bg-surface-card border border-outline-variant rounded-xl p-6 shadow-sm flex flex-col gap-4">
      <h2 className="font-headline-sm text-headline-sm text-on-surface flex items-center gap-2 m-0">
        <span className="material-symbols-outlined text-primary">photo_camera</span>
        {t.heading}
      </h2>
      <p className="font-body-sm text-body-sm text-on-surface-variant m-0">{t.description}</p>

      <div className="flex flex-col md:flex-row gap-3">
        <input
          value={camUrl}
          onChange={(e) => setCamUrl(e.target.value)}
          placeholder={t.camPlaceholder}
          disabled={busy}
          className="flex-1 h-touch-target bg-surface-container-lowest border border-outline-variant rounded-lg px-3 font-mono text-body-sm disabled:opacity-50"
        />
        <input
          value={traineeId}
          onChange={(e) => setTraineeId(e.target.value)}
          placeholder={t.traineeIdPlaceholder}
          disabled={busy}
          className="flex-1 h-touch-target bg-surface-container-lowest border border-outline-variant rounded-lg px-3 font-mono text-body-sm disabled:opacity-50"
        />
      </div>

      <canvas
        ref={canvasRef}
        className="w-full max-w-sm rounded-lg border border-outline-variant self-center bg-surface-container-lowest"
      />

      {error && <p className="form-error">{error}</p>}

      {result &&
        ("fallbackToQr" in result ? (
          <div className="rounded-lg p-3 font-body-sm bg-status-rejected/15 text-status-rejected">
            {t.noConfidentMatch(result.match_score.toFixed(3))}
          </div>
        ) : (
          <div className="rounded-lg p-3 font-body-sm bg-status-success/15 text-status-success">
            {t.checkedInMatch(result.match_score?.toFixed(3) ?? t.notAvailable)}
          </div>
        ))}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => void handlePreview()}
          disabled={busy || !camUrl.trim()}
          className="h-touch-target px-6 border border-outline text-primary hover:bg-surface-container-highest disabled:opacity-50 rounded-full font-label-md text-label-md transition-colors"
        >
          {status === "loading-preview" ? t.loadingPreview : t.preview}
        </button>
        <button
          type="button"
          onClick={() => void handleCapture()}
          disabled={busy || !camUrl.trim() || !traineeId.trim() || !sessionId.trim()}
          className="h-touch-target px-6 bg-cta text-on-primary hover:bg-cta-hover disabled:opacity-50 rounded-full font-label-md text-label-md transition-colors"
        >
          {status === "capturing" ? t.capturing : status === "submitting" ? t.submitting : t.captureAndCheckIn}
        </button>
      </div>
    </section>
  );
}
