import { askChatbot } from "@ncct/api-client";
import type { ChatbotAnswer } from "@ncct/shared-types";
import { useEffect, useId, useRef, useState } from "react";
import { useLocale, type Locale } from "./i18n/LocaleContext.js";
import { isNetworkError } from "./offline/network.js";

interface ChatbotPanelProps {
  accessToken: string;
  // The floating launcher (TraineeApp.tsx) already renders its own title bar
  // inside a ~380px popup, so it asks for the tighter layout without the
  // page heading.
  compact?: boolean;
}

interface Turn {
  question: string;
  result: ChatbotAnswer | null;
  error: string | null;
}

interface ChatbotPanelText {
  heading: string;
  subheading: string;
  emptyTitle: string;
  emptyPrompt: string;
  suggestions: string[];
  basedOnSources: (count: number) => string;
  matchPercent: (percent: number) => string;
  notFound: string;
  questionLabel: string;
  placeholder: string;
  thinking: string;
  ask: string;
  disclaimer: string;
  offlineReply: string;
}

const content: Record<Locale, ChatbotPanelText> = {
  en: {
    offlineReply: "You're offline. Ask again once you're connected.",
    heading: "Ask about programmes",
    subheading:
      "Questions about programmes, eligibility, and certification. Answers come only from the official programme material.",
    emptyTitle: "How can we help?",
    emptyPrompt:
      "Ask anything about programmes, eligibility, or certification — or start with one of these:",
    suggestions: [
      "Who can enroll in these programmes?",
      "How do I get my certificate?",
      "What is the attendance requirement?",
      "How long does a training programme last?",
    ],
    basedOnSources: (count) => `Based on ${count} source${count === 1 ? "" : "s"}`,
    matchPercent: (percent) => `${percent}% match`,
    notFound: "Not covered by the official programme material",
    questionLabel: "Your question",
    placeholder: "Who can enroll in these programmes?",
    thinking: "Searching programme material…",
    ask: "Ask",
    disclaimer: "For questions about your own progress or career, use Ask a Counsellor.",
  },
  hi: {
    offlineReply: "आप ऑफ़लाइन हैं। इंटरनेट से जुड़ने पर फिर से पूछें।",
    heading: "कार्यक्रमों के बारे में पूछें",
    subheading:
      "कार्यक्रमों, पात्रता और प्रमाणन के बारे में प्रश्न। उत्तर केवल आधिकारिक कार्यक्रम सामग्री से आते हैं।",
    emptyTitle: "हम कैसे मदद कर सकते हैं?",
    emptyPrompt:
      "कार्यक्रमों, पात्रता या प्रमाणन के बारे में कुछ भी पूछें — या इनमें से किसी से शुरू करें:",
    suggestions: [
      "इन कार्यक्रमों में कौन नामांकन कर सकता है?",
      "मुझे अपना प्रमाणपत्र कैसे मिलेगा?",
      "उपस्थिति की आवश्यकता क्या है?",
      "एक प्रशिक्षण कार्यक्रम कितने समय का होता है?",
    ],
    basedOnSources: (count) => `${count} स्रोत के आधार पर`,
    matchPercent: (percent) => `${percent}% मिलान`,
    notFound: "आधिकारिक कार्यक्रम सामग्री में शामिल नहीं",
    questionLabel: "आपका प्रश्न",
    placeholder: "इन कार्यक्रमों में कौन नामांकन कर सकता है?",
    thinking: "कार्यक्रम सामग्री खोजी जा रही है…",
    ask: "पूछें",
    disclaimer: "अपनी प्रगति या करियर से जुड़े प्रश्नों के लिए 'काउंसलर से पूछें' का उपयोग करें।",
  },
};

// PRD §6.7: informational Q&A about programmes/eligibility/certification.
// The scope guardrails live in the server's system prompt (chatbotService),
// not here — this is just the conversation surface. Visually mirrors
// TraineeCareerCounsellor.tsx (sibling Career tab) so the two chat screens
// read as one family, while staying a separate, non-personalized bot.
export function ChatbotPanel({ accessToken, compact = false }: ChatbotPanelProps) {
  const { locale } = useLocale();
  const t = content[locale];
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputId = useId();

  useEffect(() => {
    if (turns.length > 0 || busy)
      endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [turns.length, busy]);

  async function ask(asked: string) {
    if (!asked || busy) return;
    setBusy(true);
    setQuestion("");
    try {
      const result = await askChatbot(accessToken, asked);
      setTurns((prev) => [...prev, { question: asked, result, error: null }]);
    } catch (err) {
      setTurns((prev) => [
        ...prev,
        {
          question: asked,
          result: null,
          error: isNetworkError(err) ? t.offlineReply : (err as Error).message,
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    void ask(question.trim());
  }

  const suggestions = compact ? t.suggestions.slice(0, 3) : t.suggestions;

  return (
    <div className={`flex flex-col ${compact ? "gap-3" : "gap-6"}`}>
      {!compact && (
        <div className="flex items-start gap-3 border-b border-border-low-contrast pb-4">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-primary-container text-on-primary-container">
            <span className="material-symbols-outlined">menu_book</span>
          </div>
          <div>
            <h1 className="font-headline text-headline-lg text-primary">{t.heading}</h1>
            <p className="text-body-md text-on-surface-variant">{t.subheading}</p>
          </div>
        </div>
      )}

      <div
        className={`flex flex-col overflow-hidden ${
          compact ? "" : "rounded-xl border border-border-low-contrast bg-surface-card"
        }`}
      >
        <div
          className={`flex flex-col ${compact ? "gap-4" : "min-h-[320px] gap-6 p-4 md:p-6"}`}
          aria-live="polite"
        >
          {turns.length === 0 && !busy && (
            <div
              className={`flex flex-col items-center text-center ${compact ? "gap-3 py-2" : "gap-4 py-6"}`}
            >
              {!compact && (
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary-fixed">
                  <span className="material-symbols-outlined text-secondary">quiz</span>
                </div>
              )}
              <div>
                {!compact && (
                  <p className="font-headline text-headline-sm text-on-surface">{t.emptyTitle}</p>
                )}
                <p className="text-body-md text-on-surface-variant">
                  {compact ? t.subheading : t.emptyPrompt}
                </p>
              </div>
              <div className={`flex flex-wrap justify-center gap-2 ${compact ? "" : "max-w-2xl"}`}>
                {suggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => void ask(suggestion)}
                    className="inline-flex min-h-touch-target items-center gap-1.5 rounded-full border border-border-low-contrast bg-surface-container-low px-4 py-2 text-left text-label-md text-on-surface-variant transition-colors hover:border-primary hover:bg-primary-container hover:text-on-primary-container"
                  >
                    <span className="material-symbols-outlined text-[16px]">help</span>
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}

          {turns.map((turn, index) => (
            <div key={index} className="flex flex-col gap-3">
              <div className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-tr-none bg-primary-container p-3 text-on-primary-container shadow-sm md:max-w-[70%] md:p-4">
                  <p className="text-body-md">{turn.question}</p>
                </div>
              </div>

              {turn.error && (
                <p className="flex items-start gap-2 rounded-lg border border-status-rejected/30 bg-status-rejected/10 p-3 text-body-md text-status-rejected">
                  <span className="material-symbols-outlined text-[18px]">error</span>
                  {turn.error}
                </p>
              )}

              {turn.result && (
                <div className="flex justify-start">
                  <div
                    className={`flex gap-3 ${compact ? "max-w-full" : "max-w-[90%] md:max-w-[75%]"}`}
                  >
                    <div className="mt-1 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-secondary-fixed">
                      <span className="material-symbols-outlined text-[18px] text-secondary">
                        menu_book
                      </span>
                    </div>
                    <div className="min-w-0 rounded-2xl rounded-tl-none border border-border-low-contrast bg-surface-container-low p-3 shadow-sm md:p-4">
                      {!turn.result.answered && (
                        <p className="mb-2 inline-flex items-center gap-1 rounded-md bg-status-pending/10 px-2 py-1 text-label-sm text-status-pending">
                          <span className="material-symbols-outlined text-[14px]">info</span>
                          {t.notFound}
                        </p>
                      )}
                      <p className="whitespace-pre-wrap text-body-md text-on-surface">
                        {turn.result.answer}
                      </p>
                      {turn.result.sources.length > 0 && (
                        <details className="group mt-4 border-t border-dashed border-border-low-contrast pt-3">
                          <summary className="flex cursor-pointer list-none items-center gap-1 text-label-sm text-outline hover:text-on-surface-variant [&::-webkit-details-marker]:hidden">
                            <span className="material-symbols-outlined text-[14px]">
                              description
                            </span>
                            {t.basedOnSources(turn.result.sources.length)}
                            <span className="material-symbols-outlined text-[16px] transition-transform group-open:rotate-180">
                              expand_more
                            </span>
                          </summary>
                          <ul className="mt-2 flex flex-col gap-2">
                            {turn.result.sources.map((source) => (
                              <li
                                key={source.id}
                                className="rounded-lg border border-border-low-contrast bg-surface-card p-3 text-label-md text-on-surface-variant"
                              >
                                <span className="mb-1 inline-flex items-center gap-1 rounded-md bg-surface-variant px-2 py-0.5 text-label-sm text-on-surface-variant">
                                  <span className="material-symbols-outlined text-[14px] text-status-shortlisted">
                                    check_circle
                                  </span>
                                  {t.matchPercent(Math.round(source.similarity * 100))}
                                </span>
                                <p className="line-clamp-4">{source.content}</p>
                              </li>
                            ))}
                          </ul>
                        </details>
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
                  <span className="material-symbols-outlined animate-pulse text-[18px] text-secondary">
                    menu_book
                  </span>
                </div>
                <div className="flex items-center rounded-2xl rounded-tl-none border border-border-low-contrast bg-surface-container-low px-4 py-3 shadow-sm">
                  <span className="text-label-sm text-on-surface-variant">{t.thinking}</span>
                </div>
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        <form
          onSubmit={handleSubmit}
          className={`border-t border-border-low-contrast bg-surface-card ${compact ? "mt-3 pt-3" : "p-4"}`}
        >
          <div className="relative flex items-center">
            <label htmlFor={inputId} className="sr-only">
              {t.questionLabel}
            </label>
            {/* text-base (16px) keeps iOS from zooming the viewport on focus. */}
            <input
              id={inputId}
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder={t.placeholder}
              maxLength={500}
              className="min-h-touch-target w-full rounded-full border border-border-low-contrast bg-surface-container-low py-3 pr-14 pl-4 text-base text-on-surface placeholder:text-outline focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <button
              type="submit"
              disabled={busy || !question.trim()}
              aria-label={busy ? t.thinking : t.ask}
              className="absolute right-2 flex h-10 w-10 items-center justify-center rounded-full bg-secondary text-on-secondary shadow-sm transition-colors hover:bg-secondary-container hover:text-on-secondary-container disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span className="material-symbols-outlined">send</span>
            </button>
          </div>
          {!compact && (
            <p className="mt-3 px-4 text-center text-label-sm text-outline">{t.disclaimer}</p>
          )}
        </form>
      </div>
    </div>
  );
}
