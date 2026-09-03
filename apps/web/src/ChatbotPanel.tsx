import { askChatbot } from "@ncct/api-client";
import type { ChatbotAnswer } from "@ncct/shared-types";
import { useState } from "react";

interface ChatbotPanelProps {
  accessToken: string;
}

interface Turn {
  question: string;
  result: ChatbotAnswer | null;
  error: string | null;
}

// PRD §6.7: informational Q&A about programmes/eligibility/certification.
// The scope guardrails live in the server's system prompt (chatbotService),
// not here — this is just the conversation surface.
export function ChatbotPanel({ accessToken }: ChatbotPanelProps) {
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
      <h2>Ask about programmes</h2>
      <p>
        Questions about programmes, eligibility, and certification. Answers come only from the
        official programme material.
      </p>

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
                    <summary>Based on {turn.result.sources.length} source(s)</summary>
                    <ul>
                      {turn.result.sources.map((source) => (
                        <li key={source.id}>
                          {source.content} <em>({(source.similarity * 100).toFixed(0)}% match)</em>
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
          Your question
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Who can enroll in these programmes?"
            maxLength={500}
          />
        </label>
        <button type="submit" disabled={busy || !question.trim()}>
          {busy ? "Thinking..." : "Ask"}
        </button>
      </form>
    </section>
  );
}
