import { createCorpusChunk, deleteCorpusChunk, getCorpusChunks } from "@ncct/api-client";
import { CHATBOT_SOURCE_TYPES } from "@ncct/constants";
import type { ChatbotCorpusChunk, ChatbotSourceType } from "@ncct/shared-types";
import { useEffect, useState } from "react";

interface ChatbotCorpusManagerProps {
  accessToken: string;
}

// Bare-bones corpus authoring: paste a chunk of programme/FAQ text, it gets
// embedded server-side on save. Same "minimal admin UI, not a full authoring
// experience" scope as the rest of this repo's admin panels.
export function ChatbotCorpusManager({ accessToken }: ChatbotCorpusManagerProps) {
  const [chunks, setChunks] = useState<ChatbotCorpusChunk[]>([]);
  const [sourceType, setSourceType] = useState<ChatbotSourceType>("faq");
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadChunks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  async function loadChunks() {
    setError(null);
    try {
      setChunks(await getCorpusChunks(accessToken));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await createCorpusChunk(accessToken, { source_type: sourceType, content: content.trim() });
      setContent("");
      await loadChunks();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: string) {
    setError(null);
    try {
      await deleteCorpusChunk(accessToken, id);
      await loadChunks();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <section className="attendance-panel">
      <h2>Chatbot knowledge base</h2>
      <p>
        Text the chatbot is allowed to answer from. It answers only from this material — anything
        not covered here gets a "I don't have that information" reply.
      </p>

      {error && <p className="form-error">{error}</p>}

      <form className="question-form" onSubmit={(e) => void handleAdd(e)}>
        <label>
          Source type
          <select
            value={sourceType}
            onChange={(e) => setSourceType(e.target.value as ChatbotSourceType)}
          >
            {CHATBOT_SOURCE_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>
        <label>
          Content
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={4}
            maxLength={4000}
            placeholder="e.g. Eligibility: programmes are open to members of registered cooperative societies aged 18+."
          />
        </label>
        <button type="submit" disabled={busy || !content.trim()}>
          {busy ? "Embedding..." : "Add to knowledge base"}
        </button>
      </form>

      <ul>
        {chunks.map((chunk) => (
          <li key={chunk.id} className="lesson-row">
            <div className="lesson-row-main">
              <span className="role-badge">{chunk.source_type}</span>
              <button type="button" onClick={() => void handleDelete(chunk.id)}>
                Delete
              </button>
            </div>
            <span>{chunk.content}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
