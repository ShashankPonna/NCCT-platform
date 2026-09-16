import { askChatbot } from "@ncct/api-client";
import type { ChatbotAnswer } from "@ncct/shared-types";
import { useState } from "react";
import { useLocale, type Locale } from "./i18n/LocaleContext.js";

interface ChatbotPanelProps {
  accessToken: string;
}

interface Turn {
  question: string;
  result: ChatbotAnswer | null;
  error: string | null;
}

interface ChatbotPanelText {
  heading: string;
  subheading: string;
  basedOnSources: (count: number) => string;
  matchPercent: (percent: number) => string;
  questionLabel: string;
  placeholder: string;
  thinking: string;
  ask: string;
}

const content: Record<Locale, ChatbotPanelText> = {
  en: {
    heading: "Ask about programmes",
    subheading:
      "Questions about programmes, eligibility, and certification. Answers come only from the official programme material.",
    basedOnSources: (count) => `Based on ${count} source${count === 1 ? "" : "s"}`,
    matchPercent: (percent) => `(${percent}% match)`,
    questionLabel: "Your question",
    placeholder: "Who can enroll in these programmes?",
    thinking: "Thinking...",
    ask: "Ask",
  },
  hi: {
    heading: "कार्यक्रमों के बारे में पूछें",
    subheading:
      "कार्यक्रमों, पात्रता और प्रमाणन के बारे में प्रश्न। उत्तर केवल आधिकारिक कार्यक्रम सामग्री से आते हैं।",
    basedOnSources: (count) => `${count} स्रोत के आधार पर`,
    matchPercent: (percent) => `(${percent}% मिलान)`,
    questionLabel: "आपका प्रश्न",
    placeholder: "इन कार्यक्रमों में कौन नामांकन कर सकता है?",
    thinking: "सोच रहा है...",
    ask: "पूछें",
  },
};

// PRD §6.7: informational Q&A about programmes/eligibility/certification.
// The scope guardrails live in the server's system prompt (chatbotService),
// not here — this is just the conversation surface.
export function ChatbotPanel({ accessToken }: ChatbotPanelProps) {
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
      const result = await askChatbot(accessToken, asked);
      setTurns((prev) => [...prev, { question: asked, result, error: null }]);
    } catch (err) {
      setTurns((prev) => [...prev, { question: asked, result: null, error: (err as Error).message }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    // See AssessmentBuilder.tsx's identical comment: `legacy-ui` applied
    // directly here rather than relying on the caller (TraineeCareer only
    // wraps this in plain spacing utility classes), so the question input
    // gets real styling and doesn't trigger iOS's zoom-on-focus on mobile.
    <section className="attendance-panel legacy-ui">
      <h2>{t.heading}</h2>
      <p>{t.subheading}</p>

      <ol className="chat-log">
        {turns.map((turn, index) => (
          <li key={index} className="chat-turn">
            <p className="chat-question">{turn.question}</p>
            {turn.error && <p className="form-error">{turn.error}</p>}
            {turn.result && (
              <>
                <p className="chat-answer">{turn.result.answer}</p>
                {turn.result.sources.length > 0 && (
                  <details>
                    <summary>{t.basedOnSources(turn.result.sources.length)}</summary>
                    <ul>
                      {turn.result.sources.map((source) => (
                        <li key={source.id}>
                          {source.content} <em>{t.matchPercent(Math.round(source.similarity * 100))}</em>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </>
            )}
          </li>
        ))}
      </ol>

      <form className="inline-form" onSubmit={(e) => void handleAsk(e)}>
        <label>
          {t.questionLabel}
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={t.placeholder}
            maxLength={500}
          />
        </label>
        <button type="submit" disabled={busy || !question.trim()}>
          {busy ? t.thinking : t.ask}
        </button>
      </form>
    </section>
  );
}
