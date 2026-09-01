import { getAssessmentToTake, getAssessments, submitAssessmentAttempt } from "@ncct/api-client";
import type {
  Assessment,
  AssessmentAttempt,
  AssessmentQuestionForTrainee,
  Certificate,
} from "@ncct/shared-types";
import { useEffect, useState } from "react";

interface QuizTakerProps {
  accessToken: string;
  moduleId: string;
}

interface SubmitResult {
  attempt: AssessmentAttempt;
  certificate: Certificate | null;
  certificateError?: string;
}

export function QuizTaker({ accessToken, moduleId }: QuizTakerProps) {
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [selectedAssessment, setSelectedAssessment] = useState<Assessment | null>(null);
  const [questions, setQuestions] = useState<AssessmentQuestionForTrainee[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Reset-on-moduleId-change comes from the parent mounting this component
  // with `key={moduleId}` (a fresh mount) rather than resetting state here.
  useEffect(() => {
    getAssessments(accessToken, moduleId)
      .then(setAssessments)
      .catch((err: Error) => setError(err.message));
  }, [accessToken, moduleId]);

  async function selectAssessment(assessment: Assessment) {
    setSelectedAssessment(assessment);
    setAnswers({});
    setResult(null);
    setError(null);
    try {
      setQuestions(await getAssessmentToTake(accessToken, assessment.id));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedAssessment) return;
    setError(null);
    try {
      setResult(await submitAssessmentAttempt(accessToken, selectedAssessment.id, answers));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="quiz-taker">
      <h3>Assessments</h3>
      {error && <p className="form-error">{error}</p>}

      <ul>
        {assessments.map((a) => (
          <li key={a.id}>
            <button type="button" onClick={() => selectAssessment(a)}>
              {a.title}
            </button>
          </li>
        ))}
      </ul>

      {selectedAssessment && questions.length > 0 && !result && (
        <form onSubmit={handleSubmit} className="quiz-form">
          {questions.map((q, i) => (
            <fieldset key={q.id}>
              <legend>
                {i + 1}. {q.question_text}
              </legend>
              {q.options.map((opt) => (
                <label key={opt.id} className="quiz-option">
                  <input
                    type="radio"
                    name={`q-${q.id}`}
                    value={opt.id}
                    checked={answers[q.id] === opt.id}
                    onChange={() => setAnswers((prev) => ({ ...prev, [q.id]: opt.id }))}
                  />
                  {opt.text}
                </label>
              ))}
            </fieldset>
          ))}
          <button type="submit">Submit answers</button>
        </form>
      )}

      {result && (
        <div className="quiz-result">
          <p>
            Score: {result.attempt.score_percent}% —{" "}
            <strong>{result.attempt.passed ? "Passed" : "Not passed"}</strong>
          </p>
          {result.certificate && (
            <p>
              <a href={`?verify=${result.certificate.certificate_code}`}>
                View your certificate ({result.certificate.certificate_code})
              </a>
            </p>
          )}
          {result.certificateError && (
            <p className="form-error">
              Certificate could not be generated: {result.certificateError}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
