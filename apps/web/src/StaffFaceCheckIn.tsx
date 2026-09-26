import { ApiError, kioskFaceCheckIn } from "@ncct/api-client";
import type { AttendanceCheckInResult } from "@ncct/api-client";
import { useState } from "react";
import { FaceCapture } from "./FaceCapture.js";
import { useLocale, type Locale } from "./i18n/LocaleContext.js";

interface StaffFaceCheckInProps {
  accessToken: string;
  sessionId: string;
}

type Status = "idle" | "submitting" | "matched" | "no-match" | "duplicate" | "error";

interface StaffFaceCheckInText {
  heading: string;
  description: string;
  traineeIdPlaceholder: string;
  captureAndCheckIn: string;
  noConfidentMatch: (score: string) => string;
  checkedInMatch: (score: string) => string;
  notAvailable: string;
  alreadyCheckedIn: string;
}

const content: Record<Locale, StaffFaceCheckInText> = {
  en: {
    heading: "Face Check-in",
    description:
      "Requires the session ID above and the trainee's id (from an NFC tap on the Kiosk tab or the roster). Uses this device's own camera — start it, frame the trainee, then capture.",
    traineeIdPlaceholder: "Trainee ID (UUID)",
    captureAndCheckIn: "Capture & Check In",
    noConfidentMatch: (score) => `No confident match (score ${score}) — fall back to QR check-in`,
    checkedInMatch: (score) => `Checked in — match score ${score}`,
    notAvailable: "n/a",
    alreadyCheckedIn: "Already checked in for this session — no action needed.",
  },
  hi: {
    heading: "फेस चेक-इन",
    description:
      "ऊपर दिए गए सत्र आईडी और प्रशिक्षणार्थी की आईडी (कियोस्क टैब पर NFC टैप से या रोस्टर से) आवश्यक है। यह इसी डिवाइस के कैमरे का उपयोग करता है — शुरू करें, प्रशिक्षणार्थी को फ़्रेम करें, फिर कैप्चर करें।",
    traineeIdPlaceholder: "प्रशिक्षणार्थी आईडी (UUID)",
    captureAndCheckIn: "कैप्चर एवं चेक इन करें",
    noConfidentMatch: (score) => `कोई विश्वसनीय मिलान नहीं (स्कोर ${score}) — QR चेक-इन पर वापस जाएं`,
    checkedInMatch: (score) => `चेक-इन हो गया — मिलान स्कोर ${score}`,
    notAvailable: "उपलब्ध नहीं",
    alreadyCheckedIn: "इस सत्र के लिए पहले से ही चेक-इन हो चुका है — कोई कार्रवाई आवश्यक नहीं।",
  },
};

// F5 staff-operated face check-in (docs/DECISIONS.md #21, revised #51): a
// staff-operated screen has no trainee JWT to read an identity from, so
// trainee_id is typed here rather than inferred from the caller — same
// shift publicProfile.ts's NFC kiosk route already made for the same
// reason. Previously captured frames from a networked ESP32-CAM board
// (KioskFaceCheckIn.tsx, removed) — replaced with this device's own
// webcam via the same FaceCapture.tsx component the trainee-facing
// enrollment/self check-in screens already use, per direct user request:
// no separate camera board to buy, wire, flash, or reach over the local
// network. Submits to the exact same staff-only
// POST /timetable/:sessionId/kiosk-face-checkin route, which always
// recomputes the match server-side and never trusts a client verdict —
// unchanged by this swap, since the server has no way to know or care
// which camera produced the embedding it's given.
export function StaffFaceCheckIn({ accessToken, sessionId }: StaffFaceCheckInProps) {
  const { locale } = useLocale();
  const t = content[locale];
  const [traineeId, setTraineeId] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AttendanceCheckInResult | null>(null);

  async function handleCapture(embedding: number[]) {
    if (!traineeId.trim() || !sessionId.trim()) return;
    setError(null);
    setResult(null);
    setStatus("submitting");
    try {
      const res = await kioskFaceCheckIn(accessToken, sessionId.trim(), traineeId.trim(), embedding);
      setResult(res);
      setStatus(res.matched ? "matched" : "no-match");
    } catch (err) {
      // A 409 means this trainee already has an attendance record for this
      // session — not a camera/match failure. Reported as a distinct,
      // non-error state rather than the same red failure message every
      // other error gets, same reasoning as the ESP32-CAM version this
      // replaced.
      if (err instanceof ApiError && err.status === 409) {
        setStatus("duplicate");
        setError(null);
        return;
      }
      setError((err as Error).message);
      setStatus("error");
    }
  }

  return (
    <section className="bg-surface-card border border-outline-variant rounded-xl p-6 shadow-sm flex flex-col gap-4">
      <h2 className="font-headline-sm text-headline-sm text-on-surface flex items-center gap-2 m-0">
        <span className="material-symbols-outlined text-primary">photo_camera</span>
        {t.heading}
      </h2>
      <p className="font-body-sm text-body-sm text-on-surface-variant m-0">{t.description}</p>

      <input
        value={traineeId}
        onChange={(e) => setTraineeId(e.target.value)}
        placeholder={t.traineeIdPlaceholder}
        disabled={status === "submitting"}
        className="w-full h-touch-target bg-surface-container-lowest border border-outline-variant rounded-lg px-3 font-mono text-body-sm disabled:opacity-50"
      />

      <FaceCapture
        actionLabel={t.captureAndCheckIn}
        onCapture={(embedding) => void handleCapture(embedding)}
        disabled={!traineeId.trim() || !sessionId.trim() || status === "submitting"}
      />

      {error && <p className="form-error">{error}</p>}

      {status === "duplicate" && (
        <div className="rounded-lg p-3 font-body-sm bg-status-pending/15 text-status-pending">
          {t.alreadyCheckedIn}
        </div>
      )}

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
    </section>
  );
}
