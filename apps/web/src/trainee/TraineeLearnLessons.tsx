import {
  getCourses,
  getLessonContentUrl,
  getLessonProgress,
  getLessons,
  getLessonTranslations,
  getModules,
  updateLessonProgress,
} from "@ncct/api-client";
import type { Course, ContentTranslation, Lesson, LessonProgress, Module } from "@ncct/shared-types";
import { useState } from "react";
import { MatchingExercise } from "../MatchingExercise.js";
import { QuizTaker } from "../QuizTaker.js";
import { YouTubeVideoPlayer } from "../YouTubeVideoPlayer.js";
import { ErrorBanner } from "./pieces.js";

interface TraineeLearnLessonsProps {
  accessToken: string;
}

// Same data flow as the original StudentLessonView.tsx, re-skinned to the
// NCCT design system (design/stitch_ncct_trainee_portal/learn_my_lessons).
// Still a raw programme-ID input — F2 has no browsing UI yet (see
// docs/IMPLEMENTATION.md), unchanged by this redesign.
export function TraineeLearnLessons({ accessToken }: TraineeLearnLessonsProps) {
  const [programmeId, setProgrammeId] = useState("");
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
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
      setSelectedCourseId(null);
      setModules([]);
      setLessons([]);
      setSelectedLesson(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function loadModules(courseId: string) {
    setError(null);
    setSelectedCourseId(courseId);
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
    <div className="flex flex-col gap-6 py-6 md:grid md:grid-cols-12 md:gap-gutter md:py-8">
      <div className="flex flex-col gap-6 md:col-span-4">
        <div className="rounded-lg border border-border-low-contrast bg-surface-card p-4">
          <label className="mb-2 block text-label-md text-on-surface-variant">Programme</label>
          <input
            value={programmeId}
            onChange={(e) => setProgrammeId(e.target.value)}
            onBlur={() => programmeId && loadCourses(programmeId)}
            placeholder="paste a programme UUID"
            className="min-h-touch-target w-full rounded border border-border-low-contrast bg-surface-container-lowest px-4 py-3 text-body-md focus:outline-none focus:ring-2 focus:ring-interactive"
          />
        </div>

        <ErrorBanner message={error} />

        <div className="overflow-hidden rounded-xl border border-border-low-contrast bg-surface-card">
          <div className="border-b border-border-low-contrast bg-surface-container-low p-4">
            <h2 className="font-headline text-headline-md text-primary">Courses</h2>
          </div>
          <ul className="flex flex-col">
            {courses.map((course) => (
              <li key={course.id} className="border-b border-border-low-contrast last:border-b-0">
                <button
                  type="button"
                  onClick={() => loadModules(course.id)}
                  className={`min-h-touch-target flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-surface-container-lowest ${
                    selectedCourseId === course.id ? "bg-primary-fixed-dim/20" : ""
                  }`}
                >
                  <span className="text-label-md text-on-background">{course.title}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        {modules.length > 0 && (
          <div className="overflow-hidden rounded-xl border border-border-low-contrast bg-surface-card">
            <div className="border-b border-border-low-contrast bg-surface-container-low p-4">
              <h2 className="font-headline text-headline-md text-primary">Modules</h2>
            </div>
            <ul className="flex flex-col">
              {modules.map((module) => (
                <li key={module.id} className="border-b border-border-low-contrast last:border-b-0">
                  <button
                    type="button"
                    onClick={() => loadLessons(module.id)}
                    className={`min-h-touch-target flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-surface-container-lowest ${
                      selectedModuleId === module.id ? "bg-primary-fixed-dim/20" : ""
                    }`}
                  >
                    <span className="text-label-md text-on-background">{module.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {lessons.length > 0 && (
          <div className="overflow-hidden rounded-xl border border-border-low-contrast bg-surface-card">
            <div className="border-b border-border-low-contrast bg-surface-container-low p-4">
              <h2 className="font-headline text-headline-md text-primary">Lessons</h2>
              <p className="mt-1 text-body-md text-on-surface-variant">{lessons.length} in this module</p>
            </div>
            <ul className="flex flex-col">
              {lessons.map((lesson) => {
                const active = selectedLesson?.id === lesson.id;
                return (
                  <li key={lesson.id} className="border-b border-border-low-contrast last:border-b-0">
                    <button
                      type="button"
                      onClick={() => selectLesson(lesson)}
                      className={`flex min-h-touch-target w-full items-center gap-3 p-4 text-left transition-colors hover:bg-surface-container-lowest ${
                        active ? "border-l-2 border-interactive bg-primary-fixed-dim/20" : ""
                      }`}
                    >
                      <span
                        className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${
                          active
                            ? "border-2 border-interactive bg-surface-card"
                            : "border border-outline text-outline"
                        }`}
                      >
                        {active && <span className="h-3 w-3 rounded-full bg-interactive" />}
                      </span>
                      <span className="flex-grow">
                        <h3
                          className={`text-label-md ${active ? "font-bold text-primary" : "text-on-background"}`}
                        >
                          {lesson.title}
                        </h3>
                        <p className="text-label-sm text-on-surface-variant">{lesson.content_type}</p>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {selectedModuleId && (
          <QuizTaker key={selectedModuleId} accessToken={accessToken} moduleId={selectedModuleId} />
        )}
      </div>

      <div className="md:col-span-8">
        {selectedLesson ? (
          <div className="flex h-full min-h-[500px] flex-col rounded-xl border border-border-low-contrast bg-surface-card p-6">
            <div className="mb-4 flex items-center justify-between gap-2">
              <h1 className="font-headline text-headline-lg-mobile text-primary md:text-headline-lg">
                {activeTranslation?.title || selectedLesson.title}
              </h1>
              {translations.length > 0 && (
                <label className="flex items-center gap-2 text-label-sm text-on-surface-variant">
                  Language
                  <select
                    value={locale}
                    onChange={(e) => setLocale(e.target.value)}
                    className="min-h-touch-target rounded border border-border-low-contrast bg-surface-container-lowest px-2 py-1 text-label-md"
                  >
                    <option value="">Original</option>
                    {translations.map((t) => (
                      <option key={t.locale} value={t.locale}>
                        {t.locale}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>

            {activeTranslation?.body && (
              <p className="mb-6 whitespace-pre-wrap text-body-md text-on-surface-variant">
                {activeTranslation.body}
              </p>
            )}

            <div className="mb-6 flex-grow">
              {selectedLesson.content_type === "video" && (
                <YouTubeVideoPlayer videoId={selectedLesson.video_id} />
              )}
              {(selectedLesson.content_type === "pdf" || selectedLesson.content_type === "slides") &&
                (selectedLesson.storage_path ? (
                  <button
                    type="button"
                    onClick={openContent}
                    className="flex min-h-touch-target items-center gap-3 rounded border border-border-low-contrast bg-surface-container-lowest p-3 hover:border-interactive"
                  >
                    <span className="material-symbols-outlined text-secondary-container">
                      picture_as_pdf
                    </span>
                    <span className="text-label-md text-on-background">
                      Open {selectedLesson.content_type === "pdf" ? "PDF" : "slides"}
                    </span>
                  </button>
                ) : (
                  <p className="text-body-md text-on-surface-variant">No file uploaded for this lesson yet.</p>
                ))}
              {selectedLesson.content_type === "interactive" &&
                (selectedLesson.interactive_config ? (
                  <MatchingExercise config={selectedLesson.interactive_config} />
                ) : (
                  <p className="text-body-md text-on-surface-variant">
                    This interactive lesson hasn't been configured yet.
                  </p>
                ))}
            </div>

            <div className="mt-auto flex items-center justify-end border-t border-border-low-contrast pt-4">
              {progress?.completed_at ? (
                <span className="flex items-center gap-2 text-label-md font-bold text-status-shortlisted">
                  <span className="material-symbols-outlined">check_circle</span>
                  Completed
                </span>
              ) : (
                <button
                  type="button"
                  onClick={markComplete}
                  className="flex min-h-touch-target items-center gap-2 rounded bg-cta px-6 py-2 font-bold text-white transition-colors hover:bg-cta-hover"
                >
                  <span className="material-symbols-outlined">check_circle</span>
                  Mark Complete
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="flex min-h-[500px] flex-col items-center justify-center rounded-xl border border-dashed border-border-low-contrast p-8 text-center">
            <span className="material-symbols-outlined mb-4 text-[40px] text-on-surface-variant">
              play_lesson
            </span>
            <p className="text-body-md text-on-surface-variant">
              Pick a lesson from the left to start learning.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
