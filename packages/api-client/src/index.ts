import type {
  Assessment,
  AssessmentAttempt,
  AssessmentQuestion,
  AssessmentQuestionForTrainee,
  AttendanceRecord,
  BulkImportResult,
  Certificate,
  ChatbotAnswer,
  ChatbotCorpusChunk,
  ChatbotSourceType,
  DashboardAnalytics,
  ContentTranslation,
  ContentType,
  Course,
  InteractiveConfig,
  Institution,
  Job,
  JobInterest,
  JobInterestStatus,
  Lesson,
  LessonProgress,
  Module,
  Nomination,
  NominationDecision,
  Profile,
  Programme,
  ProgrammeMode,
  QuestionOption,
  Role,
  TimetableSession,
  TraineeSearchResult,
  VisibilitySettings,
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

// F1 — own profile. getProfile (below, used by session bootstrap) returns
// only id/role/full_name; this returns the whole editable row.
export function getProfileDetails(accessToken: string) {
  return apiFetch<Profile>("/profile/details", accessToken);
}

export function updateProfile(
  accessToken: string,
  body: Partial<{
    full_name: string;
    phone: string | null;
    cooperative_affiliation: string | null;
    org_name: string | null;
    org_sector: string | null;
  }>,
) {
  return apiFetch<Profile>("/profile", accessToken, { method: "PATCH", body });
}

export function createUser(
  accessToken: string,
  body: {
    email: string;
    role: Role;
    full_name: string;
    password?: string;
    phone?: string;
    cooperative_affiliation?: string;
    org_name?: string;
    org_sector?: string;
  },
) {
  return apiFetch<{
    id: string;
    email: string;
    role: Role;
    full_name: string;
    temp_password?: string;
  }>("/users", accessToken, { method: "POST", body });
}

export function bulkImportTrainees(
  accessToken: string,
  trainees: {
    email: string;
    full_name: string;
    phone?: string;
    cooperative_affiliation?: string;
  }[],
) {
  return apiFetch<BulkImportResult>("/users/bulk-trainees", accessToken, {
    method: "POST",
    body: { trainees },
  });
}

export function getInstitutions(accessToken: string) {
  return apiFetch<Institution[]>("/institutions", accessToken);
}

export function createInstitution(
  accessToken: string,
  body: { name: string; type?: string; location?: string },
) {
  return apiFetch<Institution>("/institutions", accessToken, { method: "POST", body });
}

export function updateInstitution(
  accessToken: string,
  id: string,
  body: Partial<{ name: string; type: string; location: string }>,
) {
  return apiFetch<Institution>(`/institutions/${id}`, accessToken, { method: "PATCH", body });
}

export function deleteInstitution(accessToken: string, id: string) {
  return apiFetch<void>(`/institutions/${id}`, accessToken, { method: "DELETE" });
}

export function getProgrammes(accessToken: string) {
  return apiFetch<Programme[]>("/programmes", accessToken);
}

export function createProgramme(
  accessToken: string,
  body: {
    institution_id: string;
    title: string;
    mode: ProgrammeMode;
    description?: string;
    target_audience?: string;
    capacity?: number;
    start_date?: string;
    end_date?: string;
  },
) {
  return apiFetch<Programme>("/programmes", accessToken, { method: "POST", body });
}

// Admin review queue for one programme (distinct from getMyNominations,
// which is a trainee's own list).
export function getProgrammeNominations(accessToken: string, programmeId: string) {
  return apiFetch<Nomination[]>(`/programmes/${programmeId}/nominations`, accessToken);
}

export function decideNomination(
  accessToken: string,
  programmeId: string,
  nominationId: string,
  status: NominationDecision,
) {
  return apiFetch<Nomination>(
    `/programmes/${programmeId}/nominations/${nominationId}`,
    accessToken,
    { method: "PATCH", body: { status } },
  );
}

export function createTimetableSession(
  accessToken: string,
  programmeId: string,
  body: { title?: string; starts_at: string; ends_at: string; location?: string },
) {
  return apiFetch<TimetableSession>(`/programmes/${programmeId}/timetable`, accessToken, {
    method: "POST",
    body,
  });
}

export function nominateSelf(accessToken: string, programmeId: string) {
  return apiFetch<Nomination>(`/programmes/${programmeId}/nominations`, accessToken, {
    method: "POST",
  });
}

export function getMyNominations(accessToken: string) {
  return apiFetch<
    (Nomination & {
      programmes: {
        title: string;
        mode: string;
        start_date: string | null;
        end_date: string | null;
      } | null;
    })[]
  >("/nominations/mine", accessToken);
}

// Distinct from getCertificate(code) above, which is the public no-login
// verification lookup — this one is the authenticated trainee's own list.
export function getMyCertificates(accessToken: string) {
  return apiFetch<
    (Certificate & {
      pdf_url: string;
      programme_title: string | null;
      institution_name: string | null;
    })[]
  >("/certificates/mine", accessToken);
}

export function getTimetableSessions(accessToken: string, programmeId: string) {
  return apiFetch<TimetableSession[]>(`/programmes/${programmeId}/timetable`, accessToken);
}

export function getProgrammeProgress(accessToken: string, programmeId: string) {
  return apiFetch<{
    programme_id: string;
    total_lessons: number;
    completed_lessons: number;
    percent: number;
  }>(`/programmes/${programmeId}/progress`, accessToken);
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
    storage_path: string;
    interactive_config: InteractiveConfig | null;
  }>,
) {
  return apiFetch<Lesson>(`/lessons/${lessonId}`, accessToken, { method: "PATCH", body });
}

// Self-hosted lesson video (Backblaze B2, DECISIONS.md #20). Two-step, not
// one call: get a presigned PUT URL, then PUT the file straight to the
// storage provider yourself (never through this package's apiFetch — that
// would route it through Express, defeating the point). Call
// updateLesson(id, { storage_path: key }) afterwards to attach the upload to
// the lesson. Named provider-neutrally (not e.g. "ToB2") since nothing about
// the client side is provider-specific — only the URL it's handed is.
export function getLessonVideoUploadUrl(
  accessToken: string,
  lessonId: string,
  file: { name: string; type: string; size: number },
) {
  return apiFetch<{ upload_url: string; key: string; expires_in: number }>(
    `/lessons/${lessonId}/video-upload-url`,
    accessToken,
    {
      method: "POST",
      body: { filename: file.name, content_type: file.type, size_bytes: file.size },
    },
  );
}

export async function uploadLessonVideoFile(
  uploadUrl: string,
  file: File,
  onProgress?: (fraction: number) => void,
): Promise<void> {
  // A raw PUT to the presigned URL, not fetch() — XMLHttpRequest is what
  // still exposes upload progress events in every browser today, and a
  // multi-hundred-MB upload with no progress indicator is a bad UI, not
  // just a missing nicety.
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl);
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Video upload failed: HTTP ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error("Video upload failed: network error"));
    xhr.send(file);
  });
}

export function getLessonVideoUrl(accessToken: string, lessonId: string) {
  return apiFetch<{ url: string | null; expires_in?: number }>(
    `/lessons/${lessonId}/video-url`,
    accessToken,
  );
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
export async function getCertificate(code: string): Promise<
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

export function getFaceEmbeddingStatus(accessToken: string) {
  return apiFetch<{ enrolled: boolean }>("/face-embeddings/status", accessToken);
}

export function enrollFaceEmbedding(accessToken: string, embedding: number[]) {
  return apiFetch<{ id: string; model: string; consent_given_at: string }>(
    "/face-embeddings",
    accessToken,
    { method: "POST", body: { embedding, model: "human", consent: true } },
  );
}

// The server always recomputes the match itself (CLAUDE.md: never trust a
// client-reported face-match result) — this response shape reflects that: a
// below-threshold face check-in comes back 200 with `fallbackToQr: true` and
// no attendance record, not an error.
export type AttendanceCheckInResult =
  | (AttendanceRecord & { matched?: true })
  | { matched: false; match_score: number; fallbackToQr: true };

export function checkInWithQr(accessToken: string, sessionId: string) {
  return apiFetch<AttendanceCheckInResult>("/attendance", accessToken, {
    method: "POST",
    body: { session_id: sessionId, method: "qr" },
  });
}

export function checkInWithFace(accessToken: string, sessionId: string, embedding: number[]) {
  return apiFetch<AttendanceCheckInResult>("/attendance", accessToken, {
    method: "POST",
    body: { session_id: sessionId, method: "face", embedding },
  });
}

export function getAttendanceRoster(accessToken: string, sessionId: string) {
  return apiFetch<(AttendanceRecord & { profiles: { full_name: string | null } | null })[]>(
    `/timetable/${sessionId}/attendance`,
    accessToken,
  );
}

export function getAttendanceQr(accessToken: string, sessionId: string) {
  return apiFetch<{ qrDataUrl: string; checkInUrl: string }>(
    `/timetable/${sessionId}/qr`,
    accessToken,
  );
}

// Job listings are public data (no requireAuth on the API side, matching
// `jobs_public_read`'s RLS design) — this is the one job-board fetch that
// works with no accessToken, same category as getCertificate.
export async function getJobs(filters?: { location?: string; skill?: string }): Promise<Job[]> {
  const params = new URLSearchParams();
  if (filters?.location) params.set("location", filters.location);
  if (filters?.skill) params.set("skill", filters.skill);
  const qs = params.toString();
  const res = await fetch(`${apiBaseUrl}/api/jobs${qs ? `?${qs}` : ""}`);
  if (!res.ok) {
    throw new Error(`Request failed: ${res.status}`);
  }
  return res.json();
}

export function createJob(
  accessToken: string,
  body: { title: string; description?: string; required_skills?: string[]; location?: string },
) {
  return apiFetch<Job>("/jobs", accessToken, { method: "POST", body });
}

export function getEmployerTrainees(
  accessToken: string,
  filters?: { q?: string; location?: string },
) {
  const params = new URLSearchParams();
  if (filters?.q) params.set("q", filters.q);
  if (filters?.location) params.set("location", filters.location);
  const qs = params.toString();
  return apiFetch<TraineeSearchResult[]>(`/employer/trainees${qs ? `?${qs}` : ""}`, accessToken);
}

export function shortlistTrainee(accessToken: string, jobId: string, traineeId: string) {
  return apiFetch<JobInterest>(`/jobs/${jobId}/interests`, accessToken, {
    method: "POST",
    body: { trainee_id: traineeId },
  });
}

export function getJobInterests(accessToken: string, jobId: string) {
  return apiFetch<(JobInterest & { profiles: { full_name: string | null } | null })[]>(
    `/jobs/${jobId}/interests`,
    accessToken,
  );
}

export function updateJobInterestStatus(
  accessToken: string,
  jobId: string,
  interestId: string,
  status: JobInterestStatus,
) {
  return apiFetch<JobInterest>(`/jobs/${jobId}/interests/${interestId}`, accessToken, {
    method: "PATCH",
    body: { status },
  });
}

export function getMyJobInterests(accessToken: string) {
  return apiFetch<(JobInterest & { jobs: { title: string; location: string | null } | null })[]>(
    "/job-interests/mine",
    accessToken,
  );
}

export function getVisibilitySettings(accessToken: string) {
  return apiFetch<VisibilitySettings>("/visibility-settings", accessToken);
}

export function updateVisibilitySettings(accessToken: string, visibleToEmployers: boolean) {
  return apiFetch<VisibilitySettings>("/visibility-settings", accessToken, {
    method: "PUT",
    body: { visible_to_employers: visibleToEmployers },
  });
}

export function askChatbot(accessToken: string, question: string) {
  return apiFetch<ChatbotAnswer>("/chatbot/ask", accessToken, {
    method: "POST",
    body: { question },
  });
}

export function getCorpusChunks(accessToken: string) {
  return apiFetch<ChatbotCorpusChunk[]>("/chatbot/corpus", accessToken);
}

export function createCorpusChunk(
  accessToken: string,
  body: { source_type: ChatbotSourceType; content: string; source_id?: string | null },
) {
  return apiFetch<ChatbotCorpusChunk>("/chatbot/corpus", accessToken, { method: "POST", body });
}

export function deleteCorpusChunk(accessToken: string, id: string) {
  return apiFetch<void>(`/chatbot/corpus/${id}`, accessToken, { method: "DELETE" });
}

export function getDashboardAnalytics(accessToken: string) {
  return apiFetch<DashboardAnalytics>("/analytics/dashboard", accessToken);
}
