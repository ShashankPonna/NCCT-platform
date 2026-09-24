import type {
  AssessmentKind,
  CourseGradebook,
  CourseMarksAssessmentRow,
  CourseMarksTally,
  CourseMarksTotals,
  GradebookRow,
  GradedResult,
  QuestionResult,
} from "@ncct/shared-types";
import { supabaseAdmin } from "./supabaseClient.js";

// Marks-based grading and the course marks tally (docs/DECISIONS.md #53).
// The pure functions here are the single source of truth for how a score is
// computed — the attempt route, the staff preview route, the tally/gradebook
// routes and certificate issuance all go through them, so a "pass" can never
// mean two different things in two places.

export interface GradableQuestion {
  id: string;
  correct_option_id: string;
  marks: number;
}

export function gradeAnswers(
  questions: GradableQuestion[],
  answers: Record<string, string>,
  passThresholdPercent: number,
  revealAnswers: boolean,
): GradedResult {
  let marksObtained = 0;
  let totalMarks = 0;
  const breakdown: QuestionResult[] = questions.map((q) => {
    const selected = answers[q.id] ?? null;
    const isCorrect = selected === q.correct_option_id;
    const marksAwarded = isCorrect ? q.marks : 0;
    marksObtained += marksAwarded;
    totalMarks += q.marks;
    return {
      question_id: q.id,
      selected_option_id: selected,
      is_correct: isCorrect,
      marks: q.marks,
      marks_awarded: marksAwarded,
      ...(revealAnswers ? { correct_option_id: q.correct_option_id } : {}),
    };
  });
  const scorePercent = totalMarks > 0 ? Math.round((marksObtained / totalMarks) * 100) : 0;
  return {
    marks_obtained: marksObtained,
    total_marks: totalMarks,
    score_percent: scorePercent,
    passed: scorePercent >= passThresholdPercent,
    breakdown,
  };
}

export interface AttemptRow {
  id: string;
  assessment_id: string;
  trainee_id: string;
  score_percent: number;
  passed: boolean;
  marks_obtained: number | null;
  total_marks: number | null;
  submitted_at: string;
}

/** Highest percent wins; ties go to more marks, then the earlier attempt. */
export function pickBestAttempt<T extends AttemptRow>(attempts: T[]): T | null {
  let best: T | null = null;
  for (const a of attempts) {
    if (
      !best ||
      a.score_percent > best.score_percent ||
      (a.score_percent === best.score_percent &&
        (a.marks_obtained ?? 0) > (best.marks_obtained ?? 0)) ||
      (a.score_percent === best.score_percent &&
        (a.marks_obtained ?? 0) === (best.marks_obtained ?? 0) &&
        a.submitted_at < best.submitted_at)
    ) {
      best = a;
    }
  }
  return best;
}

export interface CourseAssessment {
  id: string;
  module_id: string;
  module_title: string;
  title: string;
  kind: AssessmentKind;
  pass_threshold_percent: number;
  max_attempts: number | null;
  total_marks: number;
}

// A legacy attempt with no marks snapshot falls back to its percent of the
// assessment's current total, so it still contributes something sensible.
function attemptMarks(attempt: AttemptRow, currentTotal: number) {
  const total = attempt.total_marks ?? currentTotal;
  const obtained = attempt.marks_obtained ?? Math.round((attempt.score_percent / 100) * total);
  return { obtained, total };
}

export function summarizeCourseMarks(
  assessments: CourseAssessment[],
  attempts: AttemptRow[],
): { rows: CourseMarksAssessmentRow[]; totals: CourseMarksTotals } {
  const byAssessment = new Map<string, AttemptRow[]>();
  for (const a of attempts) {
    const list = byAssessment.get(a.assessment_id) ?? [];
    list.push(a);
    byAssessment.set(a.assessment_id, list);
  }

  const totals: CourseMarksTotals = {
    marks_obtained: 0,
    total_marks: 0,
    score_percent: null,
    module_tests_passed: 0,
    module_tests_total: 0,
  };

  const rows = assessments.map((assessment): CourseMarksAssessmentRow => {
    const own = byAssessment.get(assessment.id) ?? [];
    const best = pickBestAttempt(own);
    const bestMarks = best ? attemptMarks(best, assessment.total_marks) : null;
    const passed = own.some((a) => a.passed);
    const lastSubmitted = own.reduce<string | null>(
      (latest, a) => (!latest || a.submitted_at > latest ? a.submitted_at : latest),
      null,
    );

    if (assessment.kind === "module_test") {
      totals.module_tests_total += 1;
      if (passed) totals.module_tests_passed += 1;
      totals.marks_obtained += bestMarks?.obtained ?? 0;
      totals.total_marks += bestMarks?.total ?? assessment.total_marks;
    }

    return {
      assessment_id: assessment.id,
      module_id: assessment.module_id,
      module_title: assessment.module_title,
      title: assessment.title,
      kind: assessment.kind,
      pass_threshold_percent: assessment.pass_threshold_percent,
      max_attempts: assessment.max_attempts,
      total_marks: assessment.total_marks,
      attempts_used: own.length,
      best_marks_obtained: bestMarks?.obtained ?? null,
      best_total_marks: bestMarks?.total ?? null,
      best_score_percent: best?.score_percent ?? null,
      passed,
      last_submitted_at: lastSubmitted,
    };
  });

  if (totals.total_marks > 0) {
    totals.score_percent = Math.round((totals.marks_obtained / totals.total_marks) * 100);
  }
  return { rows, totals };
}

export interface CourseStructure {
  courseTitle: string;
  programmeId: string;
  lessonIds: string[];
  assessments: CourseAssessment[];
}

/** Loads a course's modules, lessons and assessments with each assessment's
 * current total marks. Null if the course doesn't exist. */
export async function loadCourseStructure(courseId: string): Promise<CourseStructure | null> {
  const { data: course, error: courseError } = await supabaseAdmin
    .from("courses")
    .select("title, programme_id")
    .eq("id", courseId)
    .maybeSingle();
  if (courseError) throw new Error(courseError.message);
  if (!course) return null;

  const { data: modules, error: modulesError } = await supabaseAdmin
    .from("modules")
    .select("id, title, position")
    .eq("course_id", courseId)
    .order("position", { ascending: true });
  if (modulesError) throw new Error(modulesError.message);
  const moduleList = (modules ?? []) as { id: string; title: string }[];
  const moduleIds = moduleList.map((m) => m.id);
  const moduleTitle = new Map(moduleList.map((m) => [m.id, m.title]));

  if (moduleIds.length === 0) {
    return { courseTitle: course.title, programmeId: course.programme_id, lessonIds: [], assessments: [] };
  }

  const [{ data: lessons, error: lessonsError }, { data: assessments, error: assessmentsError }] =
    await Promise.all([
      supabaseAdmin.from("lessons").select("id").in("module_id", moduleIds),
      supabaseAdmin
        .from("assessments")
        .select(
          "id, module_id, title, kind, pass_threshold_percent, max_attempts, created_at, assessment_questions(marks)",
        )
        .in("module_id", moduleIds)
        .order("created_at", { ascending: true }),
    ]);
  if (lessonsError) throw new Error(lessonsError.message);
  if (assessmentsError) throw new Error(assessmentsError.message);

  const moduleOrder = new Map(moduleIds.map((id, i) => [id, i]));
  const assessmentList = (
    (assessments ?? []) as unknown as {
      id: string;
      module_id: string;
      title: string;
      kind: AssessmentKind;
      pass_threshold_percent: number;
      max_attempts: number | null;
      assessment_questions: { marks: number }[] | null;
    }[]
  )
    .map(
      (a): CourseAssessment => ({
        id: a.id,
        module_id: a.module_id,
        module_title: moduleTitle.get(a.module_id) ?? "",
        title: a.title,
        kind: a.kind,
        pass_threshold_percent: a.pass_threshold_percent,
        max_attempts: a.max_attempts,
        total_marks: (a.assessment_questions ?? []).reduce((sum, q) => sum + q.marks, 0),
      }),
    )
    // Stable sort keeps creation order within a module.
    .sort((x, y) => (moduleOrder.get(x.module_id) ?? 0) - (moduleOrder.get(y.module_id) ?? 0));

  return {
    courseTitle: course.title,
    programmeId: course.programme_id,
    lessonIds: ((lessons ?? []) as { id: string }[]).map((l) => l.id),
    assessments: assessmentList,
  };
}

const ATTEMPT_COLUMNS =
  "id, assessment_id, trainee_id, score_percent, passed, marks_obtained, total_marks, submitted_at";

export async function getCourseMarksTally(
  courseId: string,
  traineeId: string,
): Promise<CourseMarksTally | null> {
  const structure = await loadCourseStructure(courseId);
  if (!structure) return null;
  const assessmentIds = structure.assessments.map((a) => a.id);

  const [attemptsRes, progressRes, certificateRes] = await Promise.all([
    assessmentIds.length > 0
      ? supabaseAdmin
          .from("assessment_attempts")
          .select(ATTEMPT_COLUMNS)
          .eq("trainee_id", traineeId)
          .in("assessment_id", assessmentIds)
      : Promise.resolve({ data: [], error: null }),
    structure.lessonIds.length > 0
      ? supabaseAdmin
          .from("lesson_progress")
          .select("lesson_id")
          .eq("trainee_id", traineeId)
          .in("lesson_id", structure.lessonIds)
          .not("completed_at", "is", null)
      : Promise.resolve({ data: [], error: null }),
    supabaseAdmin
      .from("certificates")
      .select("certificate_code, marks_obtained, total_marks, score_percent, issued_at")
      .eq("trainee_id", traineeId)
      .eq("course_id", courseId)
      .maybeSingle(),
  ]);
  if (attemptsRes.error) throw new Error(attemptsRes.error.message);
  if (progressRes.error) throw new Error(progressRes.error.message);
  if (certificateRes.error) throw new Error(certificateRes.error.message);

  const { rows, totals } = summarizeCourseMarks(
    structure.assessments,
    (attemptsRes.data ?? []) as AttemptRow[],
  );
  const lessonsCompleted = (progressRes.data ?? []).length;
  const lessonsTotal = structure.lessonIds.length;

  return {
    course_id: courseId,
    course_title: structure.courseTitle,
    assessments: rows,
    totals,
    lessons_completed: lessonsCompleted,
    lessons_total: lessonsTotal,
    eligible_for_certificate:
      lessonsCompleted >= lessonsTotal &&
      totals.module_tests_passed >= totals.module_tests_total &&
      (lessonsTotal > 0 || totals.module_tests_total > 0),
    certificate: certificateRes.data ?? null,
  };
}

/** Every trainee on the course's roster (approved nominees of its programme)
 * plus anyone else who has attempted one of its assessments, each with their
 * best result per assessment and module-test totals. */
export async function getCourseGradebook(courseId: string): Promise<CourseGradebook | null> {
  const structure = await loadCourseStructure(courseId);
  if (!structure) return null;
  const assessmentIds = structure.assessments.map((a) => a.id);

  const [nominationsRes, attemptsRes, certificatesRes] = await Promise.all([
    supabaseAdmin
      .from("nominations")
      .select("trainee_id")
      .eq("programme_id", structure.programmeId)
      .eq("status", "approved"),
    assessmentIds.length > 0
      ? supabaseAdmin.from("assessment_attempts").select(ATTEMPT_COLUMNS).in("assessment_id", assessmentIds)
      : Promise.resolve({ data: [], error: null }),
    supabaseAdmin.from("certificates").select("trainee_id, certificate_code").eq("course_id", courseId),
  ]);
  if (nominationsRes.error) throw new Error(nominationsRes.error.message);
  if (attemptsRes.error) throw new Error(attemptsRes.error.message);
  if (certificatesRes.error) throw new Error(certificatesRes.error.message);

  const attempts = (attemptsRes.data ?? []) as AttemptRow[];
  const traineeIds = new Set<string>([
    ...((nominationsRes.data ?? []) as { trainee_id: string }[]).map((n) => n.trainee_id),
    ...attempts.map((a) => a.trainee_id),
  ]);

  const names = new Map<string, string | null>();
  if (traineeIds.size > 0) {
    const { data: profiles, error: profilesError } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name")
      .in("id", [...traineeIds]);
    if (profilesError) throw new Error(profilesError.message);
    for (const p of (profiles ?? []) as { id: string; full_name: string | null }[]) {
      names.set(p.id, p.full_name);
    }
  }
  const certificateByTrainee = new Map(
    ((certificatesRes.data ?? []) as { trainee_id: string; certificate_code: string }[]).map((c) => [
      c.trainee_id,
      c.certificate_code,
    ]),
  );

  const rows: GradebookRow[] = [...traineeIds].map((traineeId) => {
    const { rows: summary, totals } = summarizeCourseMarks(
      structure.assessments,
      attempts.filter((a) => a.trainee_id === traineeId),
    );
    const cells: GradebookRow["cells"] = {};
    for (const r of summary) {
      cells[r.assessment_id] =
        r.attempts_used > 0
          ? {
              best_marks_obtained: r.best_marks_obtained ?? 0,
              best_total_marks: r.best_total_marks ?? r.total_marks,
              best_score_percent: r.best_score_percent ?? 0,
              passed: r.passed,
              attempts: r.attempts_used,
            }
          : null;
    }
    return {
      trainee_id: traineeId,
      full_name: names.get(traineeId) ?? null,
      cells,
      totals,
      certificate_code: certificateByTrainee.get(traineeId) ?? null,
    };
  });
  rows.sort((a, b) => (a.full_name ?? "").localeCompare(b.full_name ?? ""));

  return {
    course_id: courseId,
    course_title: structure.courseTitle,
    assessments: structure.assessments.map((a) => ({
      id: a.id,
      title: a.title,
      module_title: a.module_title,
      kind: a.kind,
      total_marks: a.total_marks,
      pass_threshold_percent: a.pass_threshold_percent,
    })),
    rows,
  };
}
