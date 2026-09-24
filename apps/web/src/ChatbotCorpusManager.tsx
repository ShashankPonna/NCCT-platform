import { createCorpusChunk, deleteCorpusChunk, getCorpusChunks } from "@ncct/api-client";
import { CHATBOT_SOURCE_TYPES } from "@ncct/constants";
import type { ChatbotCorpusChunk, ChatbotSourceType } from "@ncct/shared-types";
import { useEffect, useState } from "react";
import { useLocale, type Locale } from "./i18n/LocaleContext.js";

interface ChatbotCorpusManagerProps {
  accessToken: string;
}

interface ChatbotCorpusManagerText {
  heading: string;
  subheading: string;
  guardrailsTitle: string;
  guardrailsBody: string;
  addNewChunk: string;
  sourceType: string;
  sourceTypeProgramme: string;
  sourceTypeFaq: string;
  contentLabel: string;
  charCount: (length: number) => string;
  placeholder: string;
  embedding: string;
  addToKnowledgeBase: string;
  existingEntries: (count: number) => string;
  emptyState: string;
  deleteEntry: string;
  added: (date: string) => string;
}

const content: Record<Locale, ChatbotCorpusManagerText> = {
  en: {
    heading: "Chatbot Knowledge Base",
    subheading: "Author and manage verified training materials used for RAG responses.",
    guardrailsTitle: "RAG Guardrails & Constraints",
    guardrailsBody:
      "The NCCT Chatbot relies exclusively on the verified chunks in this knowledge base. It will not hallucinate information outside these provided text fragments. Ensure chunks are clear, self-contained, and relevant to trainee inquiries.",
    addNewChunk: "Add New Chunk",
    sourceType: "Source Type",
    sourceTypeProgramme: "Programme Detail",
    sourceTypeFaq: "General FAQ",
    contentLabel: "Content *",
    charCount: (length) => `${length} / 4000`,
    placeholder:
      "e.g. To enroll in Agricultural Sciences programmes, applicants must be registered cooperative members with secondary education...",
    embedding: "Embedding...",
    addToKnowledgeBase: "Add to Knowledge Base",
    existingEntries: (count) => `Existing Entries (${count})`,
    emptyState: "Knowledge base is currently empty. Add your first chunk on the left.",
    deleteEntry: "Delete entry",
    added: (date) => `Added: ${date}`,
  },
  hi: {
    heading: "चैटबॉट ज्ञान आधार",
    subheading: "RAG प्रतिक्रियाओं के लिए उपयोग की जाने वाली सत्यापित प्रशिक्षण सामग्री लिखें और प्रबंधित करें।",
    guardrailsTitle: "RAG गार्डरेल्स एवं सीमाएं",
    guardrailsBody:
      "NCCT चैटबॉट पूरी तरह से इस ज्ञान आधार के सत्यापित अंशों पर निर्भर करता है। यह इन दिए गए टेक्स्ट अंशों के बाहर की जानकारी नहीं गढ़ेगा। सुनिश्चित करें कि अंश स्पष्ट, स्वतः-पूर्ण, और प्रशिक्षणार्थी प्रश्नों के लिए प्रासंगिक हों।",
    addNewChunk: "नया अंश जोड़ें",
    sourceType: "स्रोत प्रकार",
    sourceTypeProgramme: "कार्यक्रम विवरण",
    sourceTypeFaq: "सामान्य FAQ",
    contentLabel: "सामग्री *",
    charCount: (length) => `${length} / 4000`,
    placeholder:
      "उदा. कृषि विज्ञान कार्यक्रमों में नामांकन के लिए, आवेदकों को माध्यमिक शिक्षा प्राप्त पंजीकृत सहकारी सदस्य होना चाहिए...",
    embedding: "एम्बेडिंग हो रही है...",
    addToKnowledgeBase: "ज्ञान आधार में जोड़ें",
    existingEntries: (count) => `मौजूदा प्रविष्टियां (${count})`,
    emptyState: "ज्ञान आधार वर्तमान में खाली है। बाईं ओर अपना पहला अंश जोड़ें।",
    deleteEntry: "प्रविष्टि हटाएं",
    added: (date) => `जोड़ा गया: ${date}`,
  },
};

export function ChatbotCorpusManager({ accessToken }: ChatbotCorpusManagerProps) {
  const { locale } = useLocale();
  const t = content[locale];
  const [chunks, setChunks] = useState<ChatbotCorpusChunk[]>([]);
  const [sourceType, setSourceType] = useState<ChatbotSourceType>("faq");
  const [chunkContent, setChunkContent] = useState("");
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
    if (!chunkContent.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await createCorpusChunk(accessToken, { source_type: sourceType, content: chunkContent.trim() });
      setChunkContent("");
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

  function sourceTypeLabel(type: ChatbotSourceType): string {
    return type === "programme" ? t.sourceTypeProgramme : t.sourceTypeFaq;
  }

  return (
    <div className="w-full flex flex-col gap-6 text-left">
      {/* Page Header */}
      <header className="bg-white rounded-2xl border border-border-slate px-6 py-5 flex flex-col justify-between gap-1 shadow-xs">
        <div className="flex items-center gap-2 mb-1">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#FE932C]" />
          <span className="text-xs uppercase tracking-wider text-[#D97706] font-bold">
            Administration • AI RAG Corpus & Grounding Engine
          </span>
        </div>
        <h1 className="font-display text-2xl lg:text-3xl font-extrabold text-[#00236F] m-0">
          {t.heading}
        </h1>
        <p className="font-body text-xs text-slate-600 mt-1 max-w-2xl">{t.subheading}</p>
      </header>

      {/* Institutional Instructions Callout */}
      <section className="bg-indigo-50/60 border border-indigo-200/80 rounded-2xl p-5 shadow-xs">
        <div className="flex items-start gap-3.5">
          <div className="w-9 h-9 rounded-xl bg-[#00236F] text-white flex items-center justify-center shrink-0 shadow-xs">
            <span className="material-symbols-outlined text-[20px]">info</span>
          </div>
          <div>
            <h3 className="font-display text-sm text-[#00236F] font-bold m-0 mb-1">
              {t.guardrailsTitle}
            </h3>
            <p className="font-body text-xs text-slate-600 m-0 leading-relaxed">
              {t.guardrailsBody}
            </p>
          </div>
        </div>
      </section>

      {error && (
        <div className="bg-rose-50 text-rose-900 p-4 rounded-xl flex items-center gap-3 border border-rose-200 text-xs font-medium">
          <span className="material-symbols-outlined text-rose-600 shrink-0">error</span>
          <p>{error}</p>
        </div>
      )}

      {/* Bento Grid: Form (Col 1) and List (Col 2) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Add Chunk Form */}
        <section className="lg:col-span-1">
          <div className="bg-white rounded-2xl border border-border-slate p-6 shadow-xs sticky top-6">
            <h2 className="font-display text-base font-bold text-[#00236F] mb-5 flex items-center gap-2 m-0">
              <span className="material-symbols-outlined text-[#FE932C]">add_circle</span>
              {t.addNewChunk}
            </h2>

            <form onSubmit={(e) => void handleAdd(e)} className="space-y-4">
              {/* Source Type */}
              <div>
                <label htmlFor="sourceType" className="block text-xs font-bold text-slate-700 mb-1.5">
                  {t.sourceType}
                </label>
                <div className="relative">
                  <select
                    id="sourceType"
                    value={sourceType}
                    onChange={(e) => setSourceType(e.target.value as ChatbotSourceType)}
                    className="w-full bg-paper-light border border-border-slate rounded-xl px-3.5 py-2.5 appearance-none focus:outline-none focus:bg-white focus:border-[#00236F] text-xs font-semibold text-ink cursor-pointer"
                  >
                    {CHATBOT_SOURCE_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {sourceTypeLabel(type)}
                      </option>
                    ))}
                  </select>
                  <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                    expand_more
                  </span>
                </div>
              </div>

              {/* Text Area with Character Count */}
              <div>
                <div className="flex justify-between items-baseline mb-1.5">
                  <label htmlFor="chunkContent" className="block text-xs font-bold text-slate-700">
                    {t.contentLabel}
                  </label>
                  <span className="font-metric-mono text-[11px] text-slate-500">
                    {t.charCount(chunkContent.length)}
                  </span>
                </div>
                <textarea
                  id="chunkContent"
                  value={chunkContent}
                  onChange={(e) => setChunkContent(e.target.value)}
                  maxLength={4000}
                  rows={8}
                  placeholder={t.placeholder}
                  className="w-full bg-paper-light border border-border-slate rounded-xl p-3.5 focus:outline-none focus:bg-white focus:border-[#00236F] text-xs text-ink leading-relaxed resize-y"
                />
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={busy || !chunkContent.trim()}
                className="w-full bg-[#FE932C] hover:bg-[#E07D1E] text-white rounded-xl text-xs font-bold h-11 flex items-center justify-center gap-2 transition-colors disabled:opacity-50 shadow-xs cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">upload</span>
                <span>{busy ? t.embedding : t.addToKnowledgeBase}</span>
              </button>
            </form>
          </div>
        </section>

        {/* List of Existing Entries */}
        <section className="lg:col-span-2 space-y-4">
          <div className="flex justify-between items-center mb-2">
            <h2 className="font-display text-base font-bold text-[#00236F] flex items-center gap-2 m-0">
              <span className="material-symbols-outlined text-[#00236F]">list_alt</span>
              {t.existingEntries(chunks.length)}
            </h2>
          </div>

          {chunks.length === 0 ? (
            <div className="p-8 text-center bg-paper-light rounded-2xl border border-dashed border-border-slate text-slate-500">
              <span className="material-symbols-outlined text-[48px] opacity-40 mb-2">
                menu_book
              </span>
              <p className="text-xs">{t.emptyState}</p>
            </div>
          ) : (
            chunks.map((chunk) => {
              const badgeClass =
                chunk.source_type === "programme"
                  ? "bg-blue-50 text-blue-800 border border-blue-200"
                  : "bg-amber-50 text-amber-800 border border-amber-200";

              return (
                <article
                  key={chunk.id}
                  className="bg-white rounded-2xl border border-border-slate p-5 hover:border-[#FE932C]/40 transition-all shadow-xs"
                >
                  <div className="flex justify-between items-start mb-3">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-bold ${badgeClass}`}
                    >
                      {sourceTypeLabel(chunk.source_type)}
                    </span>
                    <button
                      type="button"
                      onClick={() => void handleDelete(chunk.id)}
                      aria-label={t.deleteEntry}
                      className="text-slate-400 hover:text-rose-600 transition-colors p-1.5 -mr-1 -mt-1 rounded-lg hover:bg-rose-50 cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[18px]">delete</span>
                    </button>
                  </div>

                  <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap m-0">
                    {chunk.content}
                  </p>

                  <div className="mt-4 pt-3 border-t border-border-slate/50 flex justify-between items-center text-slate-500 text-[11px]">
                    <span>{t.added(new Date(chunk.created_at).toLocaleDateString(locale === "hi" ? "hi-IN" : undefined))}</span>
                    <span className="font-metric-mono font-semibold text-[#00236F]">#KB-{chunk.id.slice(0, 8).toUpperCase()}</span>
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
