import {
  createCourse,
  createLesson,
  createModule,
  getCourses,
  getLessons,
  getLessonVideoUploadUrl,
  getModules,
  getProgrammes,
  updateLesson,
  uploadLessonContent,
  uploadLessonVideoFile,
  upsertLessonTranslation,
} from "@ncct/api-client";
import { LESSON_VIDEO_MIME_TYPES, SUGGESTED_LOCALES } from "@ncct/constants";
import type { ContentType, Course, Lesson, Module, Programme } from "@ncct/shared-types";
import { createLessonSchema, localeSchema, youtubeVideoIdSchema } from "@ncct/validation";
import { useEffect, useState } from "react";
import { AssessmentBuilder } from "./AssessmentBuilder.js";

interface AdminCourseManagerProps {
  accessToken: string;
}

export function AdminCourseManager({ accessToken }: AdminCourseManagerProps) {
  const [programmes, setProgrammes] = useState<Programme[]>([]);
  const [programmeId, setProgrammeId] = useState("");
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [modules, setModules] = useState<Module[]>([]);
  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Modals & form toggles
  const [showAddCourse, setShowAddCourse] = useState(false);
  const [showAddModule, setShowAddModule] = useState(false);
  const [showAddLesson, setShowAddLesson] = useState(false);
  const [activeLessonId, setActiveLessonId] = useState<string | null>(null);

  // Lesson sub-actions
  const [youtubeInputs, setYoutubeInputs] = useState<Record<string, string>>({});
  const [translationInputs, setTranslationInputs] = useState<
    Record<string, { locale: string; title: string; summary: string }>
  >({});
  // Fraction (0-1) while a video upload to B2 is in flight; absent once done
  // or if nothing's uploading for that lesson.
  const [videoUploadProgress, setVideoUploadProgress] = useState<Record<string, number>>({});

  useEffect(() => {
    getProgrammes(accessToken)
      .then((progs) => {
        setProgrammes(progs);
        if (progs.length > 0 && !programmeId) {
          void handleSelectProgramme(progs[0].id);
        }
      })
      .catch((err: Error) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  async function handleSelectProgramme(id: string) {
    setProgrammeId(id);
    setSelectedCourseId(null);
    setSelectedModuleId(null);
    setModules([]);
    setLessons([]);
    setError(null);
    try {
      const crs = await getCourses(accessToken, id);
      setCourses(crs);
      if (crs.length > 0) {
        await handleSelectCourse(crs[0].id);
      }
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleSelectCourse(courseId: string) {
    setSelectedCourseId(courseId);
    setSelectedModuleId(null);
    setLessons([]);
    setError(null);
    try {
      const mods = await getModules(accessToken, courseId);
      setModules(mods);
      if (mods.length > 0) {
        await handleSelectModule(mods[0].id);
      }
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleSelectModule(moduleId: string) {
    setSelectedModuleId(moduleId);
    setError(null);
    try {
      const ls = await getLessons(accessToken, moduleId);
      setLessons(ls);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleCreateCourse(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!programmeId) return;
    const form = new FormData(e.currentTarget);
    const title = String(form.get("title") ?? "").trim();
    setError(null);
    setBusy(true);
    try {
      await createCourse(accessToken, programmeId, { title });
      setShowAddCourse(false);
      const crs = await getCourses(accessToken, programmeId);
      setCourses(crs);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateModule(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selectedCourseId) return;
    const form = new FormData(e.currentTarget);
    const title = String(form.get("title") ?? "").trim();
    setError(null);
    setBusy(true);
    try {
      await createModule(accessToken, selectedCourseId, { title });
      setShowAddModule(false);
      const mods = await getModules(accessToken, selectedCourseId);
      setModules(mods);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateLesson(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selectedModuleId) return;
    const form = new FormData(e.currentTarget);
    const durationRaw = String(form.get("duration_minutes") ?? "");
    const videoIdRaw = String(form.get("video_id") ?? "");

    const parsed = createLessonSchema.safeParse({
      title: String(form.get("title") ?? "").trim(),
      content_type: String(form.get("content_type") ?? "video") as ContentType,
      duration_minutes: durationRaw ? Number(durationRaw) : undefined,
      video_id: videoIdRaw || undefined,
    });

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid lesson payload");
      return;
    }

    setError(null);
    setBusy(true);
    try {
      await createLesson(accessToken, selectedModuleId, parsed.data);
      setShowAddLesson(false);
      const ls = await getLessons(accessToken, selectedModuleId);
      setLessons(ls);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleUpload(lessonId: string, file: File) {
    setError(null);
    try {
      await uploadLessonContent(accessToken, lessonId, file);
      if (selectedModuleId) {
        setLessons(await getLessons(accessToken, selectedModuleId));
      }
    } catch (err) {
      setError((err as Error).message);
    }
  }

  // Three steps, not one: get a presigned PUT URL, PUT the file straight to
  // B2 (never through Express — see DECISIONS.md #20), then attach the
  // resulting key via the existing PATCH /lessons/:id. If the upload itself
  // fails partway, the lesson's storage_path is never touched, so it can't
  // end up pointing at a half-written object.
  async function handleVideoUpload(lessonId: string, file: File) {
    setError(null);
    setVideoUploadProgress((prev) => ({ ...prev, [lessonId]: 0 }));
    try {
      const { upload_url, key } = await getLessonVideoUploadUrl(accessToken, lessonId, {
        name: file.name,
        type: file.type,
        size: file.size,
      });
      await uploadLessonVideoFile(upload_url, file, (fraction) =>
        setVideoUploadProgress((prev) => ({ ...prev, [lessonId]: fraction })),
      );
      await updateLesson(accessToken, lessonId, { storage_path: key });
      if (selectedModuleId) {
        setLessons(await getLessons(accessToken, selectedModuleId));
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setVideoUploadProgress((prev) => {
        const next = { ...prev };
        delete next[lessonId];
        return next;
      });
    }
  }

  async function handleAttachYoutube(lessonId: string) {
    const raw = youtubeInputs[lessonId] ?? "";
    const parsed = youtubeVideoIdSchema.safeParse(raw);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid YouTube ID");
      return;
    }
    setError(null);
    try {
      await updateLesson(accessToken, lessonId, { video_id: parsed.data });
      setYoutubeInputs((prev) => ({ ...prev, [lessonId]: "" }));
      if (selectedModuleId) {
        setLessons(await getLessons(accessToken, selectedModuleId));
      }
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleSaveTranslation(lessonId: string) {
    const input = translationInputs[lessonId];
    if (!input?.locale || !input?.title) return;
    const locParsed = localeSchema.safeParse(input.locale);
    if (!locParsed.success) {
      setError("Locale must be a valid BCP 47 code (e.g. 'hi-IN')");
      return;
    }
    setError(null);
    try {
      await upsertLessonTranslation(accessToken, lessonId, input.locale, {
        title: input.title,
        summary: input.summary || undefined,
      });
      setTranslationInputs((prev) => ({
        ...prev,
        [lessonId]: { locale: "", title: "", summary: "" },
      }));
      if (selectedModuleId) {
        setLessons(await getLessons(accessToken, selectedModuleId));
      }
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const selectedCourse = courses.find((c) => c.id === selectedCourseId);
  const selectedModule = modules.find((m) => m.id === selectedModuleId);

  return (
    <div className="p-margin-mobile md:p-margin-desktop max-w-max-width-desktop mx-auto w-full flex flex-col gap-6 text-left">
      {/* Header with Programme Picker */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-outline-variant pb-4">
        <div>
          <h2 className="font-headline-lg text-headline-lg-mobile md:text-headline-lg font-bold text-on-surface m-0">
            Content Management
          </h2>
          <p className="font-body-md text-body-md text-on-surface-variant mt-1">
            Manage courses, modules, lessons, and assessments.
          </p>
        </div>

        {/* Programme Picker */}
        <div className="w-full md:w-80">
          <label className="block font-label-sm text-label-sm text-on-surface-variant mb-1">
            Select Programme
          </label>
          <div className="relative">
            <select
              value={programmeId}
              onChange={(e) => void handleSelectProgramme(e.target.value)}
              className="w-full h-touch-target appearance-none bg-surface-container-lowest border border-outline-variant rounded-lg px-4 font-body-md text-body-md focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary pr-10"
            >
              {programmes.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
            <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-on-surface-variant">
              expand_more
            </span>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-error-container text-on-error-container p-4 rounded-xl flex items-center gap-3 border border-error/20">
          <span className="material-symbols-outlined text-error">error</span>
          <p className="font-body-md text-body-md">{error}</p>
        </div>
      )}

      {/* Cascading 3-Panel Container (Bento Layout) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Panel 1: Courses (Col 1-3) */}
        <div className="lg:col-span-3 flex flex-col gap-4">
          <div className="bg-surface-card border border-outline-variant rounded-xl p-4 shadow-sm flex flex-col min-h-[520px]">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-headline-sm text-headline-sm font-semibold m-0 text-primary">Courses</h3>
              <button
                type="button"
                onClick={() => setShowAddCourse(!showAddCourse)}
                aria-label="Add Course"
                className="h-8 w-8 rounded-full hover:bg-surface-container flex items-center justify-center text-primary cursor-pointer transition-colors"
              >
                <span className="material-symbols-outlined text-[20px]">
                  {showAddCourse ? "close" : "add"}
                </span>
              </button>
            </div>

            {/* Inline Add Course */}
            {showAddCourse && (
              <form onSubmit={(e) => void handleCreateCourse(e)} className="mb-3 p-3 bg-surface-container rounded-lg space-y-2">
                <input
                  name="title"
                  required
                  placeholder="Course Title"
                  className="w-full bg-surface-container-lowest border border-outline-variant rounded p-2 text-sm"
                />
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full bg-cta text-on-primary py-1.5 rounded text-xs font-semibold hover:bg-cta-hover"
                >
                  Create Course
                </button>
              </form>
            )}

            <div className="space-y-2 flex-1 overflow-y-auto pr-1 custom-scrollbar">
              {courses.length === 0 ? (
                <p className="text-xs text-on-surface-variant p-4 text-center">No courses in this programme.</p>
              ) : (
                courses.map((c) => {
                  const isSelected = c.id === selectedCourseId;
                  return (
                    <div
                      key={c.id}
                      onClick={() => void handleSelectCourse(c.id)}
                      className={`p-3 rounded-lg cursor-pointer transition-colors relative group border ${
                        isSelected
                          ? "bg-surface-container border-primary"
                          : "bg-surface-container-lowest border-transparent hover:border-outline-variant"
                      }`}
                    >
                      <div className="font-label-md text-label-md font-bold text-primary mb-1 line-clamp-2">
                        {c.title}
                      </div>
                      <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-primary opacity-0 group-hover:opacity-100 transition-opacity text-[18px]">
                        chevron_right
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Panel 2: Modules (Col 4-6) */}
        <div className="lg:col-span-3 flex flex-col gap-4">
          <div className="bg-surface-card border border-outline-variant rounded-xl p-4 shadow-sm flex flex-col min-h-[520px]">
            <div className="flex justify-between items-center mb-1">
              <h3 className="font-headline-sm text-headline-sm font-semibold m-0 text-primary">Modules</h3>
              {selectedCourseId && (
                <button
                  type="button"
                  onClick={() => setShowAddModule(!showAddModule)}
                  aria-label="Add Module"
                  className="h-8 w-8 rounded-full hover:bg-surface-container flex items-center justify-center text-primary cursor-pointer transition-colors"
                >
                  <span className="material-symbols-outlined text-[20px]">
                    {showAddModule ? "close" : "add"}
                  </span>
                </button>
              )}
            </div>

            <div className="font-label-sm text-label-sm text-on-surface-variant mb-4 pb-2 border-b border-outline-variant truncate">
              {selectedCourse ? `in ${selectedCourse.title}` : "Select a course"}
            </div>

            {/* Inline Add Module */}
            {showAddModule && (
              <form onSubmit={(e) => void handleCreateModule(e)} className="mb-3 p-3 bg-surface-container rounded-lg space-y-2">
                <input
                  name="title"
                  required
                  placeholder="Module Title"
                  className="w-full bg-surface-container-lowest border border-outline-variant rounded p-2 text-sm"
                />
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full bg-cta text-on-primary py-1.5 rounded text-xs font-semibold hover:bg-cta-hover"
                >
                  Create Module
                </button>
              </form>
            )}

            <div className="space-y-2 flex-1 overflow-y-auto pr-1 custom-scrollbar">
              {!selectedCourseId ? (
                <p className="text-xs text-on-surface-variant p-4 text-center">Select a course to view modules.</p>
              ) : modules.length === 0 ? (
                <p className="text-xs text-on-surface-variant p-4 text-center">No modules created yet.</p>
              ) : (
                modules.map((m) => {
                  const isSelected = m.id === selectedModuleId;
                  return (
                    <div
                      key={m.id}
                      onClick={() => void handleSelectModule(m.id)}
                      className={`p-3 rounded-lg cursor-pointer transition-colors relative group border ${
                        isSelected
                          ? "bg-surface-container border-primary"
                          : "bg-surface-container-lowest border-transparent hover:border-outline-variant"
                      }`}
                    >
                      <div className="font-label-md text-label-md font-bold text-primary mb-1 line-clamp-2">
                        {m.title}
                      </div>
                      <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-primary opacity-0 group-hover:opacity-100 transition-opacity text-[18px]">
                        chevron_right
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Panel 3: Lessons & Details (Col 7-12) */}
        <div className="lg:col-span-6 flex flex-col gap-6">
          <div className="bg-surface-card border border-outline-variant rounded-xl shadow-sm overflow-hidden flex flex-col min-h-[520px]">
            <div className="p-4 border-b border-outline-variant bg-surface-container-low flex justify-between items-center">
              <div>
                <h3 className="font-headline-sm text-headline-sm font-semibold m-0 text-primary">
                  Lessons &amp; Assessments
                </h3>
                <div className="font-label-sm text-label-sm text-on-surface-variant truncate max-w-sm">
                  {selectedModule ? `in ${selectedModule.title}` : "Select a module"}
                </div>
              </div>

              {selectedModuleId && (
                <button
                  type="button"
                  onClick={() => setShowAddLesson(!showAddLesson)}
                  className="h-touch-target px-4 bg-cta text-on-primary font-label-md text-label-md rounded hover:bg-cta-hover transition-colors flex items-center gap-2 shadow-sm"
                >
                  <span className="material-symbols-outlined text-[18px]">
                    {showAddLesson ? "close" : "add"}
                  </span>
                  {showAddLesson ? "Cancel" : "Add Item"}
                </button>
              )}
            </div>

            {/* Inline Add Lesson Form */}
            {showAddLesson && selectedModuleId && (
              <form
                onSubmit={(e) => void handleCreateLesson(e)}
                className="p-4 bg-surface-container-low border-b border-outline-variant space-y-3"
              >
                <h4 className="font-headline-sm text-[16px] m-0 text-primary">Create New Lesson</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    name="title"
                    required
                    placeholder="Lesson Title *"
                    className="w-full bg-surface-container-lowest border border-outline-variant rounded p-2 text-sm"
                  />
                  <select
                    name="content_type"
                    defaultValue="video"
                    className="w-full bg-surface-container-lowest border border-outline-variant rounded p-2 text-sm"
                  >
                    <option value="video">Video</option>
                    <option value="pdf">PDF Document</option>
                    <option value="slides">Slides</option>
                    <option value="article">Article / Text</option>
                  </select>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    name="duration_minutes"
                    type="number"
                    min="1"
                    placeholder="Duration (minutes)"
                    className="w-full bg-surface-container-lowest border border-outline-variant rounded p-2 text-sm"
                  />
                  <input
                    name="video_id"
                    placeholder="YouTube Video ID (optional)"
                    className="w-full bg-surface-container-lowest border border-outline-variant rounded p-2 text-sm"
                  />
                </div>
                <div className="flex justify-end">
                  <button
                    disabled={busy}
                    type="submit"
                    className="px-4 py-2 bg-cta text-on-primary rounded text-xs font-semibold hover:bg-cta-hover"
                  >
                    Save Lesson
                  </button>
                </div>
              </form>
            )}

            {/* Lessons List */}
            <div className="p-4 space-y-4 flex-1 overflow-y-auto custom-scrollbar">
              {!selectedModuleId ? (
                <div className="flex flex-col items-center justify-center p-8 text-center text-on-surface-variant">
                  <span className="material-symbols-outlined text-[48px] text-outline opacity-40 mb-2">
                    menu_book
                  </span>
                  <p className="font-body-md">Select a module to view lessons and assessments.</p>
                </div>
              ) : lessons.length === 0 ? (
                <p className="text-sm text-on-surface-variant p-4 text-center">
                  No lessons or assessments added yet. Click &ldquo;Add Item&rdquo; above.
                </p>
              ) : (
                lessons.map((lesson) => (
                  <div
                    key={lesson.id}
                    className="border border-outline-variant rounded-lg p-4 bg-surface-container-lowest shadow-xs space-y-3"
                  >
                    <div className="flex justify-between items-start gap-2">
                      <div className="flex items-center gap-3">
                        <span
                          className={`material-symbols-outlined p-2 rounded-full text-[20px] ${
                            lesson.content_type === "video"
                              ? "text-secondary-container bg-secondary-container/10"
                              : "text-primary-container bg-primary-container/10"
                          }`}
                        >
                          {lesson.content_type === "video" ? "play_circle" : "description"}
                        </span>
                        <div>
                          <h4 className="font-body-md font-semibold text-primary m-0">{lesson.title}</h4>
                          <p className="font-label-sm text-label-sm text-on-surface-variant m-0 flex items-center gap-2 mt-0.5">
                            <span className="uppercase font-bold">{lesson.content_type}</span>
                            {lesson.duration_minutes && <span>• {lesson.duration_minutes} mins</span>}
                            {lesson.video_id && (
                              <span className="text-cta font-mono">YT: {lesson.video_id}</span>
                            )}
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => setActiveLessonId(activeLessonId === lesson.id ? null : lesson.id)}
                        className="text-xs text-cta hover:underline font-semibold"
                      >
                        {activeLessonId === lesson.id ? "Hide Details" : "Manage"}
                      </button>
                    </div>

                    {/* Extended Controls (When expanded) */}
                    {activeLessonId === lesson.id && (
                      <div className="pt-3 border-t border-outline-variant/40 space-y-3 text-xs">
                        {/* File Upload (PDF/slides) */}
                        {lesson.content_type !== "video" && (
                          <div className="flex items-center gap-2">
                            <label className="font-label-sm text-on-surface-variant uppercase">
                              Attach File:
                            </label>
                            <input
                              type="file"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) void handleUpload(lesson.id, file);
                              }}
                              className="text-xs file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-surface-container-high"
                            />
                          </div>
                        )}

                        {/* Video File Upload — an alternative to the YouTube
                            ID below, not required alongside it: a lesson
                            with a video_id renders via YouTube on the
                            trainee side regardless of whether a file was
                            also uploaded here (see TraineeLearnLessons.tsx).
                            Uploading here overwrites any previous
                            self-hosted video for this lesson. */}
                        {lesson.content_type === "video" && (
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2">
                              <label className="font-label-sm text-on-surface-variant uppercase">
                                Upload Video File:
                              </label>
                              <input
                                type="file"
                                accept={LESSON_VIDEO_MIME_TYPES.join(",")}
                                disabled={videoUploadProgress[lesson.id] !== undefined}
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) void handleVideoUpload(lesson.id, file);
                                }}
                                className="text-xs file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-surface-container-high disabled:opacity-50"
                              />
                              {lesson.storage_path && videoUploadProgress[lesson.id] === undefined && (
                                <span className="text-status-shortlisted font-semibold">
                                  Self-hosted video attached
                                </span>
                              )}
                            </div>
                            {videoUploadProgress[lesson.id] !== undefined && (
                              <div className="h-1.5 w-full max-w-xs rounded-full bg-surface-container-high overflow-hidden">
                                <div
                                  className="h-full bg-cta transition-all"
                                  style={{ width: `${Math.round(videoUploadProgress[lesson.id] * 100)}%` }}
                                />
                              </div>
                            )}
                          </div>
                        )}

                        {/* YouTube ID Updater */}
                        <div className="flex items-center gap-2">
                          <label className="font-label-sm text-on-surface-variant uppercase">YouTube ID:</label>
                          <input
                            value={youtubeInputs[lesson.id] ?? ""}
                            onChange={(e) =>
                              setYoutubeInputs((prev) => ({ ...prev, [lesson.id]: e.target.value }))
                            }
                            placeholder="e.g. dQw4w9WgXcQ"
                            className="border border-outline-variant rounded px-2 py-1 flex-1 text-xs"
                          />
                          <button
                            type="button"
                            onClick={() => void handleAttachYoutube(lesson.id)}
                            className="px-2 py-1 bg-primary text-on-primary rounded text-xs"
                          >
                            Set ID
                          </button>
                        </div>

                        {/* Locale Translation */}
                        <div className="p-2 bg-surface-container-low rounded space-y-2">
                          <span className="font-label-sm uppercase font-bold text-on-surface-variant">
                            Add / Update Translation
                          </span>
                          <div className="grid grid-cols-2 gap-2">
                            <select
                              value={translationInputs[lesson.id]?.locale ?? ""}
                              onChange={(e) =>
                                setTranslationInputs((prev) => ({
                                  ...prev,
                                  [lesson.id]: {
                                    ...(prev[lesson.id] ?? { title: "", summary: "" }),
                                    locale: e.target.value,
                                  },
                                }))
                              }
                              className="border border-outline-variant rounded p-1 text-xs"
                            >
                              <option value="">Select language...</option>
                              {SUGGESTED_LOCALES.map((l) => (
                                <option key={l} value={l}>
                                  {l}
                                </option>
                              ))}
                            </select>
                            <input
                              value={translationInputs[lesson.id]?.title ?? ""}
                              onChange={(e) =>
                                setTranslationInputs((prev) => ({
                                  ...prev,
                                  [lesson.id]: {
                                    ...(prev[lesson.id] ?? { locale: "", summary: "" }),
                                    title: e.target.value,
                                  },
                                }))
                              }
                              placeholder="Localized Title"
                              className="border border-outline-variant rounded p-1 text-xs"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => void handleSaveTranslation(lesson.id)}
                            className="px-3 py-1 bg-secondary-container text-on-secondary-container rounded font-bold text-xs"
                          >
                            Save Translation
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}

              {/* Assessment Builder Panel */}
              {selectedCourseId && selectedModuleId && (
                <div className="mt-6 pt-4 border-t border-outline-variant">
                  <h4 className="font-headline-sm text-[16px] text-primary mb-3 flex items-center gap-2">
                    <span className="material-symbols-outlined text-secondary">quiz</span>
                    Module Assessments
                  </h4>
                  <AssessmentBuilder
                    accessToken={accessToken}
                    courseId={selectedCourseId}
                    moduleId={selectedModuleId}
                    lessonId={lessons[0]?.id}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
