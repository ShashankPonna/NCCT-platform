import { getAttendanceQr, getAttendanceRoster, getSessionByCode } from "@ncct/api-client";
import type { AttendanceRecord } from "@ncct/shared-types";
import { useState } from "react";
import { useLocale, type Locale } from "./i18n/LocaleContext.js";
import { KioskFaceCheckIn } from "./KioskFaceCheckIn.js";

interface AttendanceManagerProps {
  accessToken: string;
}

type RosterRow = AttendanceRecord & { profiles: { full_name: string | null } | null };

interface AttendanceManagerText {
  heading: string;
  subheading: string;
  sessionControls: string;
  sessionIdLabel: string;
  sessionIdPlaceholder: string;
  generateQr: string;
  loadRoster: string;
  liveRoster: string;
  checkedIn: (count: number) => string;
  noRecords: string;
  colTraineeName: string;
  colMethod: string;
  colMatchScore: string;
  colRecordedAt: string;
  traineeFallback: (idPrefix: string) => string;
  needsReview: string;
  scanToCheckIn: string;
  scanInstructions: string;
  sessionCode: string;
  sessionCodeHint: string;
  directUrl: string;
  linkCopied: string;
  copyLink: string;
  method: Record<string, string>;
}

const content: Record<Locale, AttendanceManagerText> = {
  en: {
    heading: "Session Attendance",
    subheading: "Manage live check-ins, generate QR passes, and verify trainee presence.",
    sessionControls: "Session Controls",
    sessionIdLabel: "Session Code",
    sessionIdPlaceholder: "Enter the 6-digit session code...",
    generateQr: "Generate QR",
    loadRoster: "Load Roster",
    liveRoster: "Live Roster",
    checkedIn: (count) => `${count} Checked In`,
    noRecords: "No attendance records logged for this session yet.",
    colTraineeName: "Trainee Name",
    colMethod: "Method",
    colMatchScore: "Match Score",
    colRecordedAt: "Recorded At",
    traineeFallback: (idPrefix) => `Trainee #${idPrefix}`,
    needsReview: "(Needs Review)",
    scanToCheckIn: "Scan to Check-in",
    scanInstructions: "Trainees can scan this QR code with the camera or mobile app.",
    sessionCode: "Session Code",
    sessionCodeHint: "Share this instead of the QR — trainees can type it in by hand.",
    directUrl: "Direct Check-in URL",
    linkCopied: "Link Copied!",
    copyLink: "Copy Check-in Link",
    method: { qr: "QR", face: "Face" },
  },
  hi: {
    heading: "सत्र उपस्थिति",
    subheading: "लाइव चेक-इन प्रबंधित करें, QR पास बनाएं, और प्रशिक्षणार्थी उपस्थिति सत्यापित करें।",
    sessionControls: "सत्र नियंत्रण",
    sessionIdLabel: "सत्र कोड",
    sessionIdPlaceholder: "6-अंकीय सत्र कोड दर्ज करें...",
    generateQr: "QR बनाएं",
    loadRoster: "रोस्टर लोड करें",
    liveRoster: "लाइव रोस्टर",
    checkedIn: (count) => `${count} चेक-इन हुए`,
    noRecords: "इस सत्र के लिए अभी तक कोई उपस्थिति रिकॉर्ड दर्ज नहीं हुआ है।",
    colTraineeName: "प्रशिक्षणार्थी का नाम",
    colMethod: "तरीका",
    colMatchScore: "मिलान स्कोर",
    colRecordedAt: "दर्ज समय",
    traineeFallback: (idPrefix) => `प्रशिक्षणार्थी #${idPrefix}`,
    needsReview: "(समीक्षा आवश्यक)",
    scanToCheckIn: "चेक-इन के लिए स्कैन करें",
    scanInstructions: "प्रशिक्षणार्थी कैमरे या मोबाइल ऐप से इस QR कोड को स्कैन कर सकते हैं।",
    sessionCode: "सत्र कोड",
    sessionCodeHint: "QR के बजाय इसे साझा करें — प्रशिक्षणार्थी इसे हाथ से टाइप कर सकते हैं।",
    directUrl: "सीधा चेक-इन URL",
    linkCopied: "लिंक कॉपी हो गया!",
    copyLink: "चेक-इन लिंक कॉपी करें",
    method: { qr: "QR", face: "फेस" },
  },
};

export function AttendanceManager({ accessToken }: AttendanceManagerProps) {
  const { locale } = useLocale();
  const t = content[locale];
  const [sessionCode, setSessionCode] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [checkInUrl, setCheckInUrl] = useState<string | null>(null);
  const [checkInCode, setCheckInCode] = useState<string | null>(null);
  const [roster, setRoster] = useState<RosterRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  // Faculty type the short code, not the session's real UUID — this resolves
  // it once per action so Generate QR / Load Roster / the kiosk below all
  // keep working against the real id internally.
  async function resolveSessionId(): Promise<string | null> {
    if (!sessionCode.trim()) return null;
    const session = await getSessionByCode(accessToken, sessionCode.trim());
    setSessionId(session.id);
    return session.id;
  }

  async function handleGenerateQr() {
    if (!sessionCode.trim()) return;
    setError(null);
    setBusy(true);
    try {
      const id = await resolveSessionId();
      if (!id) return;
      const result = await getAttendanceQr(accessToken, id);
      setQrDataUrl(result.qrDataUrl);
      setCheckInUrl(result.checkInUrl);
      setCheckInCode(result.checkInCode);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleLoadRoster() {
    if (!sessionCode.trim()) return;
    setError(null);
    setBusy(true);
    try {
      const id = await resolveSessionId();
      if (!id) return;
      const data = await getAttendanceRoster(accessToken, id);
      setRoster(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function handleCopyLink() {
    if (!checkInUrl) return;
    void navigator.clipboard.writeText(checkInUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="p-margin-mobile md:p-margin-desktop max-w-max-width-desktop mx-auto w-full flex flex-col gap-8 text-left">
      {/* Page Header */}
      <header className="border-b border-outline-variant pb-4">
        <h1 className="font-headline-lg-mobile md:font-headline-lg text-headline-lg-mobile md:text-headline-lg text-on-surface m-0">
          {t.heading}
        </h1>
        <p className="font-body-md text-body-md text-on-surface-variant mt-1">{t.subheading}</p>
      </header>

      {error && (
        <div className="bg-error-container text-on-error-container p-4 rounded-xl flex items-center gap-3 border border-error/20">
          <span className="material-symbols-outlined text-error">error</span>
          <p className="font-body-md text-body-md">{error}</p>
        </div>
      )}

      {/* Bento Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-gutter items-start">
        {/* Left Column: Controls & Roster (Span 8 or 12 if no QR) */}
        <div className={`${qrDataUrl ? "lg:col-span-8" : "lg:col-span-12"} flex flex-col gap-gutter`}>
          {/* Session Configuration Card */}
          <section className="bg-surface-card border border-outline-variant rounded-xl p-6 shadow-sm">
            <h2 className="font-headline-sm text-headline-sm text-on-surface mb-6 flex items-center gap-2 m-0">
              <span className="material-symbols-outlined text-primary">settings_suggest</span>
              {t.sessionControls}
            </h2>
            <div className="flex flex-col md:flex-row gap-4 items-end">
              <div className="flex-1 w-full flex flex-col gap-2">
                <label htmlFor="sessionId" className="font-label-md text-label-md text-on-surface">
                  {t.sessionIdLabel}
                </label>
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-[20px]">
                    tag
                  </span>
                  <input
                    id="sessionId"
                    value={sessionCode}
                    onChange={(e) => setSessionCode(e.target.value)}
                    placeholder={t.sessionIdPlaceholder}
                    inputMode="numeric"
                    maxLength={6}
                    className="w-full h-touch-target bg-surface-container-lowest border border-outline-variant rounded-lg px-3 pl-10 font-body-md text-body-md text-on-surface focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-shadow"
                    type="text"
                  />
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
                <button
                  type="button"
                  disabled={busy || !sessionCode.trim()}
                  onClick={() => void handleGenerateQr()}
                  className="h-touch-target px-6 bg-cta text-on-primary hover:bg-cta-hover disabled:opacity-50 rounded-full font-label-md text-label-md transition-colors flex items-center justify-center gap-2 whitespace-nowrap shadow-sm cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[18px]">qr_code</span>
                  {t.generateQr}
                </button>
                <button
                  type="button"
                  disabled={busy || !sessionCode.trim()}
                  onClick={() => void handleLoadRoster()}
                  className="h-touch-target px-6 bg-transparent border border-outline text-primary hover:bg-surface-container-high disabled:opacity-50 rounded-full font-label-md text-label-md transition-colors flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[18px]">group</span>
                  {t.loadRoster}
                </button>
              </div>
            </div>
          </section>

          <KioskFaceCheckIn accessToken={accessToken} sessionId={sessionId ?? ""} />

          {/* Attendance Roster Table Card */}
          {roster && (
            <section className="bg-surface-card border border-outline-variant rounded-xl overflow-hidden shadow-sm">
              <div className="p-6 border-b border-outline-variant flex justify-between items-center bg-surface-bright">
                <h2 className="font-headline-sm text-headline-sm text-on-surface flex items-center gap-2 m-0">
                  <span className="material-symbols-outlined text-primary">fact_check</span>
                  {t.liveRoster}
                </h2>
                <span className="bg-secondary-container text-on-secondary-container px-3 py-1 rounded-full font-label-sm text-label-sm font-bold">
                  {t.checkedIn(roster.length)}
                </span>
              </div>

              {roster.length === 0 ? (
                <div className="p-8 text-center text-on-surface-variant font-body-sm">{t.noRecords}</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-surface-container-low border-b border-outline-variant">
                        <th className="p-4 font-label-md text-label-md text-on-surface-variant uppercase font-medium">
                          {t.colTraineeName}
                        </th>
                        <th className="p-4 font-label-md text-label-md text-on-surface-variant uppercase font-medium">
                          {t.colMethod}
                        </th>
                        <th className="p-4 font-label-md text-label-md text-on-surface-variant uppercase font-medium">
                          {t.colMatchScore}
                        </th>
                        <th className="p-4 font-label-md text-label-md text-on-surface-variant uppercase font-medium">
                          {t.colRecordedAt}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="font-body-sm text-body-sm text-on-surface divide-y divide-outline-variant">
                      {roster.map((row) => {
                        const traineeName =
                          row.profiles?.full_name ?? t.traineeFallback(row.trainee_id.slice(0, 8));
                        const initials = traineeName.slice(0, 2).toUpperCase();
                        const isFace = row.method === "face";
                        const isReview = isFace && (row.match_score ?? 1) < 0.6;

                        return (
                          <tr
                            key={row.id}
                            className={`hover:bg-surface-container-lowest transition-colors ${
                              isReview ? "bg-error-container/20" : ""
                            }`}
                          >
                            <td className="p-4 flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-primary-fixed text-on-primary-fixed flex items-center justify-center font-bold text-xs">
                                {initials}
                              </div>
                              <span className="font-medium text-primary">{traineeName}</span>
                            </td>
                            <td className="p-4">
                              <span
                                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full font-label-sm text-label-sm border uppercase font-bold ${
                                  isFace
                                    ? isReview
                                      ? "bg-status-rejected/15 text-status-rejected border-status-rejected/30"
                                      : "bg-status-success/15 text-status-success border-status-success/30"
                                    : "bg-tertiary-container/15 text-tertiary-container border-tertiary-container/30"
                                }`}
                              >
                                <span className="material-symbols-outlined text-[14px]">
                                  {isFace ? "face" : "qr_code_2"}
                                </span>
                                {t.method[row.method] ?? row.method}
                              </span>
                            </td>
                            <td className="p-4 font-mono">
                              {row.match_score != null ? (
                                <span className={isReview ? "text-status-rejected font-bold" : ""}>
                                  {row.match_score.toFixed(3)}
                                </span>
                              ) : (
                                <span className="text-outline">—</span>
                              )}
                            </td>
                            <td className="p-4 text-on-surface-variant">
                              {new Date(row.recorded_at).toLocaleTimeString(locale === "hi" ? "hi-IN" : undefined, {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                              {isReview && (
                                <span className="text-status-rejected font-bold ml-2 text-xs">
                                  {t.needsReview}
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}
        </div>

        {/* Right Column: QR Code Display (Span 4) */}
        {qrDataUrl && (
          <div className="lg:col-span-4">
            <section className="bg-surface-card border border-outline-variant rounded-xl p-6 flex flex-col items-center text-center shadow-sm">
              <h2 className="font-headline-sm text-headline-sm text-on-surface mb-2 m-0">{t.scanToCheckIn}</h2>
              <p className="font-body-sm text-body-sm text-on-surface-variant mb-6">{t.scanInstructions}</p>
              <div className="bg-surface-container-lowest border-2 border-outline-variant p-4 rounded-xl mb-6 shadow-sm">
                <img
                  src={qrDataUrl}
                  alt="Session check-in QR code"
                  className="w-48 h-48 object-contain"
                />
              </div>
              {checkInCode && (
                <div className="w-full bg-primary-container p-4 rounded-lg text-center mb-4">
                  <p className="font-label-sm text-label-sm text-on-primary-container mb-1 uppercase tracking-wider">
                    {t.sessionCode}
                  </p>
                  <p className="font-mono text-3xl tracking-[0.3em] text-on-primary-container font-bold">
                    {checkInCode}
                  </p>
                  <p className="font-body-sm text-body-sm text-on-primary-container/80 mt-1">
                    {t.sessionCodeHint}
                  </p>
                </div>
              )}
              <div className="w-full bg-surface-container p-4 rounded-lg text-left">
                <p className="font-label-sm text-label-sm text-outline mb-1 uppercase tracking-wider">
                  {t.directUrl}
                </p>
                <p className="font-mono text-[12px] text-primary break-all bg-surface-container-lowest p-2 rounded border border-outline-variant select-all">
                  {checkInUrl}
                </p>
              </div>
              <button
                type="button"
                onClick={handleCopyLink}
                className="mt-4 w-full h-touch-target border border-outline text-primary hover:bg-surface-container-highest rounded-full font-label-md text-label-md transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">
                  {copied ? "check" : "content_copy"}
                </span>
                {copied ? t.linkCopied : t.copyLink}
              </button>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
