import {
  bulkCreateAssessmentQuestions,
  createAssessment,
  createAssessmentQuestion,
  deleteAssessment,
  deleteAssessmentQuestion,
  getAssessmentQuestions,
  getAssessments,
  previewAssessment,
  updateAssessment,
  updateAssessmentQuestion,
  type AssessmentInput,
  type QuestionInput,
} from "@ncct/api-client";
import { ASSESSMENT_KINDS, MAX_QUESTION_OPTIONS } from "@ncct/constants";
import type { AssessmentKind, AssessmentQuestion, AssessmentWithTotals, GradedResult } from "@ncct/shared-types";
import { createQuestionSchema } from "@ncct/validation";
import { useEffect, useState } from "react";
import { useLocale, type Locale } from "./i18n/LocaleContext.js";

interface AssessmentBuilderProps {
  accessToken: string;
  moduleId: string;
}

const OPTION_LETTERS = Array.from({ length: MAX_QUESTION_OPTIONS }, (_, i) =>
  String.fromCharCode(97 + i),
) as string[];

interface AssessmentBuilderText {
  assessments: string;
  titlePlaceholder: string;
  descriptionPlaceholder: string;
  kindLabel: string;
  kind: Record<AssessmentKind, string>;
  kindHint: Record<AssessmentKind, string>;
  passThresholdPlaceholder: string;
  maxAttemptsPlaceholder: string;
  unlimitedAttempts: string;
  addAssessment: string;
  saveChanges: string;
  edit: string;
  delete: string;
  cancel: string;
  confirmDeleteAssessment: string;
  confirmDeleteQuestion: string;
  assessmentSummary: (questionCount: number, totalMarks: number, passPercent: number) => string;
  attemptsAllowed: (n: number) => string;
  questions: string;
  questionMarks: (marks: number) => string;
  questionTextPlaceholder: string;
  optionPlaceholder: (letter: string) => string;
  marksLabel: string;
  addQuestion: string;
  removeOption: string;
  addOption: string;
  tryTest: string;
  hideTest: string;
  submitPreview: string;
  previewResult: (marks: number, total: number, percent: number) => string;
  previewPassed: string;
  previewFailed: string;
  correctAnswerWas: (text: string) => string;
  csvTitle: string;
  csvHint: string;
  csvDownloadTemplate: string;
  csvChooseFile: string;
  csvRowsReady: (n: number) => string;
  csvImport: string;
  csvNothingToImport: string;
}

const content: Record<Locale, AssessmentBuilderText> = {
  en: {
    assessments: "Assessments",
    titlePlaceholder: "Assessment title",
    descriptionPlaceholder: "Description (optional) — shown to trainees before they start",
    kindLabel: "Type",
    kind: { quiz: "Practice Quiz", module_test: "Graded Module Test" },
    kindHint: {
      quiz: "Ungraded practice — never blocks a certificate, answers are shown after every attempt.",
      module_test: "Counts toward the course's marks tally and must be passed for the certificate.",
    },
    passThresholdPlaceholder: "Pass % (default 60)",
    maxAttemptsPlaceholder: "Max attempts (blank = unlimited)",
    unlimitedAttempts: "Unlimited attempts",
    addAssessment: "Add assessment",
    saveChanges: "Save changes",
    edit: "Edit",
    delete: "Delete",
    cancel: "Cancel",
    confirmDeleteAssessment: "Delete this assessment and all its questions and attempts?",
    confirmDeleteQuestion: "Delete this question?",
    assessmentSummary: (questionCount, totalMarks, passPercent) =>
      `${questionCount} question${questionCount === 1 ? "" : "s"} · ${totalMarks} marks · pass ≥ ${passPercent}%`,
    attemptsAllowed: (n) => `${n} attempt${n === 1 ? "" : "s"} allowed`,
    questions: "Questions",
    questionMarks: (marks) => `${marks} mark${marks === 1 ? "" : "s"}`,
    questionTextPlaceholder: "Question text",
    optionPlaceholder: (letter) => `Option ${letter.toUpperCase()}`,
    marksLabel: "Marks",
    addQuestion: "Add question",
    removeOption: "Remove",
    addOption: "Add option",
    tryTest: "Try this test",
    hideTest: "Hide preview",
    submitPreview: "Grade my answers",
    previewResult: (marks, total, percent) => `You scored ${marks} / ${total} (${percent}%)`,
    previewPassed: "Would pass",
    previewFailed: "Would not pass",
    correctAnswerWas: (text) => `Correct answer: ${text}`,
    csvTitle: "Bulk import questions (CSV)",
    csvHint:
      "Columns: question_text, option_a..option_f (blank = unused), correct_option (matching letter), marks (optional, default 1).",
    csvDownloadTemplate: "Download CSV template",
    csvChooseFile: "Choose CSV file",
    csvRowsReady: (n) => `${n} question${n === 1 ? "" : "s"} ready to import`,
    csvImport: "Import questions",
    csvNothingToImport: "Select a CSV file with at least one valid question row first.",
  },
  hi: {
    assessments: "मूल्यांकन",
    titlePlaceholder: "मूल्यांकन शीर्षक",
    descriptionPlaceholder: "विवरण (वैकल्पिक) — प्रशिक्षणार्थियों को शुरू करने से पहले दिखाया जाता है",
    kindLabel: "प्रकार",
    kind: { quiz: "अभ्यास क्विज़", module_test: "श्रेणीबद्ध मॉड्यूल परीक्षा" },
    kindHint: {
      quiz: "अश्रेणीबद्ध अभ्यास — प्रमाणपत्र को कभी नहीं रोकता, हर प्रयास के बाद उत्तर दिखाए जाते हैं।",
      module_test: "पाठ्यक्रम के अंक योग में गिना जाता है और प्रमाणपत्र के लिए उत्तीर्ण होना आवश्यक है।",
    },
    passThresholdPlaceholder: "उत्तीर्ण % (डिफ़ॉल्ट 60)",
    maxAttemptsPlaceholder: "अधिकतम प्रयास (खाली = असीमित)",
    unlimitedAttempts: "असीमित प्रयास",
    addAssessment: "मूल्यांकन जोड़ें",
    saveChanges: "परिवर्तन सहेजें",
    edit: "संपादित करें",
    delete: "हटाएं",
    cancel: "रद्द करें",
    confirmDeleteAssessment: "इस मूल्यांकन और इसके सभी प्रश्न व प्रयास हटाएं?",
    confirmDeleteQuestion: "यह प्रश्न हटाएं?",
    assessmentSummary: (questionCount, totalMarks, passPercent) =>
      `${questionCount} प्रश्न · ${totalMarks} अंक · उत्तीर्ण ≥ ${passPercent}%`,
    attemptsAllowed: (n) => `${n} प्रयास की अनुमति`,
    questions: "प्रश्न",
    questionMarks: (marks) => `${marks} अंक`,
    questionTextPlaceholder: "प्रश्न टेक्स्ट",
    optionPlaceholder: (letter) => `विकल्प ${letter.toUpperCase()}`,
    marksLabel: "अंक",
    addQuestion: "प्रश्न जोड़ें",
    removeOption: "हटाएं",
    addOption: "विकल्प जोड़ें",
    tryTest: "यह परीक्षा आज़माएं",
    hideTest: "पूर्वावलोकन छिपाएं",
    submitPreview: "मेरे उत्तर जांचें",
    previewResult: (marks, total, percent) => `आपने ${marks} / ${total} (${percent}%) अंक प्राप्त किए`,
    previewPassed: "उत्तीर्ण होगा",
    previewFailed: "उत्तीर्ण नहीं होगा",
    correctAnswerWas: (text) => `सही उत्तर: ${text}`,
    csvTitle: "प्रश्न बल्क आयात करें (CSV)",
    csvHint:
      "कॉलम: question_text, option_a..option_f (खाली = अप्रयुक्त), correct_option (मिलता अक्षर), marks (वैकल्पिक, डिफ़ॉल्ट 1)।",
    csvDownloadTemplate: "CSV टेम्पलेट डाउनलोड करें",
    csvChooseFile: "CSV फ़ाइल चुनें",
    csvRowsReady: (n) => `${n} प्रश्न आयात के लिए तैयार`,
    csvImport: "प्रश्न आयात करें",
    csvNothingToImport: "पहले कम से कम एक वैध प्रश्न पंक्ति वाली CSV फ़ाइल चुनें।",
  },
};

interface QuestionFormState {
  question_text: string;
  options: { id: string; text: string }[];
  correct_option_id: string;
  marks: string;
}

function emptyQuestionForm(): QuestionFormState {
  return {
    question_text: "",
    options: OPTION_LETTERS.slice(0, 2).map((id) => ({ id, text: "" })),
    correct_option_id: "",
    marks: "1",
  };
}

// Fixed column layout — question_text, one column per possible option letter
// (blank = unused), then correct_option and marks — rather than a flexible
// header-driven order, since the option-count column can't vary per row.
const CSV_TEMPLATE = `question_text,${OPTION_LETTERS.map((l) => `option_${l}`).join(",")},correct_option,marks
"Who owns a cooperative society?",A single private investor,The government,Its members,A bank,,,c,5
`;

// A quoted field can contain commas (question text routinely does), so a
// plain String.split(",") — good enough for the simpler trainee-CSV import
// elsewhere — isn't safe here. This handles quotes and doubled-quote
// escaping but not embedded newlines, which is an acceptable limit for a
// one-row-per-question sheet.
function splitCsvRow(line: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      cells.push(cell);
      cell = "";
    } else {
      cell += ch;
    }
  }
  cells.push(cell);
  return cells.map((c) => c.trim());
}

function parseQuestionCsvRow(cells: string[], rowNum: number): { question?: QuestionInput; error?: string } {
  const question_text = cells[0] ?? "";
  const optionCells = OPTION_LETTERS.map((_, i) => cells[1 + i] ?? "");
  const correctLetter = (cells[1 + MAX_QUESTION_OPTIONS] ?? "").toLowerCase();
  const marksCell = cells[2 + MAX_QUESTION_OPTIONS] ?? "";

  const options = OPTION_LETTERS.map((id, i) => ({ id, text: optionCells[i] })).filter((o) => o.text);

  const parsed = createQuestionSchema.safeParse({
    question_text,
    options,
    correct_option_id: correctLetter,
    marks: marksCell ? Number(marksCell) : undefined,
  });
  if (!parsed.success) {
    return { error: `Row ${rowNum}: ${parsed.error.issues.map((i) => i.message).join("; ")}` };
  }
  return { question: parsed.data };
}

function parseQuestionCsv(text: string): { questions: QuestionInput[]; errors: string[] } {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return { questions: [], errors: [] };

  const hasHeader = (splitCsvRow(lines[0])[0] ?? "").toLowerCase() === "question_text";
  const dataLines = hasHeader ? lines.slice(1) : lines;

  const questions: QuestionInput[] = [];
  const errors: string[] = [];
  dataLines.forEach((line, i) => {
    const result = parseQuestionCsvRow(splitCsvRow(line), i + (hasHeader ? 2 : 1));
    if (result.error) errors.push(result.error);
    else if (result.question) questions.push(result.question);
  });
  return { questions, errors };
}

// Full assessment authoring for both practice quizzes and graded module
// tests: create/edit/delete the assessment and its questions, per-question
// marks, an attempt cap, and a staff-only "try this test" preview that
// grades through the exact same server-side path a trainee's real
// submission does, so a trainer can sit their own test before trainees do.
// docs/DECISIONS.md #53.
export function AssessmentBuilder({ accessToken, moduleId }: AssessmentBuilderProps) {
  const { locale } = useLocale();
  const t = content[locale];
  const [assessments, setAssessments] = useState<AssessmentWithTotals[]>([]);
  const [selectedAssessmentId, setSelectedAssessmentId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<AssessmentQuestion[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [editingAssessmentId, setEditingAssessmentId] = useState<string | null>(null);
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [questionForm, setQuestionForm] = useState<QuestionFormState>(emptyQuestionForm());

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewAnswers, setPreviewAnswers] = useState<Record<string, string>>({});
  const [previewResult, setPreviewResult] = useState<GradedResult | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);

  const [csvFileName, setCsvFileName] = useState<string | null>(null);
  const [csvQuestions, setCsvQuestions] = useState<QuestionInput[]>([]);
  const [csvErrors, setCsvErrors] = useState<string[]>([]);
  const [csvBusy, setCsvBusy] = useState(false);

  // Reset-on-moduleId-change is handled by the parent mounting this
  // component with `key={moduleId}` rather than resetting state here.
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

  function selectAssessment(assessmentId: string) {
    setSelectedAssessmentId(assessmentId);
    setEditingQuestionId(null);
    setQuestionForm(emptyQuestionForm());
    setPreviewOpen(false);
    setPreviewResult(null);
    setPreviewAnswers({});
    setCsvFileName(null);
    setCsvQuestions([]);
    setCsvErrors([]);
    void loadQuestions(assessmentId);
  }

  function readAssessmentInput(form: HTMLFormElement): AssessmentInput {
    const data = new FormData(form);
    const thresholdRaw = String(data.get("pass_threshold_percent") ?? "").trim();
    const maxAttemptsRaw = String(data.get("max_attempts") ?? "").trim();
    return {
      title: String(data.get("title") ?? "").trim(),
      kind: data.get("kind") as AssessmentKind,
      description: String(data.get("description") ?? "").trim() || null,
      pass_threshold_percent: thresholdRaw ? Number(thresholdRaw) : undefined,
      max_attempts: maxAttemptsRaw ? Number(maxAttemptsRaw) : null,
    };
  }

  async function handleCreateAssessment(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // The native event's currentTarget is cleared as soon as dispatch
    // finishes — reading it after an `await` (as the form-reset call below
    // needs to) throws "Cannot read properties of null (reading 'reset')",
    // so it has to be captured into a local variable first.
    const form = e.currentTarget;
    setError(null);
    try {
      await createAssessment(accessToken, moduleId, readAssessmentInput(form));
      form.reset();
      await loadAssessments();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleUpdateAssessment(e: React.FormEvent<HTMLFormElement>, assessmentId: string) {
    e.preventDefault();
    setError(null);
    try {
      await updateAssessment(accessToken, assessmentId, readAssessmentInput(e.currentTarget));
      setEditingAssessmentId(null);
      await loadAssessments();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleDeleteAssessment(assessmentId: string) {
    if (!window.confirm(t.confirmDeleteAssessment)) return;
    setError(null);
    try {
      await deleteAssessment(accessToken, assessmentId);
      if (selectedAssessmentId === assessmentId) {
        setSelectedAssessmentId(null);
        setQuestions([]);
      }
      await loadAssessments();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  function readQuestionInput(): QuestionInput | null {
    const options = questionForm.options
      .map((o) => ({ id: o.id, text: o.text.trim() }))
      .filter((o) => o.text);
    const parsed = createQuestionSchema.safeParse({
      question_text: questionForm.question_text.trim(),
      options,
      correct_option_id: questionForm.correct_option_id,
      marks: questionForm.marks.trim() ? Number(questionForm.marks) : undefined,
    });
    if (!parsed.success) {
      setError(parsed.error.issues.map((i) => i.message).join("; "));
      return null;
    }
    setError(null);
    return parsed.data;
  }

  async function handleCreateQuestion(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedAssessmentId) return;
    const input = readQuestionInput();
    if (!input) return;
    try {
      await createAssessmentQuestion(accessToken, selectedAssessmentId, input);
      setQuestionForm(emptyQuestionForm());
      await loadQuestions(selectedAssessmentId);
      await loadAssessments(); // refreshes the assessment's total_marks
    } catch (err) {
      setError((err as Error).message);
    }
  }

  function startEditQuestion(q: AssessmentQuestion) {
    setEditingQuestionId(q.id);
    setQuestionForm({
      question_text: q.question_text,
      options: q.options,
      correct_option_id: q.correct_option_id,
      marks: String(q.marks),
    });
  }

  async function handleUpdateQuestion(e: React.FormEvent) {
    e.preventDefault();
    if (!editingQuestionId || !selectedAssessmentId) return;
    const input = readQuestionInput();
    if (!input) return;
    try {
      await updateAssessmentQuestion(accessToken, editingQuestionId, input);
      setEditingQuestionId(null);
      setQuestionForm(emptyQuestionForm());
      await loadQuestions(selectedAssessmentId);
      await loadAssessments();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleDeleteQuestion(questionId: string) {
    if (!selectedAssessmentId || !window.confirm(t.confirmDeleteQuestion)) return;
    setError(null);
    try {
      await deleteAssessmentQuestion(accessToken, questionId);
      await loadQuestions(selectedAssessmentId);
      await loadAssessments();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  function handleCsvFileSelected(file: File) {
    setCsvFileName(file.name);
    setError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const { questions, errors } = parseQuestionCsv(text ?? "");
      setCsvQuestions(questions);
      setCsvErrors(errors);
    };
    reader.readAsText(file);
  }

  async function handleImportCsv() {
    if (!selectedAssessmentId || csvQuestions.length === 0) return;
    setError(null);
    setCsvBusy(true);
    try {
      await bulkCreateAssessmentQuestions(accessToken, selectedAssessmentId, csvQuestions);
      setCsvFileName(null);
      setCsvQuestions([]);
      setCsvErrors([]);
      await loadQuestions(selectedAssessmentId);
      await loadAssessments();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCsvBusy(false);
    }
  }

  async function handleSubmitPreview(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedAssessmentId) return;
    setError(null);
    setPreviewBusy(true);
    try {
      setPreviewResult(await previewAssessment(accessToken, selectedAssessmentId, previewAnswers));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPreviewBusy(false);
    }
  }

  function updateOptionText(index: number, text: string) {
    setQuestionForm((prev) => {
      const options = [...prev.options];
      options[index] = { ...options[index], text };
      return { ...prev, options };
    });
  }

  function addOption() {
    setQuestionForm((prev) => {
      if (prev.options.length >= MAX_QUESTION_OPTIONS) return prev;
      const nextLetter = OPTION_LETTERS[prev.options.length];
      return { ...prev, options: [...prev.options, { id: nextLetter, text: "" }] };
    });
  }

  function removeOption(index: number) {
    setQuestionForm((prev) => {
      if (prev.options.length <= 2) return prev;
      const removed = prev.options[index];
      const options = prev.options.filter((_, i) => i !== index);
      return {
        ...prev,
        options,
        correct_option_id: prev.correct_option_id === removed.id ? "" : prev.correct_option_id,
      };
    });
  }

  const selectedAssessment = assessments.find((a) => a.id === selectedAssessmentId) ?? null;

  return (
    <div className="assessment-builder legacy-ui">
      <h3>{t.assessments}</h3>
      {error && <p className="form-error">{error}</p>}

      <form onSubmit={handleCreateAssessment} className="inline-form">
        <input name="title" placeholder={t.titlePlaceholder} required />
        <select name="kind" defaultValue="module_test">
          {ASSESSMENT_KINDS.map((k) => (
            <option key={k} value={k}>
              {t.kind[k]}
            </option>
          ))}
        </select>
        <input
          name="pass_threshold_percent"
          placeholder={t.passThresholdPlaceholder}
          type="number"
          min={0}
          max={100}
        />
        <input name="max_attempts" placeholder={t.maxAttemptsPlaceholder} type="number" min={1} />
        <input name="description" placeholder={t.descriptionPlaceholder} />
        <button type="submit">{t.addAssessment}</button>
      </form>

      <ul>
        {assessments.map((a) =>
          editingAssessmentId === a.id ? (
            <li key={a.id}>
              <form onSubmit={(e) => void handleUpdateAssessment(e, a.id)} className="inline-form">
                <input name="title" defaultValue={a.title} required />
                <select name="kind" defaultValue={a.kind}>
                  {ASSESSMENT_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {t.kind[k]}
                    </option>
                  ))}
                </select>
                <input
                  name="pass_threshold_percent"
                  defaultValue={a.pass_threshold_percent}
                  type="number"
                  min={0}
                  max={100}
                />
                <input
                  name="max_attempts"
                  defaultValue={a.max_attempts ?? ""}
                  placeholder={t.maxAttemptsPlaceholder}
                  type="number"
                  min={1}
                />
                <input name="description" defaultValue={a.description ?? ""} />
                <button type="submit">{t.saveChanges}</button>
                <button type="button" onClick={() => setEditingAssessmentId(null)}>
                  {t.cancel}
                </button>
              </form>
            </li>
          ) : (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => selectAssessment(a.id)}
                className={selectedAssessmentId === a.id ? "is-selected" : undefined}
              >
                [{t.kind[a.kind]}] {a.title} —{" "}
                {t.assessmentSummary(a.question_count, a.total_marks, a.pass_threshold_percent)}
                {a.max_attempts !== null && ` · ${t.attemptsAllowed(a.max_attempts)}`}
              </button>
              <button type="button" onClick={() => setEditingAssessmentId(a.id)}>
                {t.edit}
              </button>
              <button type="button" onClick={() => void handleDeleteAssessment(a.id)}>
                {t.delete}
              </button>
            </li>
          ),
        )}
      </ul>

      {selectedAssessment && (
        <div className="question-editor">
          <p>{t.kindHint[selectedAssessment.kind]}</p>
          <h4>{t.questions}</h4>
          <ul>
            {questions.map((q) => (
              <li key={q.id}>
                {editingQuestionId === q.id ? null : (
                  <>
                    <span>
                      {q.question_text} — {t.questionMarks(q.marks)} (
                      {t.correctAnswerWas(
                        q.options.find((o) => o.id === q.correct_option_id)?.text ?? q.correct_option_id,
                      )}
                      )
                    </span>
                    <button type="button" onClick={() => startEditQuestion(q)}>
                      {t.edit}
                    </button>
                    <button type="button" onClick={() => void handleDeleteQuestion(q.id)}>
                      {t.delete}
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>

          <form
            onSubmit={(e) => void (editingQuestionId ? handleUpdateQuestion(e) : handleCreateQuestion(e))}
            className="inline-form question-form"
          >
            <input
              value={questionForm.question_text}
              onChange={(e) => setQuestionForm((prev) => ({ ...prev, question_text: e.target.value }))}
              placeholder={t.questionTextPlaceholder}
              required
            />
            {questionForm.options.map((opt, i) => (
              <label key={opt.id} className="option-input">
                <input
                  type="radio"
                  name="correct_option_id"
                  checked={questionForm.correct_option_id === opt.id}
                  onChange={() => setQuestionForm((prev) => ({ ...prev, correct_option_id: opt.id }))}
                  required
                />
                <input
                  value={opt.text}
                  onChange={(e) => updateOptionText(i, e.target.value)}
                  placeholder={t.optionPlaceholder(opt.id)}
                />
                {questionForm.options.length > 2 && (
                  <button type="button" onClick={() => removeOption(i)}>
                    {t.removeOption}
                  </button>
                )}
              </label>
            ))}
            {questionForm.options.length < MAX_QUESTION_OPTIONS && (
              <button type="button" onClick={addOption}>
                {t.addOption}
              </button>
            )}
            <label>
              {t.marksLabel}
              <input
                value={questionForm.marks}
                onChange={(e) => setQuestionForm((prev) => ({ ...prev, marks: e.target.value }))}
                type="number"
                min={1}
                required
              />
            </label>
            <button type="submit">{t.addQuestion}</button>
            {editingQuestionId && (
              <button
                type="button"
                onClick={() => {
                  setEditingQuestionId(null);
                  setQuestionForm(emptyQuestionForm());
                }}
              >
                {t.cancel}
              </button>
            )}
          </form>

          <div className="csv-import">
            <h4>{t.csvTitle}</h4>
            <p className="hint">{t.csvHint}</p>
            <a
              href={`data:text/csv;charset=utf-8,${encodeURIComponent(CSV_TEMPLATE)}`}
              download="assessment-questions-template.csv"
            >
              {t.csvDownloadTemplate}
            </a>
            <div className="inline-form">
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleCsvFileSelected(file);
                }}
              />
              {csvFileName && (
                <button type="button" disabled={csvQuestions.length === 0 || csvBusy} onClick={() => void handleImportCsv()}>
                  {csvBusy ? "…" : t.csvImport}
                </button>
              )}
            </div>
            {csvFileName && csvErrors.length === 0 && csvQuestions.length === 0 && (
              <p className="form-error">{t.csvNothingToImport}</p>
            )}
            {csvFileName && csvQuestions.length > 0 && <p>{t.csvRowsReady(csvQuestions.length)}</p>}
            {csvErrors.length > 0 && (
              <ul className="form-error">
                {csvErrors.map((err) => (
                  <li key={err}>{err}</li>
                ))}
              </ul>
            )}
          </div>

          {questions.length > 0 && (
            <div className="assessment-preview">
              <button
                type="button"
                onClick={() => {
                  setPreviewOpen((open) => !open);
                  setPreviewResult(null);
                  setPreviewAnswers({});
                }}
              >
                {previewOpen ? t.hideTest : t.tryTest}
              </button>

              {previewOpen && !previewResult && (
                <form onSubmit={(e) => void handleSubmitPreview(e)} className="quiz-form">
                  {questions.map((q, i) => (
                    <fieldset key={q.id}>
                      <legend>
                        {i + 1}. {q.question_text} ({t.questionMarks(q.marks)})
                      </legend>
                      {q.options.map((opt) => (
                        <label key={opt.id} className="quiz-option">
                          <input
                            type="radio"
                            name={`preview-${q.id}`}
                            value={opt.id}
                            checked={previewAnswers[q.id] === opt.id}
                            onChange={() =>
                              setPreviewAnswers((prev) => ({ ...prev, [q.id]: opt.id }))
                            }
                          />
                          {opt.text}
                        </label>
                      ))}
                    </fieldset>
                  ))}
                  <button type="submit" disabled={previewBusy}>
                    {t.submitPreview}
                  </button>
                </form>
              )}

              {previewResult && (
                <div className="quiz-result">
                  <p>
                    {t.previewResult(
                      previewResult.marks_obtained,
                      previewResult.total_marks,
                      previewResult.score_percent,
                    )}{" "}
                    — <strong>{previewResult.passed ? t.previewPassed : t.previewFailed}</strong>
                  </p>
                  <ul>
                    {previewResult.breakdown.map((b) => {
                      const q = questions.find((question) => question.id === b.question_id);
                      const correctText = q?.options.find((o) => o.id === b.correct_option_id)?.text;
                      return (
                        <li key={b.question_id}>
                          {q?.question_text} — {b.is_correct ? "✓" : "✗"} ({b.marks_awarded}/{b.marks})
                          {!b.is_correct && correctText && ` — ${t.correctAnswerWas(correctText)}`}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
