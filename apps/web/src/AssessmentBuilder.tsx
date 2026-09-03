import {
  createAssessment,
  createAssessmentQuestion,
  getAssessmentQuestions,
  getAssessments,
} from "@ncct/api-client";
import type { Assessment, AssessmentQuestion } from "@ncct/shared-types";
import { createQuestionSchema } from "@ncct/validation";
import { useEffect, useState } from "react";

interface AssessmentBuilderProps {
  accessToken: string;
  moduleId: string;
}

const OPTION_LETTERS = ["a", "b", "c", "d"] as const;

// Minimal MCQ quiz builder: create an assessment under the selected module,
// then add questions with up to 4 options and a marked correct answer.
// Same "just enough to demonstrate the feature" scope as the rest of
// AdminCourseManager, not a polished authoring tool.
export function AssessmentBuilder({ accessToken, moduleId }: AssessmentBuilderProps) {
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [selectedAssessmentId, setSelectedAssessmentId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<AssessmentQuestion[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Reset-on-moduleId-change is handled by the parent mounting this
  // component with `key={moduleId}` rather than resetting state here — a
  // fresh mount is the idiomatic way to restart a component's state for a
  // new "subject" prop, and avoids a setState-in-effect render cascade.
  useEffect(() => {
    getAssessments(accessToken, moduleId)
      .then(setAssessments)
      .catch((err: Error) => setError(err.message));
  }, [accessToken, moduleId]);

  async function loadAssessments() {
    setError(null);
    try {
      setAssessments(await getAssessments(accessToken, moduleId));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function loadQuestions(assessmentId: string) {
    setError(null);
    try {
      setQuestions(await getAssessmentQuestions(accessToken, assessmentId));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleCreateAssessment(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const title = String(form.get("title") ?? "");
    const thresholdRaw = String(form.get("pass_threshold_percent") ?? "").trim();

    setError(null);
    try {
      await createAssessment(accessToken, moduleId, {
        title,
        pass_threshold_percent: thresholdRaw ? Number(thresholdRaw) : undefined,
      });
      e.currentTarget.reset();
      await loadAssessments();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleCreateQuestion(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selectedAssessmentId) return;
    const form = new FormData(e.currentTarget);
    const questionText = String(form.get("question_text") ?? "");
    const correctOptionId = String(form.get("correct_option_id") ?? "");
    const options = OPTION_LETTERS.map((letter) => ({
      id: letter,
      text: String(form.get(`option_${letter}`) ?? "").trim(),
    })).filter((o) => o.text);

    const parsed = createQuestionSchema.safeParse({
      question_text: questionText,
      options,
      correct_option_id: correctOptionId,
    });
    if (!parsed.success) {
      setError(parsed.error.issues.map((i) => i.message).join("; "));
      return;
    }

    setError(null);
    try {
      await createAssessmentQuestion(accessToken, selectedAssessmentId, parsed.data);
      e.currentTarget.reset();
      await loadQuestions(selectedAssessmentId);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    // `legacy-ui` isn't guaranteed by whatever page embeds this component
    // (AdminCourseManager doesn't wrap it), and without it every <input>/
    // <button> here falls back to each browser's raw UA-stylesheet default —
    // unstyled, and on mobile Safari specifically, under the 16px font-size
    // that stops iOS auto-zooming the page on focus. Self-contained here so
    // this component is correctly styled regardless of where it's embedded.
    <div className="assessment-builder legacy-ui">
      <h3>Assessments</h3>
      {error && <p className="form-error">{error}</p>}

      <form onSubmit={handleCreateAssessment} className="inline-form">
        <input name="title" placeholder="New assessment title" required />
        <input
          name="pass_threshold_percent"
          placeholder="Pass % (default 60)"
          type="number"
          min={0}
          max={100}
        />
        <button type="submit">Add assessment</button>
      </form>

      <ul>
        {assessments.map((a) => (
          <li key={a.id}>
            <button
              type="button"
              onClick={() => {
                setSelectedAssessmentId(a.id);
                loadQuestions(a.id);
              }}
            >
              {a.title} (pass ≥ {a.pass_threshold_percent}%)
            </button>
          </li>
        ))}
      </ul>

      {selectedAssessmentId && (
        <div className="question-editor">
          <h4>Questions</h4>
          <ul>
            {questions.map((q) => (
              <li key={q.id}>
                {q.question_text} — correct: {q.correct_option_id}
              </li>
            ))}
          </ul>

          <form onSubmit={handleCreateQuestion} className="inline-form question-form">
            <input name="question_text" placeholder="Question text" required />
            {OPTION_LETTERS.map((letter) => (
              <label key={letter} className="option-input">
                <input type="radio" name="correct_option_id" value={letter} required />
                <input name={`option_${letter}`} placeholder={`Option ${letter.toUpperCase()}`} />
              </label>
            ))}
            <button type="submit">Add question</button>
          </form>
        </div>
      )}
    </div>
  );
}
