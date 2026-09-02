import {
  getCourses,
  getLessonContentUrl,
  getLessonProgress,
  getLessons,
  getLessonTranslations,
  getLessonVideoUrl,
  getModules,
  getMyNominations,
  updateLessonProgress,
} from "@ncct/api-client";
import type {
  Course,
  ContentTranslation,
  Lesson,
  LessonProgress,
  Module,
  Nomination,
} from "@ncct/shared-types";
import { useEffect, useState } from "react";
import { MatchingExercise } from "../MatchingExercise.js";
import {
  deleteDownloadedLesson,
  downloadLessonVideo,
  getLocalLessonUri,
  isLessonDownloaded,
  isOfflineCapable,
} from "../offline/downloadManager.js";
import { enqueueWrite, useAutoSync } from "../offline/syncManager.js";
import { QuizTaker } from "../QuizTaker.js";
import { SelfHostedVideoPlayer } from "../SelfHostedVideoPlayer.js";
import { YouTubeVideoPlayer } from "../YouTubeVideoPlayer.js";
import { ErrorBanner } from "./pieces.js";

interface TraineeLearnLessonsProps {
  accessToken: string;
}

type MyNomination = Nomination & { programmes: { title: string; mode: string } | null };

// Same data flow as the original StudentLessonView.tsx, re-skinned to the
// NCCT design system (design/stitch_ncct_trainee_portal/learn_my_lessons).
// The programme picker used to be a raw UUID paste box with nothing to paste
// it from — F2 still has no admin/trainee programme-browsing UI, but the
// trainee's own approved nominations (GET /api/nominations/mine) are real
// data already used elsewhere in this portal, so this now offers those as a
// dropdown; the manual UUID field stays as a fallback for anything not
// covered by an approved nomination (e.g. before F2 gains real browsing).
export function TraineeLearnLessons({ accessToken }: TraineeLearnLessonsProps) {
  const [myProgrammes, setMyProgrammes] = useState<MyNomination[]>([]);
  const [programmeId, setProgrammeId] = useState("");
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [modules, setModules] = useState<Module[]>([]);
  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null);
  const [progress, setProgress] = useState<LessonProgress | null>(null);
  const [translations, setTranslations] = useState<ContentTranslation[]>([]);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [locale, setLocale] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const { online, pendingCount } = useAutoSync(accessToken);
  const [downloadedIds, setDownloadedIds] = useState<Set<string>>(new Set());
  const [downloadProgress, setDownloadProgress] = useState<Record<string, number>>({});
  // Distinct from `progress.completed_at` (server-confirmed) — a lesson
  // marked complete while offline is genuinely pending, not done yet, and
  // the UI says so rather than pretending it already synced.
  const [pendingCompletions, setPendingCompletions] = useState<Set<string>>(new Set());

  const activeTranslation = translations.find((t) => t.locale === locale) ?? null;

  useEffect(() => {
    if (!isOfflineCapable() || lessons.length === 0) return;
    Promise.all(lessons.map(async (l) => [l.id, await isLessonDownloaded(l.id)] as const)).then(
      (results) => setDownloadedIds(new Set(results.filter(([, done]) => done).map(([id]) => id))),
    );
  }, [lessons]);

  useEffect(() => {
    getMyNominations(accessToken)
      .then((nominations) => {
        const approved = nominations.filter((n) => n.status === "approved");
        setMyProgrammes(approved);
        if (approved.length > 0) {
          setProgrammeId(approved[0].programme_id);
          void loadCourses(approved[0].programme_id);
        }
      })
      .catch((err: Error) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

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
    setVideoUrl(null);
    setError(null);

    const needsVideoUrl = lesson.content_type === "video" && !lesson.video_id;

    if (!online) {
      // Offline: every one of these calls would just fail — the only thing
      // that can possibly work is a video already downloaded to this
      // device. Progress/translations simply aren't available until the
      // trainee is back online; showing a stale cached copy would risk
      // looking more current than it is.
      setProgress(null);
      setTranslations([]);
      if (needsVideoUrl) {
        setVideoUrl(await getLocalLessonUri(lesson.id));
      }
      return;
    }

    try {
      // Only fetch a playback URL for a video lesson with no YouTube ID —
      // one with a video_id renders via YouTubeVideoPlayer instead, and the
      // route itself would just return { url: null } for a non-video lesson.
      const [lessonProgress, lessonTranslations, video] = await Promise.all([
        getLessonProgress(accessToken, lesson.id),
        getLessonTranslations(accessToken, lesson.id),
        needsVideoUrl ? getLessonVideoUrl(accessToken, lesson.id) : Promise.resolve(null),
      ]);
      setProgress(lessonProgress);
      setTranslations(lessonTranslations);
      setVideoUrl(video?.url ?? null);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleDownload(lesson: Lesson) {
    setError(null);
    setDownloadProgress((prev) => ({ ...prev, [lesson.id]: 0 }));
    try {
      await downloadLessonVideo(accessToken, lesson, (fraction) =>
        setDownloadProgress((prev) => ({ ...prev, [lesson.id]: fraction })),
      );
      setDownloadedIds((prev) => new Set(prev).add(lesson.id));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setDownloadProgress((prev) => {
        const next = { ...prev };
        delete next[lesson.id];
        return next;
      });
    }
  }

  async function handleRemoveDownload(lessonId: string) {
    await deleteDownloadedLesson(lessonId);
    setDownloadedIds((prev) => {
      const next = new Set(prev);
      next.delete(lessonId);
      return next;
    });
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
    const completedAt = new Date().toISOString();

    if (!online) {
      await enqueueWrite({
        type: "lesson_progress",
        queuedAt: completedAt,
        lessonId: selectedLesson.id,
        body: { progress_percent: 100, completed_at: completedAt },
      });
      setPendingCompletions((prev) => new Set(prev).add(selectedLesson.id));
      return;
    }

    try {
      setProgress(
        await updateLessonProgress(accessToken, selectedLesson.id, {
          progress_percent: 100,
          completed_at: completedAt,
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
          {myProgrammes.length > 0 ? (
            <select
              value={programmeId}
              onChange={(e) => e.target.value && loadCourses(e.target.value)}
              className="min-h-touch-target w-full rounded border border-border-low-contrast bg-surface-container-lowest px-4 py-3 text-body-md focus:outline-none focus:ring-2 focus:ring-interactive"
            >
              {myProgrammes.map((nom) => (
                <option key={nom.programme_id} value={nom.programme_id}>
                  {nom.programmes?.title ?? nom.programme_id}
                </option>
              ))}
            </select>
          ) : (
            <>
              <input
                value={programmeId}
                onChange={(e) => setProgrammeId(e.target.value)}
                onBlur={() => programmeId && loadCourses(programmeId)}
                placeholder="paste a programme UUID"
                className="min-h-touch-target w-full rounded border border-border-low-contrast bg-surface-container-lowest px-4 py-3 text-body-md focus:outline-none focus:ring-2 focus:ring-interactive"
              />
              <p className="mt-2 text-label-sm text-on-surface-variant">
                No approved programme yet — nominate for one first, or paste a programme ID directly.
              </p>
            </>
          )}
        </div>

        <ErrorBanner message={error} />
        {!online && (
          <div className="flex items-center gap-2 rounded-lg border border-status-pending/30 bg-status-pending/10 p-3 text-label-md text-status-pending">
            <span className="material-symbols-outlined text-[18px]">cloud_off</span>
            You&apos;re offline — downloaded lessons still work; progress will sync once you&apos;re back
            online.
          </div>
        )}
        {online && pendingCount > 0 && (
          <div className="flex items-center gap-2 rounded-lg border border-interactive/30 bg-interactive/10 p-3 text-label-md text-interactive">
            <span className="material-symbols-outlined animate-spin text-[18px]">sync</span>
            Syncing {pendingCount} pending {pendingCount === 1 ? "update" : "updates"}…
          </div>
        )}

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
              {selectedLesson.content_type === "video" &&
                (selectedLesson.video_id ? (
                  <YouTubeVideoPlayer videoId={selectedLesson.video_id} />
                ) : (
                  <SelfHostedVideoPlayer url={videoUrl} />
                ))}
              {selectedLesson.content_type === "video" &&
                !selectedLesson.video_id &&
                isOfflineCapable() && (
                  <div className="mt-3 flex flex-col gap-1.5">
                    {downloadedIds.has(selectedLesson.id) ? (
                      <div className="flex items-center gap-2 text-label-md text-status-shortlisted">
                        <span className="material-symbols-outlined text-[18px]">offline_pin</span>
                        Available offline
                        <button
                          type="button"
                          onClick={() => handleRemoveDownload(selectedLesson.id)}
                          className="ml-2 text-label-sm text-on-surface-variant underline"
                        >
                          Remove
                        </button>
                      </div>
                    ) : downloadProgress[selectedLesson.id] !== undefined ? (
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-40 overflow-hidden rounded-full bg-surface-container-high">
                          <div
                            className="h-full bg-cta transition-all"
                            style={{ width: `${Math.round(downloadProgress[selectedLesson.id] * 100)}%` }}
                          />
                        </div>
                        <span className="text-label-sm text-on-surface-variant">Downloading…</span>
                      </div>
                    ) : (
                      online && (
                        <button
                          type="button"
                          onClick={() => handleDownload(selectedLesson)}
                          className="flex w-fit min-h-touch-target items-center gap-2 rounded border border-border-low-contrast bg-surface-container-lowest px-3 py-2 text-label-md hover:border-interactive"
                        >
                          <span className="material-symbols-outlined text-[18px]">download</span>
                          Download for offline
                        </button>
                      )
                    )}
                  </div>
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
              ) : pendingCompletions.has(selectedLesson.id) ? (
                <span className="flex items-center gap-2 text-label-md font-bold text-status-pending">
                  <span className="material-symbols-outlined">sync</span>
                  Marked complete — pending sync
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
