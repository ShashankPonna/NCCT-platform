import { checkInWithQr, getSessionByCode, type AttendanceCheckInResult } from "@ncct/api-client";
import { useEffect, useState } from "react";
import { FaceEnrollment } from "../FaceEnrollment.js";
import { useLocale, type Locale } from "../i18n/LocaleContext.js";
import { useOnlineStatus } from "../offline/network.js";
import { enqueueWrite } from "../offline/syncManager.js";
import { ErrorBanner } from "./pieces.js";

interface TraineeAttendanceProps {
  accessToken: string;
  autoCheckInSessionId?: string;
}

interface TraineeAttendanceText {
  heading: string;
  subheading: string;
  offlineNotice: string;
  sessionIdLabel: string;
  sessionIdPlaceholder: string;
  checkInButton: string;
  faceIdHeading: string;
  faceIdBody: string;
  queuedNotice: string;
  notMatched: (score: string) => string;
  checkedIn: (method: string, time: string) => string;
}

const content: Record<Locale, TraineeAttendanceText> = {
  en: {
    heading: "Mark Attendance",
    subheading: "Enter the session code your trainer shared, or scan its QR code.",
    offlineNotice: "You're offline — check-in will be saved and sent once you're back online.",
    sessionIdLabel: "Session Code",
    sessionIdPlaceholder: "6-digit code",
    checkInButton: "Check In",
    faceIdHeading: "Face ID",
    faceIdBody:
      "Enroll once here, on your own device. Staff at an institution kiosk can then verify your face against this enrollment to check you in — you never need to use your own camera for check-in itself.",
    queuedNotice: "Check-in saved — it will be sent once you're back online.",
    notMatched: (score) => `Check-in couldn't be confirmed (score ${score}). Please try QR check-in again.`,
    checkedIn: (method, time) => `Checked in via ${method} at ${time}.`,
  },
  hi: {
    heading: "उपस्थिति दर्ज करें",
    subheading: "अपने प्रशिक्षक द्वारा साझा किया गया सत्र कोड दर्ज करें, या इसका QR कोड स्कैन करें।",
    offlineNotice: "आप ऑफ़लाइन हैं — चेक-इन सहेजा जाएगा और ऑनलाइन आते ही भेजा जाएगा।",
    sessionIdLabel: "सत्र कोड",
    sessionIdPlaceholder: "6-अंकीय कोड",
    checkInButton: "चेक इन करें",
    faceIdHeading: "फेस आईडी",
    faceIdBody:
      "यहां अपने डिवाइस पर एक बार नामांकन करें। संस्थान कियोस्क पर स्टाफ फिर आपको चेक-इन करने के लिए इस नामांकन के विरुद्ध आपके चेहरे को सत्यापित कर सकता है — चेक-इन के लिए आपको कभी भी अपने कैमरे का उपयोग करने की आवश्यकता नहीं है।",
    queuedNotice: "चेक-इन सहेजा गया — ऑनलाइन आते ही यह भेजा जाएगा।",
    notMatched: (score) => `चेक-इन की पुष्टि नहीं हो सकी (स्कोर ${score})। कृपया पुनः QR चेक-इन आज़माएं।`,
    checkedIn: (method, time) => `${method} के माध्यम से ${time} पर चेक-इन हुआ।`,
  },
};

// Check-in itself is QR-only here — see DECISIONS.md #21. Face-recognition
// attendance *matching* runs from an ESP32-CAM at an institution kiosk, not
// a trainee's own device, so FaceCapture's getUserMedia flow was removed
// from check-in specifically. Enrollment is different: it's a one-time,
// consent-gated identity action that only makes sense as trainee
// self-service (their own device, their own explicit consent per CLAUDE.md's
// DPDP Act 2023 rule) — re-added below (DECISIONS.md #32) as what a staff
// kiosk's face check-in verifies against.
export function TraineeAttendance({ accessToken, autoCheckInSessionId }: TraineeAttendanceProps) {
  const { locale } = useLocale();
  const t = content[locale];
  const [sessionCode, setSessionCode] = useState("");
  const [result, setResult] = useState<AttendanceCheckInResult | null>(null);
  const [queued, setQueued] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const online = useOnlineStatus();

  useEffect(() => {
    if (autoCheckInSessionId) {
      void handleQrCheckIn(autoCheckInSessionId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoCheckInSessionId]);

  async function handleQrCheckIn(id: string) {
    if (!id) return;
    setError(null);
    setResult(null);
    setQueued(false);

    // A QR check-in scanned while offline (a session at a venue with no
    // signal, exactly the PRD §7 low-bandwidth context) still records the
    // moment it actually happened — queued with that timestamp — rather
    // than failing outright or silently doing nothing.
    if (!online) {
      await enqueueWrite({ type: "qr_checkin", queuedAt: new Date().toISOString(), sessionId: id });
      setQueued(true);
      return;
    }

    setBusy(true);
    try {
      setResult(await checkInWithQr(accessToken, id));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // Manual fallback: resolve the short code the trainer shared to the
  // session's real id, then check in exactly as the QR-scan path does.
  async function handleCodeCheckIn() {
    if (!sessionCode.trim()) return;
    setError(null);
    setBusy(true);
    try {
      const session = await getSessionByCode(accessToken, sessionCode.trim());
      await handleQrCheckIn(session.id);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center gap-8 py-6 md:py-8">
      <div className="text-center">
        <h1 className="font-headline text-headline-lg-mobile text-primary md:text-headline-lg">
          {t.heading}
        </h1>
        <p className="mt-2 text-body-md text-on-surface-variant">{t.subheading}</p>
      </div>

      {!online && (
        <div className="flex w-full items-center gap-2 rounded-lg border border-status-pending/30 bg-status-pending/10 p-3 text-label-md text-status-pending">
          <span className="material-symbols-outlined text-[18px]">cloud_off</span>
          {t.offlineNotice}
        </div>
      )}

      <div className="flex w-full flex-col gap-4 rounded-2xl border border-border-slate bg-surface-container-lowest p-6 shadow-xs">
        <label className="flex flex-col gap-2 font-label-md text-xs font-semibold text-slate-600">
          {t.sessionIdLabel}
          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={sessionCode}
            onChange={(e) => setSessionCode(e.target.value)}
            placeholder={t.sessionIdPlaceholder}
            className="min-h-touch-target rounded-xl border border-border-slate bg-paper px-4 py-3 font-metric-mono text-lg font-bold text-center tracking-widest text-primary focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </label>
        <button
          type="button"
          disabled={busy || !sessionCode.trim()}
          onClick={() => void handleCodeCheckIn()}
          className="flex min-h-touch-target items-center justify-center gap-2 rounded-xl bg-secondary hover:bg-secondary-dark py-3.5 font-label-md text-sm font-bold text-white transition-all shadow-xs active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span className="material-symbols-outlined text-[20px]">qr_code_scanner</span>
          {t.checkInButton}
        </button>
      </div>

      <ErrorBanner message={error} />

      <div className="flex w-full flex-col gap-4 rounded-2xl border border-border-slate bg-surface-container-lowest p-6 shadow-xs">
        <div>
          <h2 className="font-headline text-lg font-bold text-ink">{t.faceIdHeading}</h2>
          <p className="mt-1 font-body text-xs md:text-sm text-slate-600">{t.faceIdBody}</p>
        </div>
        <FaceEnrollment accessToken={accessToken} />
      </div>

      {queued && (
        <p className="w-full rounded-lg border border-interactive/30 bg-interactive/10 p-4 text-body-md text-interactive">
          {t.queuedNotice}
        </p>
      )}

      {result &&
        (result.matched === false ? (
          <p className="w-full rounded-lg border border-status-pending/30 bg-amber-50 p-4 text-body-md text-status-pending">
            {t.notMatched(result.match_score.toFixed(2))}
          </p>
        ) : (
          <p className="w-full rounded-lg border border-status-shortlisted/30 bg-emerald-50 p-4 text-body-md text-status-shortlisted">
            {t.checkedIn(result.method, new Date(result.recorded_at).toLocaleTimeString())}
          </p>
        ))}
    </div>
  );
}
