import {
  getCourses,
  getLessonContentUrl,
  getLessonProgress,
  getLessons,
  getLessonTranslations,
  getModules,
  updateLessonProgress,
} from "@ncct/api-client";
import type {
  Course,
  ContentTranslation,
  Lesson,
  LessonProgress,
  Module,
} from "@ncct/shared-types";
import { useState } from "react";
import { MatchingExercise } from "./MatchingExercise.js";
import { QuizTaker } from "./QuizTaker.js";
import { YouTubeVideoPlayer } from "./YouTubeVideoPlayer.js";

interface StudentLessonViewProps {
  accessToken: string;
}

export function StudentLessonView({ accessToken }: StudentLessonViewProps) {
  const [programmeId, setProgrammeId] = useState("");
  const [courses, setCourses] = useState<Course[]>([]);
  const [modules, setModules] = useState<Module[]>([]);
  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null);
  const [progress, setProgress] = useState<LessonProgress | null>(null);
  const [translations, setTranslations] = useState<ContentTranslation[]>([]);
  const [locale, setLocale] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const activeTranslation = translations.find((t) => t.locale === locale) ?? null;

  async function loadCourses(id: string) {
    setError(null);
    try {
      setCourses(await getCourses(accessToken, id));
      setModules([]);
      setLessons([]);
      setSelectedLesson(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function loadModules(courseId: string) {
    setError(null);
    try {
      setModules(await getModules(accessToken, courseId));
      setLessons([]);
      setSelectedLesson(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function loadLessons(moduleId: string) {
    setError(null);
    setSelectedModuleId(moduleId);
    try {
      setLessons(await getLessons(accessToken, moduleId));
      setSelectedLesson(null);
      setProgress(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function selectLesson(lesson: Lesson) {
    setSelectedLesson(lesson);
    setLocale("");
    setError(null);
    try {
      const [lessonProgress, lessonTranslations] = await Promise.all([
        getLessonProgress(accessToken, lesson.id),
        getLessonTranslations(accessToken, lesson.id),
      ]);
      setProgress(lessonProgress);
      setTranslations(lessonTranslations);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function openContent() {
    if (!selectedLesson) return;
    setError(null);
    try {
      const { url } = await getLessonContentUrl(accessToken, selectedLesson.id);
      if (url) {
        window.open(url, "_blank", "noopener,noreferrer");
      } else {
        setError("This lesson has no file uploaded yet.");
      }
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function markComplete() {
    if (!selectedLesson) return;
    setError(null);
    try {
      setProgress(
        await updateLessonProgress(accessToken, selectedLesson.id, {
          progress_percent: 100,
          completed_at: new Date().toISOString(),
        }),
      );
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="student-panel">
      <h2>My lessons</h2>
      {error && <p className="form-error">{error}</p>}

      <label>
        Programme ID
        <input
          value={programmeId}
          onChange={(e) => setProgrammeId(e.target.value)}
          onBlur={() => programmeId && loadCourses(programmeId)}
          placeholder="paste a programme UUID"
        />
      </label>

      <div className="student-columns">
        <ul>
          {courses.map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => loadModules(c.id)}>
                {c.title}
              </button>
            </li>
          ))}
        </ul>
        <ul>
          {modules.map((m) => (
            <li key={m.id}>
              <button type="button" onClick={() => loadLessons(m.id)}>
                {m.title}
              </button>
            </li>
          ))}
        </ul>
        <ul>
          {lessons.map((l) => (
            <li key={l.id}>
              <button type="button" onClick={() => selectLesson(l)}>
                {l.title}
              </button>
            </li>
          ))}
        </ul>
      </div>

      {selectedModuleId && (
        <QuizTaker key={selectedModuleId} accessToken={accessToken} moduleId={selectedModuleId} />
      )}

      {selectedLesson && (
        <div className="lesson-detail">
          <h3>{activeTranslation?.title || selectedLesson.title}</h3>

          {translations.length > 0 && (
            <label className="locale-switcher">
              Language
              <select value={locale} onChange={(e) => setLocale(e.target.value)}>
                <option value="">Original</option>
                {translations.map((t) => (
                  <option key={t.locale} value={t.locale}>
                    {t.locale}
                  </option>
                ))}
              </select>
            </label>
          )}

          {activeTranslation?.body && <p className="lesson-body">{activeTranslation.body}</p>}

          {selectedLesson.content_type === "video" && (
            <YouTubeVideoPlayer videoId={selectedLesson.video_id} />
          )}
          {(selectedLesson.content_type === "pdf" || selectedLesson.content_type === "slides") &&
            (selectedLesson.storage_path ? (
              <button type="button" onClick={openContent}>
                Open {selectedLesson.content_type === "pdf" ? "PDF" : "slides"}
              </button>
            ) : (
              <p>No file uploaded for this lesson yet.</p>
            ))}
          {selectedLesson.content_type === "interactive" &&
            (selectedLesson.interactive_config ? (
              <MatchingExercise config={selectedLesson.interactive_config} />
            ) : (
              <p>This interactive lesson hasn't been configured yet.</p>
            ))}

          <div className="lesson-progress">
            {progress?.completed_at ? (
              <span>Completed</span>
            ) : (
              <button type="button" onClick={markComplete}>
                Mark complete
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
