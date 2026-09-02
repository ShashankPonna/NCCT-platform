import { createCorpusChunk, deleteCorpusChunk, getCorpusChunks } from "@ncct/api-client";
import { CHATBOT_SOURCE_TYPES } from "@ncct/constants";
import type { ChatbotCorpusChunk, ChatbotSourceType } from "@ncct/shared-types";
import { useEffect, useState } from "react";

interface ChatbotCorpusManagerProps {
  accessToken: string;
}

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
    <div className="p-margin-mobile md:p-margin-desktop max-w-max-width-desktop mx-auto w-full flex flex-col gap-8 text-left">
      {/* Page Header */}
      <header className="border-b border-outline-variant pb-4">
        <h1 className="font-headline-lg-mobile md:font-headline-lg text-headline-lg-mobile md:text-headline-lg text-on-surface m-0">
          Chatbot Knowledge Base
        </h1>
        <p className="font-body-md text-body-md text-on-surface-variant mt-1">
          Author and manage verified training materials used for RAG responses.
        </p>
      </header>

      {/* Institutional Instructions Callout */}
      <section className="bg-surface-container-low border border-outline-variant rounded-xl p-5 shadow-xs">
        <div className="flex items-start gap-4">
          <span className="material-symbols-outlined text-primary text-[28px] shrink-0 mt-0.5">
            info
          </span>
          <div>
            <h3 className="font-headline-sm text-[16px] text-primary font-semibold m-0 mb-1">
              RAG Guardrails &amp; Constraints
            </h3>
            <p className="font-body-sm text-body-sm text-on-surface-variant m-0 leading-relaxed">
              The NCCT Chatbot relies exclusively on the verified chunks in this knowledge base. It will not hallucinate information outside these provided text fragments. Ensure chunks are clear, self-contained, and relevant to trainee inquiries.
            </p>
          </div>
        </div>
      </section>

      {error && (
        <div className="bg-error-container text-on-error-container p-4 rounded-xl flex items-center gap-3 border border-error/20">
          <span className="material-symbols-outlined text-error">error</span>
          <p className="font-body-md text-body-md">{error}</p>
        </div>
      )}

      {/* Bento Grid: Form (Col 1) and List (Col 2) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        {/* Add Chunk Form */}
        <section className="lg:col-span-1">
          <div className="bg-surface-card rounded-xl border border-outline-variant p-6 shadow-sm sticky top-6">
            <h2 className="font-headline-sm text-headline-sm text-on-surface mb-6 flex items-center gap-2 m-0">
              <span className="material-symbols-outlined text-primary">add_circle</span>
              Add New Chunk
            </h2>

            <form onSubmit={(e) => void handleAdd(e)} className="space-y-4">
              {/* Source Type */}
              <div>
                <label htmlFor="sourceType" className="block font-label-md text-label-md text-on-surface mb-2">
                  Source Type
                </label>
                <div className="relative">
                  <select
                    id="sourceType"
                    value={sourceType}
                    onChange={(e) => setSourceType(e.target.value as ChatbotSourceType)}
                    className="w-full bg-surface-container-lowest border border-outline-variant rounded-lg px-4 py-3 appearance-none focus:outline-none focus:ring-2 focus:ring-primary font-body-md text-body-md h-touch-target"
                  >
                    {CHATBOT_SOURCE_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type === "programme"
                          ? "Programme Detail"
                          : type === "faq"
                          ? "General FAQ"
                          : "Policy Document"}
                      </option>
                    ))}
                  </select>
                  <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-on-surface-variant">
                    expand_more
                  </span>
                </div>
              </div>

              {/* Text Area with Character Count */}
              <div>
                <div className="flex justify-between items-baseline mb-2">
                  <label htmlFor="chunkContent" className="block font-label-md text-label-md text-on-surface">
                    Content *
                  </label>
                  <span className="font-label-sm text-label-sm text-on-surface-variant">
                    {content.length} / 4000
                  </span>
                </div>
                <textarea
                  id="chunkContent"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  maxLength={4000}
                  rows={8}
                  placeholder="e.g. To enroll in Agricultural Sciences programmes, applicants must be registered cooperative members with secondary education..."
                  className="w-full bg-surface-container-lowest border border-outline-variant rounded-lg p-4 focus:outline-none focus:ring-2 focus:ring-primary font-body-md text-body-md resize-y"
                />
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={busy || !content.trim()}
                className="w-full bg-cta hover:bg-cta-hover text-on-primary rounded-lg font-label-md text-label-md h-touch-target flex items-center justify-center gap-2 transition-colors disabled:opacity-50 shadow-sm cursor-pointer"
              >
                <span className="material-symbols-outlined text-[20px]">upload</span>
                <span>{busy ? "Embedding..." : "Add to Knowledge Base"}</span>
              </button>
            </form>
          </div>
        </section>

        {/* List of Existing Entries */}
        <section className="lg:col-span-2 space-y-4">
          <div className="flex justify-between items-center mb-2">
            <h2 className="font-headline-sm text-headline-sm text-on-surface flex items-center gap-2 m-0">
              <span className="material-symbols-outlined text-primary">list_alt</span>
              Existing Entries ({chunks.length})
            </h2>
          </div>

          {chunks.length === 0 ? (
            <div className="p-8 text-center bg-surface-card rounded-xl border border-dashed border-outline-variant text-on-surface-variant">
              <span className="material-symbols-outlined text-[48px] text-outline opacity-40 mb-2">
                menu_book
              </span>
              <p className="font-body-md">Knowledge base is currently empty. Add your first chunk on the left.</p>
            </div>
          ) : (
            chunks.map((chunk) => {
              const badgeClass =
                chunk.source_type === "programme"
                  ? "bg-tertiary-fixed text-on-tertiary-fixed"
                  : chunk.source_type === "policy"
                  ? "bg-primary-fixed text-on-primary-fixed"
                  : "bg-secondary-fixed text-on-secondary-fixed";

              return (
                <article
                  key={chunk.id}
                  className="bg-surface-card rounded-xl border border-outline-variant p-6 hover:shadow-md transition-shadow group relative shadow-xs"
                >
                  <div className="flex justify-between items-start mb-3">
                    <span
                      className={`inline-flex items-center px-3 py-1 rounded-full font-label-sm text-label-sm uppercase tracking-wider font-bold ${badgeClass}`}
                    >
                      {chunk.source_type === "programme"
                        ? "Programme Detail"
                        : chunk.source_type === "policy"
                        ? "Policy Document"
                        : "General FAQ"}
                    </span>
                    <button
                      type="button"
                      onClick={() => void handleDelete(chunk.id)}
                      aria-label="Delete entry"
                      className="text-on-surface-variant hover:text-error transition-colors p-2 -mr-2 -mt-2 rounded-full hover:bg-error-container/20 cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[20px]">delete</span>
                    </button>
                  </div>

                  <p className="font-body-md text-body-md text-on-surface leading-relaxed whitespace-pre-wrap m-0">
                    {chunk.content}
                  </p>

                  <div className="mt-4 pt-3 border-t border-surface-variant flex justify-between items-center text-on-surface-variant font-label-sm text-label-sm">
                    <span>Added: {new Date(chunk.created_at).toLocaleDateString()}</span>
                    <span className="font-mono">#KB-{chunk.id.slice(0, 8)}</span>
                  </div>
                </article>
              );
            })
          )}
        </section>
      </div>
    </div>
  );
}
