import {
  CHATBOT_SOURCE_TYPES,
  CONTENT_TYPES,
  FACE_EMBEDDING_DIMENSIONS,
  JOB_INTEREST_STATUSES,
  LOCALE_PATTERN,
  NOMINATION_DECISIONS,
  PROGRAMME_MODES,
  ROLES,
  YOUTUBE_VIDEO_ID_PATTERN,
} from "@ncct/constants";
import { z } from "zod";

export const roleSchema = z.enum(ROLES);

export const createProgrammeSchema = z.object({
  institution_id: z.string().uuid(),
  title: z.string().min(1),
  description: z.string().optional(),
  mode: z.enum(PROGRAMME_MODES),
  target_audience: z.string().optional(),
  capacity: z.number().int().positive().optional(),
  start_date: z.string().date().optional(),
  end_date: z.string().date().optional(),
});

export const updateProgrammeSchema = createProgrammeSchema.partial();

export const decideNominationSchema = z.object({
  status: z.enum(NOMINATION_DECISIONS),
});

export const createTimetableSessionSchema = z
  .object({
    title: z.string().optional(),
    starts_at: z.string().datetime(),
    ends_at: z.string().datetime(),
    location: z.string().optional(),
  })
  .refine((session) => new Date(session.ends_at) > new Date(session.starts_at), {
    message: "ends_at must be after starts_at",
    path: ["ends_at"],
  });

export const createCourseSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
});

export const updateCourseSchema = createCourseSchema.partial();

export const createModuleSchema = z.object({
  title: z.string().min(1),
  position: z.number().int().nonnegative().optional(),
});

export const updateModuleSchema = createModuleSchema.partial();

export const youtubeVideoIdSchema = z
  .string()
  .regex(YOUTUBE_VIDEO_ID_PATTERN, "Must be an 11-character YouTube video ID, not a URL");

// Only "matching" exists so far. Declared as a discriminated union rather
// than a bare object so adding a second exercise type is a compile-time
// prompt to handle it everywhere, not a silent widening.
export const matchingExerciseConfigSchema = z.object({
  type: z.literal("matching"),
  prompt: z.string().optional(),
  pairs: z
    .array(z.object({ term: z.string().min(1), match: z.string().min(1) }))
    .min(2, "A matching exercise needs at least 2 pairs"),
});

export const interactiveConfigSchema = z.discriminatedUnion("type", [matchingExerciseConfigSchema]);

export const createLessonSchema = z.object({
  title: z.string().min(1),
  content_type: z.enum(CONTENT_TYPES),
  storage_path: z.string().optional(),
  video_id: youtubeVideoIdSchema.optional(),
  interactive_config: interactiveConfigSchema.optional(),
  position: z.number().int().nonnegative().optional(),
});

export const updateLessonSchema = z.object({
  title: z.string().min(1).optional(),
  content_type: z.enum(CONTENT_TYPES).optional(),
  storage_path: z.string().optional(),
  video_id: youtubeVideoIdSchema.nullable().optional(),
  interactive_config: interactiveConfigSchema.nullable().optional(),
  position: z.number().int().nonnegative().optional(),
});

export const localeSchema = z
  .string()
  .regex(LOCALE_PATTERN, "Must be a locale code like 'en' or 'hi' (optionally 'en-IN')");

// At least one of title/body must carry actual content — an all-empty
// translation row is a data-entry mistake, not a meaningful record.
export const upsertContentTranslationSchema = z
  .object({
    title: z.string().min(1).nullable().optional(),
    body: z.string().min(1).nullable().optional(),
    storage_path: z.string().nullable().optional(),
  })
  .refine((t) => Boolean(t.title || t.body || t.storage_path), {
    message: "A translation needs at least one of title, body, or storage_path",
  });

export const updateLessonProgressSchema = z.object({
  progress_percent: z.number().int().min(0).max(100).optional(),
  last_position_seconds: z.number().int().nonnegative().optional(),
  completed_at: z.string().datetime().nullable().optional(),
});

export const createAssessmentSchema = z.object({
  title: z.string().min(1),
  pass_threshold_percent: z.number().int().min(0).max(100).optional(),
});

export const updateAssessmentSchema = createAssessmentSchema.partial();

const questionOptionSchema = z.object({ id: z.string().min(1), text: z.string().min(1) });

export const createQuestionSchema = z
  .object({
    question_text: z.string().min(1),
    options: z.array(questionOptionSchema).min(2, "A question needs at least 2 options"),
    correct_option_id: z.string().min(1),
    position: z.number().int().nonnegative().optional(),
  })
  .refine((q) => q.options.some((o) => o.id === q.correct_option_id), {
    message: "correct_option_id must match one of the options' ids",
    path: ["correct_option_id"],
  })
  .refine((q) => new Set(q.options.map((o) => o.id)).size === q.options.length, {
    message: "option ids must be unique",
    path: ["options"],
  });

export const updateQuestionSchema = z
  .object({
    question_text: z.string().min(1).optional(),
    options: z.array(questionOptionSchema).min(2, "A question needs at least 2 options").optional(),
    correct_option_id: z.string().min(1).optional(),
    position: z.number().int().nonnegative().optional(),
  })
  .refine(
    (q) =>
      !q.options || !q.correct_option_id || q.options.some((o) => o.id === q.correct_option_id),
    {
      message: "correct_option_id must match one of the options' ids",
      path: ["correct_option_id"],
    },
  );

// Answers are keyed by question id; an unanswered question is simply absent
// from the map rather than requiring a placeholder value.
export const submitAttemptSchema = z.object({
  answers: z.record(z.string(), z.string()),
});

const faceEmbeddingVectorSchema = z
  .array(z.number().finite())
  .length(FACE_EMBEDDING_DIMENSIONS, `Embedding must have exactly ${FACE_EMBEDDING_DIMENSIONS} values`);

// Only "human" is accepted — see FACE_REC_MODELS' comment in
// packages/constants: "insightface_buffalo_l" is a documented alternative,
// not something the API actually extracts/accepts yet.
//
// `consent` must be the literal `true` — its presence in the request body
// *is* the recorded consent action (the row's consent_given_at is stamped
// server-side at insert time), per CLAUDE.md's DPDP Act 2023 rule. A request
// without it is rejected before any embedding is written.
export const enrollFaceEmbeddingSchema = z.object({
  embedding: faceEmbeddingVectorSchema,
  model: z.literal("human"),
  consent: z.literal(true),
});

// Server-side matching always recomputes the score itself (CLAUDE.md: never
// trust a client-reported face-match result) — the client only ever supplies
// the raw embedding it extracted locally, never a match score or verdict.
export const attendanceCheckInSchema = z.discriminatedUnion("method", [
  z.object({
    session_id: z.string().uuid(),
    method: z.literal("qr"),
  }),
  z.object({
    session_id: z.string().uuid(),
    method: z.literal("face"),
    embedding: faceEmbeddingVectorSchema,
  }),
]);

export const createJobSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  required_skills: z.array(z.string().min(1)).optional(),
  location: z.string().optional(),
});

export const updateJobSchema = createJobSchema.partial();

// No `status` field — every interest starts "shortlisted" (the DB column
// default), same reasoning as nominations starting "pending": the creating
// action (an employer shortlisting a trainee) only ever produces one
// meaningful initial state.
export const createJobInterestSchema = z.object({
  trainee_id: z.string().uuid(),
});

export const updateJobInterestStatusSchema = z.object({
  status: z.enum(JOB_INTEREST_STATUSES),
});

export const updateVisibilitySettingsSchema = z.object({
  visible_to_employers: z.boolean(),
});

export const createCorpusChunkSchema = z.object({
  source_type: z.enum(CHATBOT_SOURCE_TYPES),
  source_id: z.string().uuid().nullable().optional(),
  content: z.string().min(1).max(4000),
});

// Bounded so a single question can't be used to push an arbitrarily large
// payload into the model call.
export const askChatbotSchema = z.object({
  question: z.string().min(1).max(500),
});
