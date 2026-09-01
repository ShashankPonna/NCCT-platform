import type {
  CONTENT_TYPES,
  INTERACTIVE_EXERCISE_TYPES,
  NOMINATION_STATUSES,
  PROGRAMME_MODES,
  ROLES,
} from "@ncct/constants";

export type Role = (typeof ROLES)[number];
export type ProgrammeMode = (typeof PROGRAMME_MODES)[number];
export type NominationStatus = (typeof NOMINATION_STATUSES)[number];
export type ContentType = (typeof CONTENT_TYPES)[number];
export type InteractiveExerciseType = (typeof INTERACTIVE_EXERCISE_TYPES)[number];

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
