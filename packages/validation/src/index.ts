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

// F1 — a user editing their own profile. Every field is optional (PATCH
// semantics), but an all-empty body is rejected so a no-op write can't be
// mistaken for a successful edit. `role` is deliberately absent: a user must
// never be able to change their own role, only an admin can (see
// createUserSchema / the users route).
export const updateProfileSchema = z
  .object({
    full_name: z.string().min(1).optional(),
    phone: z.string().min(1).nullable().optional(),
    cooperative_affiliation: z.string().min(1).nullable().optional(),
    // Employer org profile fields (PRD §6.1) — stored on the same profiles
    // row rather than a separate table, matching the existing schema.
    org_name: z.string().min(1).nullable().optional(),
    org_sector: z.string().min(1).nullable().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: "At least one field must be provided",
  });

export const createInstitutionSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1).optional(),
  location: z.string().min(1).optional(),
});

export const updateInstitutionSchema = createInstitutionSchema
  .partial()
  .refine((body) => Object.keys(body).length > 0, {
    message: "At least one field must be provided",
  });

// Admin-created account. A password may be supplied; when omitted the API
// generates a temporary one and returns it so the admin can distribute it.
export const createUserSchema = z.object({
  email: z.string().email(),
  role: roleSchema,
  full_name: z.string().min(1),
  password: z.string().min(8).optional(),
  phone: z.string().min(1).optional(),
  cooperative_affiliation: z.string().min(1).optional(),
  org_name: z.string().min(1).optional(),
  org_sector: z.string().min(1).optional(),
});

// Bulk trainee import (PRD §6.1). Role is fixed to `trainee` rather than
// accepted per row — this endpoint exists specifically for trainee intake,
// and letting a spreadsheet grant admin rights would be a real escalation
// risk. Use createUserSchema for anything else.
export const bulkImportTraineesSchema = z.object({
  trainees: z
    .array(
      z.object({
        email: z.string().email(),
        full_name: z.string().min(1),
        phone: z.string().min(1).optional(),
        cooperative_affiliation: z.string().min(1).optional(),
      }),
    )
    .min(1)
    .max(200),
});

// Admin-side user management (PRD §6.1's "User Management" half). Distinct
// from updateProfileSchema, which is a user editing *themselves* and
// deliberately cannot touch `role`: this one is admin-gated and CAN, because
// the signup trigger defaults every self-registered account to `trainee`, so
// without a role-change route there is no path to ever promote someone to
// trainer/admin/employer. The route additionally refuses to let an admin
// change their *own* role — see users.ts for why.
export const adminUpdateUserSchema = z
  .object({
    role: roleSchema.optional(),
    full_name: z.string().min(1).optional(),
    phone: z.string().min(1).nullable().optional(),
    cooperative_affiliation: z.string().min(1).nullable().optional(),
    org_name: z.string().min(1).nullable().optional(),
    org_sector: z.string().min(1).nullable().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: "At least one field must be provided",
  });

// Query params for the admin user directory. Both filters are optional and
// combine; `q` matches name or email case-insensitively.
export const listUsersQuerySchema = z.object({
  role: roleSchema.optional(),
  q: z.string().min(1).optional(),
});

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

export const faceEmbeddingVectorSchema = z
  .array(z.number().finite())
  .length(
    FACE_EMBEDDING_DIMENSIONS,
    `Embedding must have exactly ${FACE_EMBEDDING_DIMENSIONS} values`,
  );

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

// Kiosk face check-in (docs/DECISIONS.md #21): staff-operated terminal, no
// trainee JWT present, so unlike attendanceCheckInSchema's "face" branch the
// trainee has to be named explicitly rather than inferred from the caller.
export const kioskFaceCheckInSchema = z.object({
  trainee_id: z.string().uuid(),
  embedding: faceEmbeddingVectorSchema,
});

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

// F10. public_profile_enabled is intentionally its own schema, not folded
// into updateVisibilitySettingsSchema above — the two consent scopes are
// meant to be toggled independently by the trainee UI, not always sent
// together (see docs/DECISIONS.md #30).
export const updatePublicProfileEnabledSchema = z.object({
  public_profile_enabled: z.boolean(),
});

// F10. Binding accepts null to explicitly unbind a lost/reissued card —
// distinct from omitting the field, which zod would reject as missing.
// Normalised (uppercased, separators stripped) again server-side in the
// route regardless of what the client sends.
export const bindNfcTagSchema = z.object({
  nfc_tag_uid: z.string().trim().min(1).max(32).nullable(),
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

// P1 Skill-Gap Analysis (DECISIONS.md #26). Admin-only taxonomy creation —
// deliberately no update/delete schema yet, matching how narrowly this was
// scoped in (see skills.ts route comments).
export const createSkillSchema = z.object({
  name: z.string().min(1),
  category: z.string().min(1).optional(),
});

// Shared by job_skills and programme_skills: both replace the *entire*
// tagged set in one call rather than incremental add/remove — a picker UI
// (SkillPicker.tsx) always submits its full current selection, and a
// replace-all PUT is simpler and matches how content_translations' upsert
// already avoids a separate add/remove pair for a small owned set.
export const setSkillIdsSchema = z.object({
  skill_ids: z.array(z.string().uuid()),
});

// P2 AI Career Counsellor (DECISIONS.md #27). Same bound as
// askChatbotSchema — a single question can't be used to push an
// arbitrarily large payload into the model call.
export const askCareerCounsellorSchema = z.object({
  question: z.string().min(1).max(500),
});
