import { describe, expect, it, vi } from "vitest";

// Only the pure grading/tally functions below are exercised, but this
// module also imports supabaseAdmin at the top level (for its DB-loading
// exports), which throws at import time with no Supabase env vars set —
// same reasoning as skillGapService.test.ts/jobMatchingService.test.ts.
vi.mock("./supabaseClient.js", () => ({ supabaseAdmin: {} }));

import {
  type AttemptRow,
  type CourseAssessment,
  gradeAnswers,
  pickBestAttempt,
  summarizeCourseMarks,
} from "./assessmentScoring.js";

const questions = [
  { id: "q-1", correct_option_id: "a", marks: 5 },
  { id: "q-2", correct_option_id: "b", marks: 3 },
  { id: "q-3", correct_option_id: "c", marks: 2 },
];

describe("gradeAnswers", () => {
  it("sums marks only for correct answers and computes percent from marks, not question count", async () => {
    // 1 of 3 questions right, but that question is worth half the marks.
    const result = gradeAnswers(questions, { "q-1": "a", "q-2": "wrong", "q-3": "wrong" }, 60, false);
    expect(result.marks_obtained).toBe(5);
    expect(result.total_marks).toBe(10);
    expect(result.score_percent).toBe(50);
    expect(result.passed).toBe(false);
  });

  it("passes at exactly the threshold", () => {
    const result = gradeAnswers(questions, { "q-1": "a", "q-2": "b" }, 80, false);
    expect(result.score_percent).toBe(80);
    expect(result.passed).toBe(true);
  });

  it("treats an unanswered question as wrong, not an error", () => {
    const result = gradeAnswers(questions, {}, 0, false);
    expect(result.marks_obtained).toBe(0);
    expect(result.breakdown.every((b) => !b.is_correct && b.selected_option_id === null)).toBe(true);
  });

  it("hides correct_option_id in the breakdown unless revealAnswers is true", () => {
    const hidden = gradeAnswers(questions, {}, 0, false);
    expect(hidden.breakdown[0]).not.toHaveProperty("correct_option_id");

    const revealed = gradeAnswers(questions, {}, 0, true);
    expect(revealed.breakdown[0]).toMatchObject({ correct_option_id: "a" });
  });

  it("never divides by zero for an assessment with only zero-value data (defensive)", () => {
    const result = gradeAnswers([], {}, 50, false);
    expect(result.total_marks).toBe(0);
    expect(result.score_percent).toBe(0);
    expect(result.passed).toBe(false);
  });
});

function attempt(overrides: Partial<AttemptRow>): AttemptRow {
  return {
    id: "a1",
    assessment_id: "assess-1",
    trainee_id: "trainee-1",
    score_percent: 0,
    passed: false,
    marks_obtained: 0,
    total_marks: 0,
    submitted_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("pickBestAttempt", () => {
  it("returns null for an empty list", () => {
    expect(pickBestAttempt([])).toBeNull();
  });

  it("picks the highest score_percent", () => {
    const best = pickBestAttempt([
      attempt({ id: "low", score_percent: 40 }),
      attempt({ id: "high", score_percent: 90 }),
      attempt({ id: "mid", score_percent: 60 }),
    ]);
    expect(best?.id).toBe("high");
  });

  it("breaks a percent tie by higher marks_obtained", () => {
    const best = pickBestAttempt([
      attempt({ id: "fewer-marks", score_percent: 50, marks_obtained: 5, total_marks: 10 }),
      attempt({ id: "more-marks", score_percent: 50, marks_obtained: 10, total_marks: 20 }),
    ]);
    expect(best?.id).toBe("more-marks");
  });

  it("breaks a full tie by the earlier submission", () => {
    const best = pickBestAttempt([
      attempt({ id: "later", score_percent: 80, marks_obtained: 8, submitted_at: "2026-01-02" }),
      attempt({ id: "earlier", score_percent: 80, marks_obtained: 8, submitted_at: "2026-01-01" }),
    ]);
    expect(best?.id).toBe("earlier");
  });
});

function courseAssessment(overrides: Partial<CourseAssessment>): CourseAssessment {
  return {
    id: "assess-1",
    module_id: "mod-1",
    module_title: "Module 1",
    title: "Test 1",
    kind: "module_test",
    pass_threshold_percent: 60,
    max_attempts: null,
    total_marks: 10,
    ...overrides,
  };
}

describe("summarizeCourseMarks", () => {
  it("sums only module_test best attempts into totals, ignoring quizzes entirely", () => {
    const assessments = [
      courseAssessment({ id: "test-1", total_marks: 10 }),
      courseAssessment({ id: "test-2", total_marks: 20 }),
      courseAssessment({ id: "quiz-1", kind: "quiz", total_marks: 100 }),
    ];
    const attempts = [
      attempt({ id: "t1-a", assessment_id: "test-1", score_percent: 50, marks_obtained: 5, total_marks: 10, passed: false }),
      attempt({ id: "t1-b", assessment_id: "test-1", score_percent: 90, marks_obtained: 9, total_marks: 10, passed: true }),
      attempt({ id: "t2-a", assessment_id: "test-2", score_percent: 100, marks_obtained: 20, total_marks: 20, passed: true }),
      attempt({ id: "quiz-a", assessment_id: "quiz-1", score_percent: 100, marks_obtained: 100, total_marks: 100, passed: true }),
    ];

    const { rows, totals } = summarizeCourseMarks(assessments, attempts);

    expect(totals).toMatchObject({
      marks_obtained: 29, // 9 + 20, quiz excluded
      total_marks: 30,
      module_tests_passed: 2,
      module_tests_total: 2,
    });
    expect(totals.score_percent).toBe(97);

    const test1Row = rows.find((r) => r.assessment_id === "test-1");
    expect(test1Row).toMatchObject({
      attempts_used: 2,
      best_marks_obtained: 9,
      best_score_percent: 90,
      passed: true,
    });
    const quizRow = rows.find((r) => r.assessment_id === "quiz-1");
    expect(quizRow?.passed).toBe(true); // still reported per-row
  });

  it("reports an unattempted module test as not passed with no best marks", () => {
    const { rows, totals } = summarizeCourseMarks([courseAssessment({ id: "test-1" })], []);
    expect(rows[0]).toMatchObject({
      attempts_used: 0,
      best_marks_obtained: null,
      passed: false,
    });
    expect(totals.module_tests_passed).toBe(0);
    expect(totals.module_tests_total).toBe(1);
  });

  it("falls back to a legacy attempt's percent-of-current-total when it has no marks snapshot", () => {
    const assessments = [courseAssessment({ id: "test-1", total_marks: 4 })];
    const attempts = [
      attempt({
        id: "legacy",
        assessment_id: "test-1",
        score_percent: 75,
        marks_obtained: null,
        total_marks: null,
        passed: true,
      }),
    ];
    const { rows } = summarizeCourseMarks(assessments, attempts);
    expect(rows[0]).toMatchObject({ best_marks_obtained: 3, best_total_marks: 4 });
  });

  it("leaves score_percent null when there are no module tests at all", () => {
    const { totals } = summarizeCourseMarks([courseAssessment({ kind: "quiz" })], []);
    expect(totals.total_marks).toBe(0);
    expect(totals.score_percent).toBeNull();
  });
});
