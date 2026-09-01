import {
  createCourse,
  createLesson,
  createModule,
  getCourses,
  getModules,
  getLessons,
  updateLesson,
  upsertLessonTranslation,
  uploadLessonContent,
} from "@ncct/api-client";
import { SUGGESTED_LOCALES } from "@ncct/constants";
import type { ContentType, Course, Lesson, Module } from "@ncct/shared-types";
import { createLessonSchema, localeSchema, youtubeVideoIdSchema } from "@ncct/validation";
import { useState } from "react";
import { AssessmentBuilder } from "./AssessmentBuilder.js";

interface AdminCourseManagerProps {
  accessToken: string;
}

// Minimal admin content-authoring UI: deliberately just enough to create a
// course/module/lesson hierarchy and attach either a YouTube video_id or an
// uploaded PDF/slides file to a lesson, not a full content-authoring
// experience.
export function AdminCourseManager({ accessToken }: AdminCourseManagerProps) {
  const [programmeId, setProgrammeId] = useState("");
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [modules, setModules] = useState<Module[]>([]);
  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function loadCourses(id: string) {
    setError(null);
    try {
      setCourses(await getCourses(accessToken, id));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function loadModules(courseId: string) {
    setError(null);
    try {
      setModules(await getModules(accessToken, courseId));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function loadLessons(moduleId: string) {
    setError(null);
    try {
      setLessons(await getLessons(accessToken, moduleId));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleCreateCourse(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const title = String(form.get("title") ?? "");
    setError(null);
    try {
      await createCourse(accessToken, programmeId, { title });
      e.currentTarget.reset();
      await loadCourses(programmeId);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleCreateModule(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selectedCourseId) return;
    const form = new FormData(e.currentTarget);
    const title = String(form.get("title") ?? "");
    setError(null);
    try {
      await createModule(accessToken, selectedCourseId, { title });
      e.currentTarget.reset();
      await loadModules(selectedCourseId);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleCreateLesson(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selectedModuleId) return;
    const form = new FormData(e.currentTarget);
    const title = String(form.get("title") ?? "");
    const contentType = String(form.get("content_type") ?? "text") as ContentType;
    const videoIdRaw = String(form.get("video_id") ?? "").trim();
    const interactiveRaw = String(form.get("interactive_config") ?? "").trim();

    let interactiveConfig: unknown;
    if (contentType === "interactive" && interactiveRaw) {
      try {
        interactiveConfig = JSON.parse(interactiveRaw);
      } catch {
        setError('Interactive config must be valid JSON, e.g. {"type":"matching","pairs":[...]}');
        return;
      }
    }

    const parsed = createLessonSchema.safeParse({
      title,
      content_type: contentType,
      video_id: contentType === "video" && videoIdRaw ? videoIdRaw : undefined,
      interactive_config: interactiveConfig,
    });
    if (!parsed.success) {
      setError(parsed.error.issues.map((i) => i.message).join("; "));
      return;
    }

    setError(null);
    try {
      await createLesson(accessToken, selectedModuleId, parsed.data);
      e.currentTarget.reset();
      await loadLessons(selectedModuleId);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleAddTranslation(e: React.FormEvent<HTMLFormElement>, lessonId: string) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const localeRaw = String(form.get("locale") ?? "").trim();
    const title = String(form.get("title") ?? "").trim();
    const body = String(form.get("body") ?? "").trim();

    const parsedLocale = localeSchema.safeParse(localeRaw);
    if (!parsedLocale.success) {
      setError(parsedLocale.error.issues.map((i) => i.message).join("; "));
      return;
    }

    setError(null);
    try {
      await upsertLessonTranslation(accessToken, lessonId, parsedLocale.data, {
        title: title || undefined,
        body: body || undefined,
      });
      e.currentTarget.reset();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleUploadFile(lessonId: string, file: File) {
    setError(null);
    try {
      await uploadLessonContent(accessToken, lessonId, file);
      if (selectedModuleId) await loadLessons(selectedModuleId);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleUpdateVideo(lessonId: string, videoId: string) {
    const trimmed = videoId.trim();
    const parsed = trimmed ? youtubeVideoIdSchema.safeParse(trimmed) : { success: true as const };
    if (!parsed.success) {
      setError(parsed.error.issues.map((i) => i.message).join("; "));
      return;
    }
    setError(null);
    try {
      await updateLesson(accessToken, lessonId, { video_id: trimmed || null });
      if (selectedModuleId) await loadLessons(selectedModuleId);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="admin-panel">
      <h2>Course management</h2>
      {error && <p className="form-error">{error}</p>}

      <section>
        <label>
          Programme ID
          <input
            value={programmeId}
            onChange={(e) => setProgrammeId(e.target.value)}
            onBlur={() => programmeId && loadCourses(programmeId)}
            placeholder="paste an existing programme UUID"
          />
        </label>
        {programmeId && (
          <form onSubmit={handleCreateCourse} className="inline-form">
            <input name="title" placeholder="New course title" required />
            <button type="submit">Add course</button>
          </form>
        )}
        <ul>
          {courses.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => {
                  setSelectedCourseId(c.id);
                  loadModules(c.id);
                }}
              >
                {c.title}
              </button>
            </li>
          ))}
        </ul>
      </section>

      {selectedCourseId && (
        <section>
          <h3>Modules</h3>
          <form onSubmit={handleCreateModule} className="inline-form">
            <input name="title" placeholder="New module title" required />
            <button type="submit">Add module</button>
          </form>
          <ul>
            {modules.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedModuleId(m.id);
                    loadLessons(m.id);
                  }}
                >
                  {m.title}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {selectedModuleId && (
        <section>
          <h3>Lessons</h3>
          <form onSubmit={handleCreateLesson} className="inline-form lesson-create-form">
            <input name="title" placeholder="New lesson title" required />
            <select name="content_type" defaultValue="video">
              <option value="video">Video</option>
              <option value="pdf">PDF</option>
              <option value="slides">Slides</option>
              <option value="text">Text</option>
              <option value="interactive">Interactive (matching)</option>
            </select>
            <input name="video_id" placeholder="YouTube video ID (if video)" />
            <textarea
              name="interactive_config"
              placeholder='If interactive: {"type":"matching","prompt":"...","pairs":[{"term":"PACS","match":"Village credit society"}]}'
              rows={2}
            />
            <button type="submit">Add lesson</button>
          </form>
          <ul className="lesson-list">
            {lessons.map((l) => (
              <li key={l.id} className="lesson-row">
                <div className="lesson-row-main">
                  <span>
                    {l.title} <em>({l.content_type})</em>
                  </span>
                  {l.content_type === "video" && (
                    <input
                      defaultValue={l.video_id ?? ""}
                      placeholder="YouTube video ID"
                      onBlur={(e) => handleUpdateVideo(l.id, e.target.value)}
                    />
                  )}
                  {(l.content_type === "pdf" || l.content_type === "slides") && (
                    <>
                      <input
                        type="file"
                        accept="application/pdf,.ppt,.pptx"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleUploadFile(l.id, file);
                        }}
                      />
                      {l.storage_path && <span>uploaded</span>}
                    </>
                  )}
                  {l.content_type === "interactive" && (
                    <span>
                      {l.interactive_config
                        ? `${l.interactive_config.pairs.length} pairs`
                        : "not configured"}
                    </span>
                  )}
                </div>
                <form
                  onSubmit={(e) => handleAddTranslation(e, l.id)}
                  className="inline-form translation-form"
                >
                  <select name="locale" defaultValue="hi">
                    {SUGGESTED_LOCALES.map((code) => (
                      <option key={code} value={code}>
                        {code}
                      </option>
                    ))}
                  </select>
                  <input name="title" placeholder="Translated title" />
                  <input name="body" placeholder="Translated body/description" />
                  <button type="submit">Save translation</button>
                </form>
              </li>
            ))}
          </ul>

          <AssessmentBuilder
            key={selectedModuleId}
            accessToken={accessToken}
            moduleId={selectedModuleId}
          />
        </section>
      )}
    </div>
  );
}
