import type {
  ATTENDANCE_METHODS,
  CHATBOT_SOURCE_TYPES,
  CONTENT_TYPES,
  DROPOUT_RISK_LEVELS,
  FACE_REC_MODELS,
  INTERACTIVE_EXERCISE_TYPES,
  JOB_INTEREST_STATUSES,
  NOMINATION_DECISIONS,
  NOMINATION_STATUSES,
  PROGRAMME_MODES,
  ROLES,
} from "@ncct/constants";

export type Role = (typeof ROLES)[number];
export type ProgrammeMode = (typeof PROGRAMME_MODES)[number];
export type NominationStatus = (typeof NOMINATION_STATUSES)[number];
// The subset an admin can decide on — `pending` is the initial state, not a
// decision, so it is deliberately absent (mirrors NOMINATION_DECISIONS).
export type NominationDecision = (typeof NOMINATION_DECISIONS)[number];
export type ContentType = (typeof CONTENT_TYPES)[number];
export type InteractiveExerciseType = (typeof INTERACTIVE_EXERCISE_TYPES)[number];
export type AttendanceMethod = (typeof ATTENDANCE_METHODS)[number];
export type FaceRecModel = (typeof FACE_REC_MODELS)[number];
export type JobInterestStatus = (typeof JOB_INTEREST_STATUSES)[number];
export type DropoutRiskLevel = (typeof DROPOUT_RISK_LEVELS)[number];
export type ChatbotSourceType = (typeof CHATBOT_SOURCE_TYPES)[number];

export interface Institution {
  id: string;
  name: string;
  type: string | null;
  location: string | null;
}

// The full profiles row. `GET /api/profile` returns the narrower
// AuthenticatedUser shape below (what auth middleware resolves); this is what
// the profile read/update routes deal in.
export interface Profile {
  id: string;
  role: Role;
  full_name: string;
  phone: string | null;
  cooperative_affiliation: string | null;
  org_name: string | null;
  org_sector: string | null;
  created_at: string;
  // F10 — nullable until a trainee opts in / a card is issued. Neither is
  // ever returned by /profile or /profile/details to anyone but the owner.
  public_profile_code: string | null;
  nfc_tag_uid: string | null;
}

export interface AuthenticatedUser {
  id: string;
  role: Role;
  full_name: string | null;
}

// One row's outcome from a bulk trainee import. `temp_password` is only
// present for rows the API generated a password for.
// A row in the admin user directory: the `profiles` row plus the email,
// which lives in `auth.users` and is therefore only reachable through the
// service-role admin API, never through a PostgREST join.
export interface AdminUserRow extends Profile {
  email: string | null;
}

export interface BulkImportRow {
  email: string;
  status: "created" | "skipped" | "failed";
  reason?: string;
  user_id?: string;
  temp_password?: string;
}

export interface BulkImportResult {
  created: number;
  skipped: number;
  failed: number;
  rows: BulkImportRow[];
}

export interface Programme {
  id: string;
  institution_id: string;
  title: string;
  description: string | null;
  mode: ProgrammeMode;
  target_audience: string | null;
  capacity: number | null;
  start_date: string | null;
  end_date: string | null;
  created_by: string | null;
  created_at: string;
}

export interface Nomination {
  id: string;
  programme_id: string;
  trainee_id: string;
  status: NominationStatus;
  nominated_at: string;
  decided_at: string | null;
}

export interface TimetableSession {
  id: string;
  programme_id: string;
  title: string | null;
  starts_at: string;
  ends_at: string;
  location: string | null;
  check_in_code: string;
  created_at: string;
}

export interface Course {
  id: string;
  programme_id: string;
  title: string;
  description: string | null;
  created_at: string;
}

export interface Module {
  id: string;
  course_id: string;
  title: string;
  position: number;
  created_at: string;
}

// Only one exercise type exists so far; kept as a union member (not a bare
// interface) so adding a second type forces every consumer to handle it.
export interface MatchingExerciseConfig {
  type: "matching";
  prompt?: string;
  pairs: { term: string; match: string }[];
}

export type InteractiveConfig = MatchingExerciseConfig;

export interface Lesson {
  id: string;
  module_id: string;
  title: string;
  content_type: ContentType;
  storage_path: string | null;
  video_id: string | null;
  interactive_config: InteractiveConfig | null;
  position: number;
  created_at: string;
}

export interface ContentTranslation {
  id: string;
  lesson_id: string;
  locale: string;
  title: string | null;
  body: string | null;
  storage_path: string | null;
}

export interface LessonProgress {
  id: string;
  trainee_id: string;
  lesson_id: string;
  progress_percent: number;
  last_position_seconds: number | null;
  completed_at: string | null;
  updated_at: string;
}

export interface Assessment {
  id: string;
  module_id: string;
  title: string;
  pass_threshold_percent: number;
  created_at: string;
}

export interface QuestionOption {
  id: string;
  text: string;
}

// The trainee-facing shape (`GET /assessments/:id/take`) never carries
// `correct_option_id` — see docs/DECISIONS.md #15. This type still declares
// the field as required because every *authoring* read (admin/trainer) does
// include it; the trainee-safe route returns a value structurally missing
// it, which callers on that path should type as Omit<AssessmentQuestion,
// "correct_option_id"> rather than treating it as always present.
export interface AssessmentQuestion {
  id: string;
  assessment_id: string;
  question_text: string;
  options: QuestionOption[];
  correct_option_id: string;
  position: number;
}

export type AssessmentQuestionForTrainee = Omit<AssessmentQuestion, "correct_option_id">;

export interface AssessmentAttempt {
  id: string;
  assessment_id: string;
  trainee_id: string;
  answers: Record<string, string>;
  score_percent: number;
  passed: boolean;
  submitted_at: string;
}

export interface Certificate {
  id: string;
  certificate_code: string;
  // Nullable: a course with no assessments (pure lesson content) can still
  // be completed and certified with no passing attempt to point at. See
  // docs/DECISIONS.md #37.
  assessment_attempt_id: string | null;
  course_id: string;
  trainee_id: string;
  programme_id: string;
  issuing_institution_id: string;
  pdf_storage_path: string;
  issued_at: string;
}

export interface AttendanceRecord {
  id: string;
  session_id: string;
  trainee_id: string;
  method: AttendanceMethod;
  match_score: number | null;
  recorded_at: string;
  // Admin/trainer who manually marked this row (migration 20260901000018) —
  // null for qr/face rows, and for manual rows on a project that hasn't
  // applied that migration yet.
  marked_by: string | null;
}

// A trainer/admin's full class roster for one timetable session (DECISIONS.md
// #47) — every trainee with an *approved* nomination in the session's
// programme, joined against whatever attendance_records row (if any) they
// have for this specific session. `attendance: null` means genuinely
// unmarked/absent, not "not yet loaded".
export interface AttendanceRosterEntry {
  trainee_id: string;
  full_name: string | null;
  attendance: AttendanceRecord | null;
}

// The embedding vector itself is never returned to a client after
// enrollment — this type is for server-side use (matching) only.
export interface FaceEmbedding {
  id: string;
  trainee_id: string;
  embedding: number[];
  model: FaceRecModel;
  consent_given_at: string;
  created_at: string;
}

export interface Job {
  id: string;
  employer_id: string;
  title: string;
  description: string | null;
  required_skills: string[] | null;
  location: string | null;
  created_at: string;
}

export interface JobInterest {
  id: string;
  job_id: string;
  trainee_id: string;
  status: JobInterestStatus;
  created_at: string;
}

export interface VisibilitySettings {
  trainee_id: string;
  visible_to_employers: boolean;
  // F10 — a separate consent scope from visible_to_employers: this gates
  // an unauthenticated public URL, not an employer-portal audience behind
  // a login. See docs/DECISIONS.md #30.
  public_profile_enabled: boolean;
  updated_at: string;
}

// F10 — GET /api/public-profiles/:code response shape. No-login, so
// deliberately narrow: name plus earned credentials, nothing else on the
// profile row (no phone, no cooperative_affiliation).
export interface PublicProfileCertificate {
  certificate_code: string;
  course_title: string | null;
  programme_title: string | null;
  institution_name: string | null;
  issued_at: string;
}

export interface PublicProfileResult {
  full_name: string;
  certificates: PublicProfileCertificate[];
  skills: string[];
}

// F10 — GET /api/kiosk/nfc-lookup/:uid response shape (staff-only). Kept as
// a distinct type from PublicProfileResult since the kiosk is a different
// trust boundary — staff already see full trainee records through the admin
// UI, so this carries the fields the no-login public route deliberately
// omits (phone, cooperative_affiliation, programme enrollment, attendance).
// See docs/DECISIONS.md #30/#31.
export interface KioskProfileProgramme {
  title: string;
  status: NominationStatus;
}

export interface KioskProfileResult extends PublicProfileResult {
  // Present here but deliberately absent from PublicProfileResult — the
  // no-login public route has no legitimate caller for a trainee's raw id,
  // but the staff-only kiosk does: it's what lets an NFC lookup hand a
  // trainee_id straight to POST /timetable/:sessionId/kiosk-face-checkin
  // without a human re-typing a UUID by hand.
  id: string;
  phone: string | null;
  cooperative_affiliation: string | null;
  member_since: string;
  programmes: KioskProfileProgramme[];
  attendance_count: number;
  // Whether this trainee has a face enrolled, which — because
  // face_embeddings.consent_given_at is NOT NULL and is stamped server-side
  // at enrollment — is the same question as "has this trainee consented to
  // biometric processing" (ARCHITECTURE.md §13, DPDP Act 2023). The kiosk
  // reads it to avoid sending a non-consented trainee to the camera at all;
  // the embedding itself is never returned, only this boolean.
  face_enrolled: boolean;
}

// The embedding itself is never returned to a client — it exists only for
// server-side retrieval, same as FaceEmbedding.
export interface ChatbotCorpusChunk {
  id: string;
  source_type: ChatbotSourceType;
  source_id: string | null;
  content: string;
  created_at: string;
}

// A retrieved chunk plus how well it matched, as returned by the
// `match_corpus_chunks` RPC.
export interface RetrievedChunk {
  id: string;
  content: string;
  source_type: ChatbotSourceType;
  source_id: string | null;
  similarity: number;
}

// `sources` is what the answer was actually grounded in — returned so the UI
// can show its provenance rather than presenting an unattributable answer.
// `answered: false` means retrieval found nothing relevant and no model call
// was made at all (see chatbotService).
export interface ChatbotAnswer {
  answered: boolean;
  answer: string;
  sources: { id: string; content: string; similarity: number }[];
}

// F8's single aggregate payload — see docs/IMPLEMENTATION.md for how each
// dimension is derived (none of them are stored anywhere; all computed at
// request time from F2/F3/F4/F6's own tables, since F8 has no schema of its
// own).
export interface DashboardAnalytics {
  programmesRun: {
    total: number;
    byMode: { mode: ProgrammeMode; count: number }[];
  };
  traineesByRegion: { region: string; traineeCount: number }[];
  completionRates: {
    overall: { approvedNominations: number; certificatesIssued: number; rate: number };
    byProgramme: {
      programmeId: string;
      programmeTitle: string;
      approvedNominations: number;
      certificatesIssued: number;
      rate: number;
    }[];
  };
  certificatesIssued: {
    total: number;
    byMonth: { month: string; count: number }[];
  };
  // Shortlist-funnel activity (job_interests grouped by status), not outcome
  // tracking — real hire/placement analytics is PRD §13's Phase-2 "Employer
  // Outcome Analysis," out of scope here. See docs/IMPLEMENTATION.md's F8
  // entry for why "placements" in PRD §6.8 is read this way.
  placements: {
    totalJobs: number;
    byStatus: { status: JobInterestStatus; count: number }[];
  };
  // P6 deep Training & Learning Analytics (dropout-risk), promoted from
  // Phase-2 — see DECISIONS.md #29. A heuristic risk *flag* computed from
  // lesson-progress/attendance/failed-attempt signals, not a trained
  // prediction — there's no historical dropout data in this project to
  // train or validate against yet.
  dropoutRisk: {
    byLevel: { level: DropoutRiskLevel; count: number }[];
    flagged: DropoutRiskFlag[];
  };
  // P1 Skill-Gap Analysis's institution-wide counterpart (DECISIONS.md #43):
  // a single trainee's "Skill-Gap Check" only ever compares against one job
  // at a time (PRD §6.11's scope). This surfaces the same underlying data
  // — job_skills (demand) and programme_skills+certificates (supply) — one
  // level up, across every job and every trainee at once, so an admin can
  // see which taxonomy skills are most worth building a new programme
  // around, not just what one trainee is missing for one job.
  skillDemand: {
    topShortages: SkillDemandRow[];
  };
}

export interface SkillDemandRow {
  skillId: string;
  skillName: string;
  category: string | null;
  // Number of distinct job postings tagged with this skill.
  demand: number;
  // Number of distinct trainees who hold this skill via an issued
  // certificate under a programme tagged with it (same acquisition rule
  // skillGapService.getAcquiredSkillIds uses for a single trainee).
  supply: number;
  // demand - supply. Positive means more job postings want it than
  // trainees currently have it — the training-need signal. Can be negative
  // (oversupply relative to current job postings), which is meaningful too,
  // not filtered out.
  shortage: number;
}

export interface DropoutRiskFlag {
  traineeId: string;
  traineeName: string | null;
  programmeId: string;
  programmeTitle: string;
  // null when the programme has no lessons authored yet, or no timetable
  // sessions have happened yet — a real "no data" state, not a 0.
  completionRate: number | null;
  attendanceRate: number | null;
  daysSinceLastActivity: number | null;
  failedAttempts: number;
  riskScore: number;
  riskLevel: DropoutRiskLevel;
}

// A trainee's "skill"/"certification" search result. `skills` (DECISIONS.md
// #45, unifying this with F11's taxonomy) is the trainee's real acquired
// skills — same acquisition rule skillGapService.getAcquiredSkillIds uses —
// alongside the pre-existing free-text match against programme/institution
// titles, which is kept rather than replaced: not every certified programme
// is taxonomy-tagged yet, so dropping the text match would silently lose
// real matches for those.
export interface TraineeSearchResult {
  trainee_id: string;
  full_name: string;
  certificates: {
    certificate_code: string;
    programme_title: string | null;
    institution_name: string | null;
    institution_location: string | null;
    issued_at: string;
  }[];
  skills: Skill[];
}

// P1 Skill-Gap Analysis (PRD §6.11, promoted from Phase-2 — see
// DECISIONS.md #26). The skills taxonomy TraineeSearchResult's comment
// above notes as absent — `jobs`/`programme_skills` tag against these
// rows instead of free text.
export interface Skill {
  id: string;
  name: string;
  category: string | null;
}

// The optional "what to learn first" layer over the gap. Always absent
// (`reasoning: null`) rather than erroring when the model call fails or
// there's nothing to rank — a distinct, non-error state the UI renders
// differently from an empty gap.
export interface SkillGapReasoningItem {
  rank: number;
  skill_id: string;
  skill_name: string;
  reason: string;
}

// Semantic partial-credit layer over the gap (DECISIONS.md #45): a gap
// skill whose embedding is close enough to one the trainee already holds
// (anywhere in their profile, not just this job) — e.g. a trainee with
// "Accounting" checking a job that needs "Bookkeeping". Never promotes the
// skill into `acquired_skills` (the trainee doesn't literally hold it), so
// it's a distinct field the UI annotates the gap chip with, not a change to
// the gap itself. Empty array, not null, when nothing clears the
// similarity floor — there's no failure state here worth a `null`
// (unlike `reasoning`, which depends on an external model call).
export interface RelatedSkillMatch {
  gap_skill_id: string;
  gap_skill_name: string;
  related_acquired_skill_id: string;
  related_acquired_skill_name: string;
  similarity: number;
}

export interface SkillGapResult {
  acquired_skills: Skill[];
  gap_skills: Skill[];
  reasoning: SkillGapReasoningItem[] | null;
  related_skills: RelatedSkillMatch[];
}

// F11's multi-job counterpart (DECISIONS.md #45) — the PRD-scoped "one job
// at a time" check answers "am I ready for this job"; this answers "what
// should I learn next, across every job I'm actually a realistic fit for."
// The job set is F13's own top-match list for this trainee (or, with no
// profile signal yet, the newest open postings — see `hasProfileSignal`),
// never every job ever posted.
export interface SkillGapAcrossJobsResult {
  jobs: { id: string; title: string }[];
  gap_summary: {
    skill_id: string;
    skill_name: string;
    category: string | null;
    // How many of `jobs` above tag this skill — the "learn this once,
    // close N gaps" signal, sorted descending.
    jobs_needing_it: number;
    job_ids: string[];
  }[];
  // false when there's no certificate/skill profile yet to rank jobs by
  // fit, so `jobs` falls back to the newest open postings instead — same
  // distinct non-error state F13's JobMatchesResult already uses.
  hasProfileSignal: boolean;
}

// P2 AI Career Counsellor (PRD §6.12, promoted from Phase-2 — see
// DECISIONS.md #27). `toolCalls` is provenance, not decoration: which of
// the trainee's own data (or the open catalog) this specific answer was
// actually grounded in, shown to the trainee alongside the answer.
export interface CareerCounsellorToolCall {
  tool: string;
  args: Record<string, unknown>;
}

export interface CareerCounsellorAnswer {
  answer: string;
  toolCalls: CareerCounsellorToolCall[];
}

// P3 AI Job Matching (PRD §6.13, promoted from Phase-2 — see
// DECISIONS.md #28). A Job plus how well it matched the requesting
// trainee's own profile (0-1 cosine similarity, higher is closer).
export interface JobMatch extends Job {
  similarity: number;
}

export interface JobMatchesResult {
  matches: JobMatch[];
  // false when the trainee has no certificates/skills yet to base a match
  // on — a distinct "not enough profile data" state, not an error.
  hasProfileSignal: boolean;
}
