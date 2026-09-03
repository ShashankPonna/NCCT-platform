import type {
  ATTENDANCE_METHODS,
  CHATBOT_SOURCE_TYPES,
  CONTENT_TYPES,
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
  assessment_attempt_id: string;
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
  updated_at: string;
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
}

// A trainee's "skill"/"certification" search result — there's no dedicated
// skills taxonomy in the schema (see docs/DATABASE.md's Open Items), so this
// is derived by matching a keyword against the titles of programmes/
// institutions behind a trainee's earned certificates, not a first-class
// profile field.
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
}
