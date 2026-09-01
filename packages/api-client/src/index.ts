import type {
  Assessment,
  AssessmentAttempt,
  AssessmentQuestion,
  AssessmentQuestionForTrainee,
  Certificate,
  ContentTranslation,
  ContentType,
  Course,
  InteractiveConfig,
  Lesson,
  LessonProgress,
  Module,
  QuestionOption,
} from "@ncct/shared-types";

// Vite (web) and Metro (mobile) expose env vars differently and neither reliably
// provides a bare `process.env` at runtime in the browser bundle, so each app sets
// its own base URL at startup instead of this package reading env vars directly.
let apiBaseUrl = "http://localhost:4000";

export function setApiBaseUrl(baseUrl: string): void {
  apiBaseUrl = baseUrl;
}

export async function getHealth(): Promise<{ status: string }> {
  const res = await fetch(`${apiBaseUrl}/health`);
  if (!res.ok) {
    throw new Error(`Health check failed: ${res.status}`);
  }
  return res.json();
}

async function apiFetch<T>(
  path: string,
  accessToken: string,
  init?: { method?: string; body?: unknown },
): Promise<T> {
  const res = await fetch(`${apiBaseUrl}/api${path}`, {
    method: init?.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      typeof body === "object" && body && "error" in body
        ? JSON.stringify((body as { error: unknown }).error)
        : `Request failed: ${res.status}`,
    );
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return res.json();
}

export function getCourses(accessToken: string, programmeId: string) {
  return apiFetch<Course[]>(`/programmes/${programmeId}/courses`, accessToken);
}

export function createCourse(
  accessToken: string,
  programmeId: string,
  body: { title: string; description?: string },
) {
  return apiFetch<Course>(`/programmes/${programmeId}/courses`, accessToken, {
    method: "POST",
    body,
  });
}

export function getModules(accessToken: string, courseId: string) {
  return apiFetch<Module[]>(`/courses/${courseId}/modules`, accessToken);
}

export function createModule(
  accessToken: string,
  courseId: string,
  body: { title: string; position?: number },
) {
  return apiFetch<Module>(`/courses/${courseId}/modules`, accessToken, { method: "POST", body });
}

export function getLessons(accessToken: string, moduleId: string) {
  return apiFetch<Lesson[]>(`/modules/${moduleId}/lessons`, accessToken);
}

export function getLesson(accessToken: string, lessonId: string) {
  return apiFetch<Lesson>(`/lessons/${lessonId}`, accessToken);
}

export function createLesson(
  accessToken: string,
  moduleId: string,
  body: {
    title: string;
    content_type: ContentType;
    video_id?: string;
    interactive_config?: InteractiveConfig;
  },
) {
  return apiFetch<Lesson>(`/modules/${moduleId}/lessons`, accessToken, { method: "POST", body });
}

export function updateLesson(
  accessToken: string,
  lessonId: string,
  body: Partial<{
    title: string;
    content_type: ContentType;
    video_id: string | null;
    interactive_config: InteractiveConfig | null;
  }>,
) {
  return apiFetch<Lesson>(`/lessons/${lessonId}`, accessToken, { method: "PATCH", body });
}

export function getLessonTranslations(accessToken: string, lessonId: string) {
  return apiFetch<ContentTranslation[]>(`/lessons/${lessonId}/translations`, accessToken);
}

export function upsertLessonTranslation(
  accessToken: string,
  lessonId: string,
  locale: string,
  body: { title?: string | null; body?: string | null },
) {
  return apiFetch<ContentTranslation>(
    `/lessons/${lessonId}/translations/${encodeURIComponent(locale)}`,
    accessToken,
    { method: "PUT", body },
  );
}

export async function uploadLessonContent(
  accessToken: string,
  lessonId: string,
  file: File,
): Promise<Lesson> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${apiBaseUrl}/api/lessons/${lessonId}/content`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      typeof body === "object" && body && "error" in body
        ? JSON.stringify((body as { error: unknown }).error)
        : `Request failed: ${res.status}`,
    );
  }
  return res.json();
}

export function getLessonContentUrl(accessToken: string, lessonId: string) {
  return apiFetch<{ url: string | null; expires_in?: number }>(
    `/lessons/${lessonId}/content-url`,
    accessToken,
  );
}

// The certificate verification page is explicitly no-login (PRD §6.4) —
// this is the one fetch helper that never sends an Authorization header.
export async function getCertificate(
  code: string,
): Promise<
  | (Certificate & {
      pdf_url: string;
      trainee_name: string | null;
      programme_title: string | null;
      institution_name: string | null;
    })
  | null
> {
  const res = await fetch(`${apiBaseUrl}/api/certificates/${encodeURIComponent(code)}`);
  if (res.status === 404) {
    return null;
  }
  if (!res.ok) {
    throw new Error(`Request failed: ${res.status}`);
  }
  return res.json();
}

export function getAssessments(accessToken: string, moduleId: string) {
  return apiFetch<Assessment[]>(`/modules/${moduleId}/assessments`, accessToken);
}

export function createAssessment(
  accessToken: string,
  moduleId: string,
  body: { title: string; pass_threshold_percent?: number },
) {
  return apiFetch<Assessment>(`/modules/${moduleId}/assessments`, accessToken, {
    method: "POST",
    body,
  });
}

export function getAssessmentQuestions(accessToken: string, assessmentId: string) {
  return apiFetch<AssessmentQuestion[]>(`/assessments/${assessmentId}/questions`, accessToken);
}

export function createAssessmentQuestion(
  accessToken: string,
  assessmentId: string,
  body: { question_text: string; options: QuestionOption[]; correct_option_id: string },
) {
  return apiFetch<AssessmentQuestion>(`/assessments/${assessmentId}/questions`, accessToken, {
    method: "POST",
    body,
  });
}

export function getAssessmentToTake(accessToken: string, assessmentId: string) {
  return apiFetch<AssessmentQuestionForTrainee[]>(`/assessments/${assessmentId}/take`, accessToken);
}

export function submitAssessmentAttempt(
  accessToken: string,
  assessmentId: string,
  answers: Record<string, string>,
) {
  return apiFetch<{
    attempt: AssessmentAttempt;
    certificate: Certificate | null;
    certificateError?: string;
  }>(`/assessments/${assessmentId}/attempts`, accessToken, { method: "POST", body: { answers } });
}

export function getAssessmentAttempts(accessToken: string, assessmentId: string) {
  return apiFetch<AssessmentAttempt[]>(`/assessments/${assessmentId}/attempts`, accessToken);
}

export function getLessonProgress(accessToken: string, lessonId: string) {
  return apiFetch<LessonProgress | null>(`/lessons/${lessonId}/progress`, accessToken);
}

export function updateLessonProgress(
  accessToken: string,
  lessonId: string,
  body: Partial<{
    progress_percent: number;
    last_position_seconds: number;
    completed_at: string | null;
  }>,
) {
  return apiFetch<LessonProgress>(`/lessons/${lessonId}/progress`, accessToken, {
    method: "PATCH",
    body,
  });
}
