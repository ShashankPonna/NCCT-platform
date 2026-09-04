export const ROLES = ["admin", "trainer", "trainee", "employer"] as const;

export const PROGRAMME_MODES = ["online", "offline", "hybrid"] as const;

export const NOMINATION_STATUSES = ["pending", "approved", "waitlisted", "rejected"] as const;

// A nomination can only be *decided* into one of these — "pending" is the
// initial state, not something an admin decides it back to.
export const NOMINATION_DECISIONS = ["approved", "waitlisted", "rejected"] as const;

export const CONTENT_TYPES = ["video", "pdf", "slides", "text", "interactive"] as const;

// YouTube video IDs are always exactly 11 URL-safe characters.
export const YOUTUBE_VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

// Matches the `allowed_mime_types` set on the `lesson-content` Supabase
// Storage bucket — kept in sync manually since the bucket isn't provisioned
// via a SQL migration (Storage buckets are provisioned through the Storage
// Management API, not plain SQL).
export const LESSON_FILE_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-powerpoint",
] as const;

export const LESSON_FILE_MAX_BYTES = 25 * 1024 * 1024;

// Self-hosted lesson video (Cloudflare R2, DECISIONS.md #18 — supersedes #12).
// Kept separate from LESSON_FILE_MIME_TYPES/_MAX_BYTES above: video uploads go
// straight from the browser to R2 via a presigned URL, not buffered through
// Express like PDFs, so a much larger ceiling is safe. 2GiB is a sanity limit,
// not a real constraint — a single presigned PUT supports up to 5GiB.
export const LESSON_VIDEO_MIME_TYPES = ["video/mp4", "video/webm", "video/quicktime"] as const;

export const LESSON_VIDEO_MAX_BYTES = 2 * 1024 * 1024 * 1024;

// Locale codes are validated by shape, not against a fixed list: PRD §14
// still has "which 2nd MVP language" open, so pinning an enum here would be
// inventing a requirement. These are only the options the admin UI offers as
// a convenience — any well-formed locale is accepted by the API.
export const LOCALE_PATTERN = /^[a-z]{2}(-[A-Z]{2})?$/;

export const SUGGESTED_LOCALES = ["en", "hi", "mr", "gu", "ta", "te", "kn", "bn"] as const;

export const INTERACTIVE_EXERCISE_TYPES = ["matching"] as const;

export const ATTENDANCE_METHODS = ["qr", "face"] as const;

// Matches the `face_embeddings.model` CHECK constraint. Only "human" is
// actually implemented (extraction runs client-side via @vladmandic/human,
// see docs/DECISIONS.md #16) — "insightface_buffalo_l" is reserved for the
// documented swap-in alternative (DECISIONS.md #5) and isn't accepted by the
// API yet, so validation schemas restrict to "human" specifically rather
// than this full list.
export const FACE_REC_MODELS = ["human", "insightface_buffalo_l"] as const;

// 1024-d — @vladmandic/human's faceres descriptor output, measured against
// real faces in a browser rather than assumed. The initial schema claimed
// 512 "to match Human / InsightFace buffalo_l", which conflated the two:
// buffalo_l is 512-d, Human is 1024-d. Swapping to buffalo_l later would
// need this value, the `face_embeddings.embedding` column, and every
// enrolled embedding to change together — see DECISIONS.md #5/#16 and
// migration 20260901000011.
export const FACE_EMBEDDING_DIMENSIONS = 1024;

// Human's own demos use ~0.6 as a same-person cosine-similarity threshold;
// adopted here as a starting point, not a tuned value — a judgment call like
// F4's pass_threshold_percent was, worth revisiting once there's real
// enrollment/check-in data to tune against.
export const FACE_MATCH_THRESHOLD = 0.6;

export const JOB_INTEREST_STATUSES = ["shortlisted", "viewed", "contacted"] as const;

// What a corpus chunk was derived from. `programme` chunks can carry the
// originating programme's id in `source_id`; `faq` chunks are standalone.
export const CHATBOT_SOURCE_TYPES = ["programme", "faq"] as const;

// Xenova/all-MiniLM-L6-v2 output size — see docs/DECISIONS.md #17 for why
// embeddings are generated locally rather than through a hosted API. Must
// stay in sync with `chatbot_corpus_chunks.embedding`'s column dimension and
// the `match_corpus_chunks` RPC signature.
export const EMBEDDING_MODEL = "Xenova/all-MiniLM-L6-v2";
export const EMBEDDING_DIMENSIONS = 384;

// How many corpus chunks to retrieve per question, and how similar a chunk
// must be to count as relevant at all. The floor matters more than the count
// here: without it, an unrelated question still retrieves the 5 "closest"
// chunks and the model is handed irrelevant context to ground an answer in.
// Both are starting points tuned against a small corpus, not measured
// optima — same category of judgment call as FACE_MATCH_THRESHOLD.
export const CHATBOT_RETRIEVAL_COUNT = 5;
export const CHATBOT_MIN_SIMILARITY = 0.25;

// P3 AI Job Matching (DECISIONS.md #28) — reuses F7's embedding model
// (EMBEDDING_MODEL/EMBEDDING_DIMENSIONS above), just a different corpus
// (jobs, not FAQ chunks) and no relevance floor: a ranked "best available
// matches" list is useful even when nothing is a strong match, unlike the
// chatbot where an irrelevant answer would be actively misleading.
export const JOB_MATCH_COUNT = 10;

// P6 Deep Training & Learning Analytics — dropout-risk flagging
// (DECISIONS.md #29). Hand-tuned starting points, not measured optima —
// same category of judgment call as FACE_MATCH_THRESHOLD/
// CHATBOT_MIN_SIMILARITY: there's no real historical dropout data in this
// project yet to tune against. Read this as a heuristic risk *flag*, not a
// trained prediction.
export const DROPOUT_RISK_STALE_DAYS = 14;
export const DROPOUT_RISK_LOW_COMPLETION = 0.25;
export const DROPOUT_RISK_LOW_ATTENDANCE = 0.5;
export const DROPOUT_RISK_MEDIUM_THRESHOLD = 30;
export const DROPOUT_RISK_HIGH_THRESHOLD = 60;
export const DROPOUT_RISK_LEVELS = ["low", "medium", "high"] as const;
