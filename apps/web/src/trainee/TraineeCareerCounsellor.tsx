import { askCareerCounsellor } from "@ncct/api-client";
import type { CareerCounsellorAnswer } from "@ncct/shared-types";
import { useState } from "react";
import { useLocale, type Locale } from "../i18n/LocaleContext.js";

interface TraineeCareerCounsellorProps {
  accessToken: string;
}

interface Turn {
  question: string;
  result: CareerCounsellorAnswer | null;
  error: string | null;
}

interface TraineeCareerCounsellorText {
  heading: string;
  subheading: string;
  emptyPrompt: string;
  contextUsed: string;
  checked: (label: string) => string;
  reviewing: string;
  placeholder: string;
  disclaimer: string;
}

const content: Record<Locale, TraineeCareerCounsellorText> = {
  en: {
    heading: "Ask a Counsellor",
    subheading: "Live, personalized guidance based on your profile. Not a generic FAQ.",
    emptyPrompt: "Ask about your own certificates, skill gaps, or which programme to take next.",
    contextUsed: "Context used for this answer:",
    checked: (label) => `Checked: ${label}`,
    reviewing: "Counsellor is reviewing your profile",
    placeholder: "Type your career question here…",
    disclaimer:
      "This is AI-assisted guidance based on your platform activity — not a substitute for professional career counselling.",
  },
  hi: {
    heading: "काउंसलर से पूछें",
    subheading: "आपकी प्रोफ़ाइल पर आधारित लाइव, व्यक्तिगत मार्गदर्शन। यह सामान्य FAQ नहीं है।",
    emptyPrompt: "अपने प्रमाणपत्रों, कौशल-अंतर, या आगे कौन-सा कार्यक्रम लें, इसके बारे में पूछें।",
    contextUsed: "इस उत्तर के लिए उपयोग किया गया संदर्भ:",
    checked: (label) => `जांचा गया: ${label}`,
    reviewing: "काउंसलर आपकी प्रोफ़ाइल की समीक्षा कर रहा है",
    placeholder: "यहां अपना करियर प्रश्न लिखें…",
    disclaimer:
      "यह आपकी प्लेटफ़ॉर्म गतिविधि पर आधारित AI-सहायता प्राप्त मार्गदर्शन है — यह पेशेवर करियर परामर्श का विकल्प नहीं है।",
  },
};

// This is the fixed, known set of tools careerCounsellorService.ts exposes
// to the model (see apps/api/src/careerCounsellorService.ts) — translating
// by raw tool name rather than re-deriving from formatToolLabel's English
// output keeps the Hindi labels correct even if the English derivation
// ever changes.
const TOOL_LABELS: Record<Locale, Record<string, string>> = {
  en: {
    get_my_profile: "profile",
    list_my_certificates: "my certificates",
    list_my_nominations: "my nominations",
    list_open_programmes: "open programmes",
    list_open_jobs: "open jobs",
    get_my_skill_gap_for_job: "skill gap for job",
  },
  hi: {
    get_my_profile: "प्रोफ़ाइल",
    list_my_certificates: "मेरे प्रमाणपत्र",
    list_my_nominations: "मेरे नामांकन",
    list_open_programmes: "खुले कार्यक्रम",
    list_open_jobs: "खुली नौकरियां",
    get_my_skill_gap_for_job: "नौकरी हेतु कौशल-अंतर",
  },
};

// P2 AI Career Counsellor (docs/PRD.md §6.12, promoted from Phase-2 — see
// docs/DECISIONS.md #27), re-skinned
// (design/stitch_ncct_trainee_portal/career_ask_a_counsellor). Every
// assistant turn shows its toolCalls as provenance tags — this is
// deliberate transparency (which of the trainee's own data this specific
// answer is grounded in), not decoration, per DECISIONS.md #27. Distinct
// from ChatbotPanel.tsx (F7): that one is a shared, non-personalized FAQ
// lookup and is intentionally not merged with this screen.
export function TraineeCareerCounsellor({ accessToken }: TraineeCareerCounsellorProps) {
  const { locale } = useLocale();
  const t = content[locale];
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);

  async function handleAsk(e: React.FormEvent) {
    e.preventDefault();
    const asked = question.trim();
    if (!asked) return;
    setBusy(true);
    setQuestion("");
    try {
      const result = await askCareerCounsellor(accessToken, asked);
      setTurns((prev) => [...prev, { question: asked, result, error: null }]);
    } catch (err) {
      setTurns((prev) => [...prev, { question: asked, result: null, error: (err as Error).message }]);
    } finally {
      setBusy(false);
    }
  }

  function formatToolLabel(tool: string): string {
    return TOOL_LABELS[locale][tool] ?? tool.replace(/^get_my_|^list_/, "").replace(/_/g, " ");
  }

  return (
    <div className="flex flex-col gap-6 py-6 md:py-8">
      <div className="border-b border-border-low-contrast pb-4">
        <h1 className="font-headline text-headline-lg text-primary">{t.heading}</h1>
        <p className="text-body-md text-on-surface-variant">{t.subheading}</p>
      </div>

      <div className="flex flex-col overflow-hidden rounded-xl border border-border-low-contrast bg-surface-card">
        <div className="flex flex-col gap-6 p-4 md:p-6">
          {turns.length === 0 && (
            <p className="text-center text-body-md text-on-surface-variant">{t.emptyPrompt}</p>
          )}

          {turns.map((turn, index) => (
            <div key={index} className="flex flex-col gap-3">
              <div className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-tr-none bg-primary-container p-4 text-on-primary-container shadow-sm md:max-w-[70%]">
                  <p className="text-body-md">{turn.question}</p>
                </div>
              </div>

              {turn.error && (
                <p className="rounded-lg border border-status-rejected/30 bg-red-50 p-3 text-body-md text-status-rejected">
                  {turn.error}
                </p>
              )}

              {turn.result && (
                <div className="flex justify-start">
                  <div className="flex max-w-[90%] gap-3 md:max-w-[75%]">
                    <div className="mt-1 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-secondary-fixed">
                      <span className="material-symbols-outlined text-[18px] text-secondary">
                        support_agent
                      </span>
                    </div>
                    <div className="rounded-2xl rounded-tl-none border border-border-low-contrast bg-surface-container-low p-4 shadow-sm">
                      <p className="whitespace-pre-wrap text-body-md text-on-surface">{turn.result.answer}</p>
                      {turn.result.toolCalls.length > 0 && (
                        <div className="mt-4 border-t border-dashed border-border-low-contrast pt-3">
                          <p className="mb-2 flex items-center gap-1 text-label-sm text-outline">
                            <span className="material-symbols-outlined text-[14px]">info</span>
                            {t.contextUsed}
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {turn.result.toolCalls.map((call, callIndex) => (
                              <span
                                key={callIndex}
                                className="inline-flex items-center gap-1 rounded-md bg-surface-variant px-2 py-1 text-label-sm text-on-surface-variant"
                              >
                                <span className="material-symbols-outlined text-[14px] text-status-shortlisted">
                                  check_circle
                                </span>
                                {t.checked(formatToolLabel(call.tool))}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}

          {busy && (
            <div className="flex justify-start opacity-70">
              <div className="flex gap-3">
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-secondary-fixed">
                  <span className="material-symbols-outlined text-[18px] text-secondary">psychology</span>
                </div>
                <div className="flex items-center gap-2 rounded-2xl rounded-tl-none border border-border-low-contrast bg-surface-container-low px-4 py-3 shadow-sm">
                  <span className="text-label-sm text-on-surface-variant">{t.reviewing}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        <form onSubmit={(e) => void handleAsk(e)} className="border-t border-border-low-contrast bg-surface-card p-4">
          <div className="relative flex items-center">
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder={t.placeholder}
              maxLength={500}
              className="min-h-touch-target w-full rounded-full border-none bg-surface-container-low py-3 pr-14 pl-4 text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <button
              type="submit"
              disabled={busy || !question.trim()}
              className="absolute right-2 flex h-10 w-10 items-center justify-center rounded-full bg-secondary text-on-secondary shadow-sm transition-colors hover:bg-secondary-container hover:text-on-secondary-container disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span className="material-symbols-outlined">send</span>
            </button>
          </div>
          <p className="mt-3 px-4 text-center text-label-sm text-outline">{t.disclaimer}</p>
        </form>
      </div>
    </div>
  );
}
