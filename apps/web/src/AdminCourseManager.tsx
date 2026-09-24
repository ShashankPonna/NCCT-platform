import {
  createCourse,
  createLesson,
  createModule,
  createSkill,
  getCourses,
  getCourseSkills,
  getLessonContentUrl,
  getLessons,
  getLessonVideoUploadUrl,
  getLessonVideoUrl,
  getModules,
  getProgrammes,
  getSkills,
  setCourseSkills,
  updateLesson,
  uploadLessonContent,
  uploadLessonVideoFile,
  upsertLessonTranslation,
} from "@ncct/api-client";
import { LESSON_VIDEO_MIME_TYPES, SUGGESTED_LOCALES } from "@ncct/constants";
import type { ContentType, Course, Lesson, Module, Programme, Skill } from "@ncct/shared-types";
import { createLessonSchema, localeSchema, youtubeVideoIdSchema } from "@ncct/validation";
import { useEffect, useState } from "react";
import { AssessmentBuilder } from "./AssessmentBuilder.js";
import { CourseGradebook } from "./CourseGradebook.js";
import { useLocale, type Locale } from "./i18n/LocaleContext.js";
import { SelfHostedVideoPlayer } from "./SelfHostedVideoPlayer.js";
import { SkillPicker } from "./SkillPicker.js";
import { YouTubeVideoPlayer } from "./YouTubeVideoPlayer.js";

interface AdminCourseManagerProps {
  accessToken: string;
}

interface AdminCourseManagerText {
  heading: string;
  subheading: string;
  selectProgramme: string;
  courses: string;
  addCourseAria: string;
  courseTitlePlaceholder: string;
  createCourse: string;
  noCoursesYet: string;
  modules: string;
  addModuleAria: string;
  inContext: (title: string) => string;
  selectACourse: string;
  moduleTitlePlaceholder: string;
  createModule: string;
  selectCourseToViewModules: string;
  noModulesYet: string;
  lessonsAndAssessments: string;
  selectAModule: string;
  cancel: string;
  addItem: string;
  createNewLesson: string;
  lessonTitlePlaceholder: string;
  contentTypeVideo: string;
  contentTypePdf: string;
  contentTypeSlides: string;
  contentTypeArticle: string;
  youtubeIdOptionalPlaceholder: string;
  saveLesson: string;
  selectModuleToView: string;
  noLessonsYet: string;
  contentType: Record<string, string>;
  ytPrefix: (id: string) => string;
  hideDetails: string;
  manage: string;
  preview: string;
  hidePreview: string;
  loadingPreview: string;
  noContentYet: string;
  cannotPreviewInline: string;
  openInNewTab: string;
  skillsGranted: (count: number) => string;
  hideSkillsGranted: string;
  skillsGrantedBody: string;
  courseSkillsUnavailable: string;
  newSkillPlaceholder: string;
  addToTaxonomy: string;
  saveSkills: string;
  saving: string;
  attachFile: string;
  uploading: string;
  fileAttached: string;
  uploadVideoFile: string;
  selfHostedVideoAttached: string;
  youtubeIdLabel: string;
  setId: string;
  addUpdateTranslation: string;
  selectLanguage: string;
  localizedTitlePlaceholder: string;
  localizedBodyPlaceholder: string;
  saveTranslation: string;
  moduleAssessments: string;
  courseGradebook: string;
  invalidLessonPayload: string;
  invalidYoutubeId: string;
  invalidLocale: string;
}

const content: Record<Locale, AdminCourseManagerText> = {
  en: {
    heading: "Content Management",
    subheading: "Manage courses, modules, lessons, and assessments.",
    selectProgramme: "Select Programme",
    courses: "Courses",
    addCourseAria: "Add Course",
    courseTitlePlaceholder: "Course Title",
    createCourse: "Create Course",
    noCoursesYet: "No courses in this programme.",
    modules: "Modules",
    addModuleAria: "Add Module",
    inContext: (title) => `in ${title}`,
    selectACourse: "Select a course",
    moduleTitlePlaceholder: "Module Title",
    createModule: "Create Module",
    selectCourseToViewModules: "Select a course to view modules.",
    noModulesYet: "No modules created yet.",
    lessonsAndAssessments: "Lessons & Assessments",
    selectAModule: "Select a module",
    cancel: "Cancel",
    addItem: "Add Item",
    createNewLesson: "Create New Lesson",
    lessonTitlePlaceholder: "Lesson Title *",
    contentTypeVideo: "Video",
    contentTypePdf: "PDF Document",
    contentTypeSlides: "Slides",
    contentTypeArticle: "Article / Text",
    youtubeIdOptionalPlaceholder: "YouTube Video ID (optional)",
    saveLesson: "Save Lesson",
    selectModuleToView: "Select a module to view lessons and assessments.",
    noLessonsYet: 'No lessons or assessments added yet. Click "Add Item" above.',
    contentType: { video: "VIDEO", pdf: "PDF", slides: "SLIDES", article: "ARTICLE" },
    ytPrefix: (id) => `YT: ${id}`,
    hideDetails: "Hide Details",
    manage: "Manage",
    preview: "Preview",
    hidePreview: "Hide Preview",
    loadingPreview: "Loading preview…",
    noContentYet: "Nothing uploaded yet.",
    cannotPreviewInline: "This file type can't be previewed inline.",
    openInNewTab: "Open in new tab",
    skillsGranted: (count) => `Skills Granted (${count})`,
    hideSkillsGranted: "Hide Skills",
    skillsGrantedBody:
      "A trainee who earns a certificate for this specific course is read as having acquired every skill tagged here, in addition to anything tagged on the whole programme — this is what the Skill-Gap Check compares a job's required skills against.",
    courseSkillsUnavailable:
      "Course-level skill tagging isn't set up on this project yet — ask an admin to apply the pending database migration. Skills granted on the whole programme still work as before.",
    newSkillPlaceholder: "New skill, e.g. Bookkeeping",
    addToTaxonomy: "Add to Taxonomy",
    saveSkills: "Save Skills",
    saving: "Saving...",
    attachFile: "Attach File:",
    uploading: "Uploading…",
    fileAttached: "File attached",
    uploadVideoFile: "Upload Video File:",
    selfHostedVideoAttached: "Self-hosted video attached",
    youtubeIdLabel: "YouTube ID:",
    setId: "Set ID",
    addUpdateTranslation: "Add / Update Translation",
    selectLanguage: "Select language...",
    localizedTitlePlaceholder: "Localized Title",
    localizedBodyPlaceholder: "Localized body text (optional)",
    saveTranslation: "Save Translation",
    moduleAssessments: "Module Assessments",
    courseGradebook: "Gradebook",
    invalidLessonPayload: "Invalid lesson payload",
    invalidYoutubeId: "Invalid YouTube ID",
    invalidLocale: "Locale must be a valid BCP 47 code (e.g. 'hi-IN')",
  },
  hi: {
    heading: "सामग्री प्रबंधन",
    subheading: "पाठ्यक्रम, मॉड्यूल, पाठ और मूल्यांकन प्रबंधित करें।",
    selectProgramme: "कार्यक्रम चुनें",
    courses: "पाठ्यक्रम",
    addCourseAria: "पाठ्यक्रम जोड़ें",
    courseTitlePlaceholder: "पाठ्यक्रम शीर्षक",
    createCourse: "पाठ्यक्रम बनाएं",
    noCoursesYet: "इस कार्यक्रम में कोई पाठ्यक्रम नहीं है।",
    modules: "मॉड्यूल",
    addModuleAria: "मॉड्यूल जोड़ें",
    inContext: (title) => `इसमें: ${title}`,
    selectACourse: "एक पाठ्यक्रम चुनें",
    moduleTitlePlaceholder: "मॉड्यूल शीर्षक",
    createModule: "मॉड्यूल बनाएं",
    selectCourseToViewModules: "मॉड्यूल देखने के लिए एक पाठ्यक्रम चुनें।",
    noModulesYet: "अभी तक कोई मॉड्यूल नहीं बनाया गया है।",
    lessonsAndAssessments: "पाठ एवं मूल्यांकन",
    selectAModule: "एक मॉड्यूल चुनें",
    cancel: "रद्द करें",
    addItem: "आइटम जोड़ें",
    createNewLesson: "नया पाठ बनाएं",
    lessonTitlePlaceholder: "पाठ शीर्षक *",
    contentTypeVideo: "वीडियो",
    contentTypePdf: "PDF दस्तावेज़",
    contentTypeSlides: "स्लाइड्स",
    contentTypeArticle: "लेख / टेक्स्ट",
    youtubeIdOptionalPlaceholder: "YouTube वीडियो आईडी (वैकल्पिक)",
    saveLesson: "पाठ सहेजें",
    selectModuleToView: "पाठ एवं मूल्यांकन देखने के लिए एक मॉड्यूल चुनें।",
    noLessonsYet: 'अभी तक कोई पाठ या मूल्यांकन नहीं जोड़ा गया है। ऊपर "आइटम जोड़ें" पर क्लिक करें।',
    contentType: { video: "वीडियो", pdf: "PDF", slides: "स्लाइड्स", article: "लेख" },
    ytPrefix: (id) => `YT: ${id}`,
    hideDetails: "विवरण छिपाएं",
    manage: "प्रबंधित करें",
    preview: "पूर्वावलोकन",
    hidePreview: "पूर्वावलोकन छिपाएं",
    loadingPreview: "पूर्वावलोकन लोड हो रहा है…",
    noContentYet: "अभी तक कुछ भी अपलोड नहीं किया गया है।",
    cannotPreviewInline: "इस फ़ाइल प्रकार का इनलाइन पूर्वावलोकन नहीं किया जा सकता।",
    openInNewTab: "नए टैब में खोलें",
    skillsGranted: (count) => `प्रदत्त कौशल (${count})`,
    hideSkillsGranted: "कौशल छिपाएं",
    skillsGrantedBody:
      "जो प्रशिक्षणार्थी इस विशिष्ट पाठ्यक्रम के लिए प्रमाणपत्र अर्जित करता है, उसे यहां टैग किए गए हर कौशल को — पूरे कार्यक्रम पर टैग किए गए कौशलों के अतिरिक्त — अर्जित माना जाता है। कौशल-अंतर जांच किसी नौकरी के आवश्यक कौशलों की तुलना इसी से करती है।",
    courseSkillsUnavailable:
      "इस प्रोजेक्ट पर पाठ्यक्रम-स्तरीय कौशल टैगिंग अभी सेट नहीं हुई है — किसी एडमिन से लंबित डेटाबेस माइग्रेशन लागू करने को कहें। पूरे कार्यक्रम पर दिए गए कौशल पहले की तरह काम करते रहेंगे।",
    newSkillPlaceholder: "नया कौशल, उदा. बहीखाता",
    addToTaxonomy: "वर्गीकरण में जोड़ें",
    saveSkills: "कौशल सहेजें",
    saving: "सहेजा जा रहा है...",
    attachFile: "फ़ाइल संलग्न करें:",
    uploading: "अपलोड हो रहा है…",
    fileAttached: "फ़ाइल संलग्न है",
    uploadVideoFile: "वीडियो फ़ाइल अपलोड करें:",
    selfHostedVideoAttached: "स्व-होस्टेड वीडियो संलग्न है",
    youtubeIdLabel: "YouTube आईडी:",
    setId: "आईडी सेट करें",
    addUpdateTranslation: "अनुवाद जोड़ें / अपडेट करें",
    selectLanguage: "भाषा चुनें...",
    localizedTitlePlaceholder: "स्थानीयकृत शीर्षक",
    localizedBodyPlaceholder: "स्थानीयकृत मुख्य पाठ (वैकल्पिक)",
    saveTranslation: "अनुवाद सहेजें",
    moduleAssessments: "मॉड्यूल मूल्यांकन",
    courseGradebook: "ग्रेडबुक",
    invalidLessonPayload: "अमान्य पाठ डेटा",
    invalidYoutubeId: "अमान्य YouTube आईडी",
    invalidLocale: "भाषा एक मान्य BCP 47 कोड होनी चाहिए (उदा. 'hi-IN')",
  },
};

// Only a real PDF renders inline in an <iframe> across browsers — a .ppt/
// .pptx "slides" upload (both accepted by LESSON_FILE_MIME_TYPES) just
// triggers a download or a blank frame, since no browser ships a native
// PowerPoint viewer. storage_path keeps the original filename's extension
// (`${lessonId}/${timestamp}-${originalname}`, see lessonContent.ts), so the
// extension alone is enough to tell without adding a viewer dependency.
function canInlinePreview(storagePath: string | null): boolean {
  return storagePath != null && storagePath.toLowerCase().endsWith(".pdf");
}

export function AdminCourseManager({ accessToken }: AdminCourseManagerProps) {
  const { locale } = useLocale();
  const t = content[locale];
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
  // Only one lesson's content preview is fetched/shown at a time — a fresh
  // signed URL per open, not cached, so it can't go stale mid-session.
  const [previewLessonId, setPreviewLessonId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Lesson sub-actions
  const [youtubeInputs, setYoutubeInputs] = useState<Record<string, string>>({});
  const [translationInputs, setTranslationInputs] = useState<
    Record<string, { locale: string; title: string; body: string }>
  >({});
  // Fraction (0-1) while a video upload to B2 is in flight; absent once done
  // or if nothing's uploading for that lesson.
  const [videoUploadProgress, setVideoUploadProgress] = useState<Record<string, number>>({});
  // True while a PDF/slides upload to Supabase Storage is in flight for a
  // given lesson (that upload has no progress callback, only a busy/done
  // state — unlike video's B2 presigned-PUT path).
  const [fileUploading, setFileUploading] = useState<Record<string, boolean>>({});

  // Course-level "Skills Granted" (DECISIONS.md #45) — the finer-grained
  // sibling of AdminProgrammeManager.tsx's whole-programme skills section.
  // Content-authoring, so admin+trainer here, matching this file's own
  // existing access model rather than AdminProgrammeManager's admin-only
  // gate on programme-wide grants.
  const [skills, setSkills] = useState<Skill[]>([]);
  const [courseSkillIds, setCourseSkillIds] = useState<Set<string>>(new Set());
  const [newSkillName, setNewSkillName] = useState("");
  const [savingCourseSkills, setSavingCourseSkills] = useState(false);
  const [showCourseSkills, setShowCourseSkills] = useState(false);
  // True when the course_skills table doesn't exist yet on this project —
  // migration 20260901000017 not applied. This is an additive enrichment
  // on top of course selection, so its own failure must never block loading
  // the course's modules (see handleSelectCourse's separate try/catch).
  const [courseSkillsUnavailable, setCourseSkillsUnavailable] = useState(false);

  useEffect(() => {
    getProgrammes(accessToken)
      .then((progs) => {
        setProgrammes(progs);
        if (progs.length > 0 && !programmeId) {
          void handleSelectProgramme(progs[0].id);
        }
      })
      .catch((err: Error) => setError(err.message));
    getSkills(accessToken)
      .then(setSkills)
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
    setShowCourseSkills(false);
    setCourseSkillsUnavailable(false);
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

    // Deliberately its own try/catch, not bundled into the Promise.all
    // above: this is an additive enrichment (DECISIONS.md #45), and a
    // pending-migration failure here must never take the actual "select a
    // course, see its modules" flow down with it — that regression is
    // exactly what the bundled version did before this fix.
    try {
      const courseSkills = await getCourseSkills(accessToken, courseId);
      setCourseSkillIds(new Set(courseSkills.map((s) => s.id)));
    } catch {
      setCourseSkillIds(new Set());
      setCourseSkillsUnavailable(true);
    }
  }

  function toggleCourseSkill(skillId: string) {
    setCourseSkillIds((prev) => {
      const next = new Set(prev);
      if (next.has(skillId)) next.delete(skillId);
      else next.add(skillId);
      return next;
    });
  }

  async function handleSaveCourseSkills() {
    if (!selectedCourseId) return;
    setError(null);
    setSavingCourseSkills(true);
    try {
      await setCourseSkills(accessToken, selectedCourseId, [...courseSkillIds]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSavingCourseSkills(false);
    }
  }

  async function handleCreateSkill() {
    const name = newSkillName.trim();
    if (!name) return;
    setError(null);
    try {
      const skill = await createSkill(accessToken, { name });
      setSkills((prev) => [...prev, skill].sort((a, b) => a.name.localeCompare(b.name)));
      setCourseSkillIds((prev) => new Set(prev).add(skill.id));
      setNewSkillName("");
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
    const videoIdRaw = String(form.get("video_id") ?? "");

    const parsed = createLessonSchema.safeParse({
      title: String(form.get("title") ?? "").trim(),
      content_type: String(form.get("content_type") ?? "video") as ContentType,
      video_id: videoIdRaw || undefined,
    });

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? t.invalidLessonPayload);
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
    setFileUploading((prev) => ({ ...prev, [lessonId]: true }));
    try {
      await uploadLessonContent(accessToken, lessonId, file);
      if (selectedModuleId) {
        setLessons(await getLessons(accessToken, selectedModuleId));
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setFileUploading((prev) => {
        const next = { ...prev };
        delete next[lessonId];
        return next;
      });
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
      setError(parsed.error.issues[0]?.message ?? t.invalidYoutubeId);
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

  // Fetches whatever signed URL the content actually needs and toggles the
  // preview panel — a YouTube-hosted video needs no fetch at all (the id
  // alone is enough for YouTubeVideoPlayer), everything else (self-hosted
  // video, PDF/slides) goes through the same short-lived signed-URL routes
  // the trainee side already uses (getLessonVideoUrl/getLessonContentUrl).
  async function handleTogglePreview(lesson: Lesson) {
    if (previewLessonId === lesson.id) {
      setPreviewLessonId(null);
      setPreviewUrl(null);
      return;
    }
    setPreviewLessonId(lesson.id);
    setPreviewUrl(null);
    setError(null);

    if (lesson.content_type === "video" && lesson.video_id) return;
    if (!lesson.storage_path) return; // nothing uploaded yet — empty state renders as-is

    setPreviewLoading(true);
    try {
      const { url } =
        lesson.content_type === "video"
          ? await getLessonVideoUrl(accessToken, lesson.id)
          : await getLessonContentUrl(accessToken, lesson.id);
      setPreviewUrl(url);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPreviewLoading(false);
    }
  }

  async function handleSaveTranslation(lessonId: string) {
    const input = translationInputs[lessonId];
    if (!input?.locale || !input?.title) return;
    const locParsed = localeSchema.safeParse(input.locale);
    if (!locParsed.success) {
      setError(t.invalidLocale);
      return;
    }
    setError(null);
    try {
      await upsertLessonTranslation(accessToken, lessonId, input.locale, {
        title: input.title,
        body: input.body || undefined,
      });
      setTranslationInputs((prev) => ({
        ...prev,
        [lessonId]: { locale: "", title: "", body: "" },
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
    <div className="w-full flex flex-col gap-6 text-left">
      {/* Header with Programme Picker */}
      <div className="bg-white rounded-2xl border border-border-slate px-6 py-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shadow-xs">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#FE932C]" />
            <span className="text-xs uppercase tracking-wider text-[#D97706] font-bold">
              Administration • Curriculum & Courseware Engineering
            </span>
          </div>
          <h1 className="font-display text-2xl lg:text-3xl font-extrabold text-[#00236F] m-0">
            {t.heading}
          </h1>
          <p className="font-body text-xs text-slate-600 mt-1 max-w-2xl">{t.subheading}</p>
        </div>

        {/* Programme Picker */}
        <div className="w-full md:w-80">
          <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
            {t.selectProgramme}
          </label>
          <div className="relative">
            <select
              value={programmeId}
              onChange={(e) => void handleSelectProgramme(e.target.value)}
              className="w-full h-11 appearance-none bg-paper-light border border-border-slate rounded-xl px-3.5 text-xs text-ink font-semibold focus:outline-none focus:bg-white focus:border-[#00236F] focus:ring-1 focus:ring-[#00236F]/20 pr-10 cursor-pointer transition-all"
            >
              {programmes.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
            <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
              expand_more
            </span>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-rose-50 text-rose-900 p-4 rounded-xl flex items-center gap-3 border border-rose-200 text-xs font-medium">
          <span className="material-symbols-outlined text-rose-600 shrink-0">error</span>
          <p>{error}</p>
        </div>
      )}

      {/* Cascading 3-Panel Container (Bento Layout) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Panel 1: Courses (Col 1-3) */}
        <div className="lg:col-span-3 flex flex-col gap-4">
          <div className="bg-white border border-border-slate rounded-2xl p-5 shadow-xs flex flex-col min-h-[540px]">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-display text-base font-bold m-0 text-[#00236F]">{t.courses}</h3>
              <button
                type="button"
                onClick={() => setShowAddCourse(!showAddCourse)}
                aria-label={t.addCourseAria}
                className="h-8 w-8 rounded-lg bg-paper-light border border-border-slate hover:bg-slate-100 flex items-center justify-center text-[#00236F] cursor-pointer transition-colors"
              >
                <span className="material-symbols-outlined text-[18px]">
                  {showAddCourse ? "close" : "add"}
                </span>
              </button>
            </div>

            {/* Inline Add Course */}
            {showAddCourse && (
              <form onSubmit={(e) => void handleCreateCourse(e)} className="mb-3.5 p-3.5 bg-paper rounded-xl border border-border-slate space-y-2.5">
                <input
                  name="title"
                  required
                  placeholder={t.courseTitlePlaceholder}
                  className="w-full bg-white border border-border-slate rounded-lg p-2 text-xs text-ink outline-none focus:border-[#00236F]"
                />
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full bg-[#FE932C] hover:bg-[#E07D1E] text-white py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer shadow-xs"
                >
                  {t.createCourse}
                </button>
              </form>
            )}

            <div className="space-y-2 flex-1 overflow-y-auto pr-1">
              {courses.length === 0 ? (
                <p className="text-xs text-slate-400 p-4 text-center">{t.noCoursesYet}</p>
              ) : (
                courses.map((c) => {
                  const isSelected = c.id === selectedCourseId;
                  return (
                    <div
                      key={c.id}
                      onClick={() => void handleSelectCourse(c.id)}
                      className={`p-3.5 rounded-xl cursor-pointer transition-all relative group border ${
                        isSelected
                          ? "bg-amber-50/80 border-amber-300 shadow-xs"
                          : "bg-paper-light border-border-slate/60 hover:bg-paper hover:border-border-slate"
                      }`}
                    >
                      <div className="font-bold text-xs text-[#00236F] mb-0.5 line-clamp-2">
                        {c.title}
                      </div>
                      <span className="material-symbols-outlined absolute right-2.5 top-1/2 -translate-y-1/2 text-[#D97706] opacity-0 group-hover:opacity-100 transition-opacity text-[18px]">
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
          <div className="bg-white border border-border-slate rounded-2xl p-5 shadow-xs flex flex-col min-h-[540px]">
            <div className="flex justify-between items-center mb-1">
              <h3 className="font-display text-base font-bold m-0 text-[#00236F]">{t.modules}</h3>
              {selectedCourseId && (
                <button
                  type="button"
                  onClick={() => setShowAddModule(!showAddModule)}
                  aria-label={t.addModuleAria}
                  className="h-8 w-8 rounded-lg bg-paper-light border border-border-slate hover:bg-slate-100 flex items-center justify-center text-[#00236F] cursor-pointer transition-colors"
                >
                  <span className="material-symbols-outlined text-[18px]">
                    {showAddModule ? "close" : "add"}
                  </span>
                </button>
              )}
            </div>

            <div className="text-xs text-slate-500 mb-2 pb-2 border-b border-border-slate/60 truncate font-medium">
              {selectedCourse ? t.inContext(selectedCourse.title) : t.selectACourse}
            </div>

            {/* Skills Granted (P1 Skill-Gap Analysis, DECISIONS.md #45) */}
            {selectedCourseId && (
              <div className="mb-4 pb-3 border-b border-border-slate/60">
                <button
                  type="button"
                  onClick={() => setShowCourseSkills((prev) => !prev)}
                  className="text-xs text-[#D97706] hover:underline font-bold"
                >
                  {showCourseSkills ? t.hideSkillsGranted : t.skillsGranted(courseSkillIds.size)}
                </button>
                {showCourseSkills && courseSkillsUnavailable && (
                  <p className="mt-3 text-[11px] text-slate-500 bg-slate-50 border border-dashed border-border-slate rounded-lg p-2.5">
                    {t.courseSkillsUnavailable}
                  </p>
                )}
                {showCourseSkills && !courseSkillsUnavailable && (
                  <div className="mt-3 space-y-2">
                    <p className="text-[11px] text-slate-500">{t.skillsGrantedBody}</p>
                    <SkillPicker skills={skills} selectedIds={courseSkillIds} onToggle={toggleCourseSkill} />
                    <div className="flex gap-2">
                      <input
                        value={newSkillName}
                        onChange={(e) => setNewSkillName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            void handleCreateSkill();
                          }
                        }}
                        placeholder={t.newSkillPlaceholder}
                        className="flex-1 h-9 bg-paper-light border border-border-slate rounded-lg px-2.5 text-xs focus:border-[#00236F] outline-none"
                        type="text"
                      />
                      <button
                        type="button"
                        onClick={() => void handleCreateSkill()}
                        className="px-3 h-9 bg-paper-light border border-border-slate text-[#00236F] rounded-lg text-xs font-bold hover:bg-slate-100 cursor-pointer whitespace-nowrap"
                      >
                        {t.addToTaxonomy}
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleSaveCourseSkills()}
                      disabled={savingCourseSkills}
                      className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-[#FE932C] hover:bg-[#E07D1E] text-white shadow-xs disabled:opacity-50 cursor-pointer"
                    >
                      {savingCourseSkills ? t.saving : t.saveSkills}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Inline Add Module */}
            {showAddModule && (
              <form onSubmit={(e) => void handleCreateModule(e)} className="mb-3.5 p-3.5 bg-paper rounded-xl border border-border-slate space-y-2.5">
                <input
                  name="title"
                  required
                  placeholder={t.moduleTitlePlaceholder}
                  className="w-full bg-white border border-border-slate rounded-lg p-2 text-xs text-ink outline-none focus:border-[#00236F]"
                />
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full bg-[#FE932C] hover:bg-[#E07D1E] text-white py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer shadow-xs"
                >
                  {t.createModule}
                </button>
              </form>
            )}

            <div className="space-y-2 flex-1 overflow-y-auto pr-1">
              {!selectedCourseId ? (
                <p className="text-xs text-slate-400 p-4 text-center">{t.selectCourseToViewModules}</p>
              ) : modules.length === 0 ? (
                <p className="text-xs text-slate-400 p-4 text-center">{t.noModulesYet}</p>
              ) : (
                modules.map((m) => {
                  const isSelected = m.id === selectedModuleId;
                  return (
                    <div
                      key={m.id}
                      onClick={() => void handleSelectModule(m.id)}
                      className={`p-3.5 rounded-xl cursor-pointer transition-all relative group border ${
                        isSelected
                          ? "bg-amber-50/80 border-amber-300 shadow-xs"
                          : "bg-paper-light border-border-slate/60 hover:bg-paper hover:border-border-slate"
                      }`}
                    >
                      <div className="font-bold text-xs text-[#00236F] mb-0.5 line-clamp-2">
                        {m.title}
                      </div>
                      <span className="material-symbols-outlined absolute right-2.5 top-1/2 -translate-y-1/2 text-[#D97706] opacity-0 group-hover:opacity-100 transition-opacity text-[18px]">
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
          <div className="bg-white border border-border-slate rounded-2xl shadow-xs overflow-hidden flex flex-col min-h-[540px]">
            <div className="p-5 border-b border-border-slate/60 bg-paper flex justify-between items-center">
              <div>
                <h3 className="font-display text-base font-bold m-0 text-[#00236F]">
                  {t.lessonsAndAssessments}
                </h3>
                <div className="text-xs text-slate-500 truncate max-w-sm font-medium mt-0.5">
                  {selectedModule ? t.inContext(selectedModule.title) : t.selectAModule}
                </div>
              </div>

              {selectedModuleId && (
                <button
                  type="button"
                  onClick={() => setShowAddLesson(!showAddLesson)}
                  className="h-9 px-4 bg-[#FE932C] hover:bg-[#E07D1E] text-white text-xs font-bold rounded-xl transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[16px]">
                    {showAddLesson ? "close" : "add"}
                  </span>
                  {showAddLesson ? t.cancel : t.addItem}
                </button>
              )}
            </div>

            {/* Inline Add Lesson Form */}
            {showAddLesson && selectedModuleId && (
              <form
                onSubmit={(e) => void handleCreateLesson(e)}
                className="p-4 bg-paper-light border-b border-border-slate/60 space-y-3"
              >
                <h4 className="font-bold text-xs m-0 text-[#00236F]">{t.createNewLesson}</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    name="title"
                    required
                    placeholder={t.lessonTitlePlaceholder}
                    className="w-full bg-white border border-border-slate rounded-xl p-2.5 text-xs text-ink outline-none focus:border-[#00236F]"
                  />
                  <select
                    name="content_type"
                    defaultValue="video"
                    className="w-full bg-white border border-border-slate rounded-xl p-2.5 text-xs text-ink outline-none focus:border-[#00236F] cursor-pointer"
                  >
                    <option value="video">{t.contentTypeVideo}</option>
                    <option value="pdf">{t.contentTypePdf}</option>
                    <option value="slides">{t.contentTypeSlides}</option>
                    <option value="article">{t.contentTypeArticle}</option>
                  </select>
                </div>
                <input
                  name="video_id"
                  placeholder={t.youtubeIdOptionalPlaceholder}
                  className="w-full bg-white border border-border-slate rounded-xl p-2.5 text-xs text-ink outline-none focus:border-[#00236F]"
                />
                <div className="flex justify-end">
                  <button
                    disabled={busy}
                    type="submit"
                    className="px-4 py-2 bg-[#FE932C] hover:bg-[#E07D1E] text-white rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-xs"
                  >
                    {t.saveLesson}
                  </button>
                </div>
              </form>
            )}

            {/* Lessons List */}
            <div className="p-5 space-y-4 flex-1 overflow-y-auto">
              {!selectedModuleId ? (
                <div className="flex flex-col items-center justify-center p-8 text-center text-slate-400">
                  <span className="material-symbols-outlined text-[48px] opacity-40 mb-2">
                    menu_book
                  </span>
                  <p className="text-xs">{t.selectModuleToView}</p>
                </div>
              ) : lessons.length === 0 ? (
                <p className="text-xs text-slate-400 p-4 text-center">{t.noLessonsYet}</p>
              ) : (
                lessons.map((lesson) => (
                  <div
                    key={lesson.id}
                    className="border border-border-slate rounded-xl p-4 bg-paper-light shadow-xs space-y-3 hover:border-[#FE932C]/40 transition-all"
                  >
                    <div className="flex justify-between items-start gap-2">
                      <div className="flex items-center gap-3">
                        <span
                          className={`material-symbols-outlined p-2 rounded-xl text-[20px] ${
                            lesson.content_type === "video"
                              ? "text-[#D97706] bg-amber-100"
                              : "text-[#00236F] bg-blue-100"
                          }`}
                        >
                          {lesson.content_type === "video" ? "play_circle" : "description"}
                        </span>
                        <div>
                          <h4 className="font-bold text-xs text-[#00236F] m-0">{lesson.title}</h4>
                          <p className="text-[11px] text-slate-500 m-0 flex items-center gap-2 mt-0.5">
                            <span className="uppercase font-bold">
                              {t.contentType[lesson.content_type] ?? lesson.content_type}
                            </span>
                            {lesson.video_id && (
                              <span className="text-[#D97706] font-metric-mono font-bold">{t.ytPrefix(lesson.video_id)}</span>
                            )}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        {(lesson.content_type === "video" ||
                          lesson.content_type === "pdf" ||
                          lesson.content_type === "slides") && (
                          <button
                            type="button"
                            onClick={() => void handleTogglePreview(lesson)}
                            className="text-xs text-[#00236F] hover:text-[#FE932C] hover:underline font-bold cursor-pointer"
                          >
                            {previewLessonId === lesson.id ? t.hidePreview : t.preview}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setActiveLessonId(activeLessonId === lesson.id ? null : lesson.id)}
                          className="text-xs text-[#00236F] hover:text-[#FE932C] hover:underline font-bold cursor-pointer"
                        >
                          {activeLessonId === lesson.id ? t.hideDetails : t.manage}
                        </button>
                      </div>
                    </div>

                    {/* Content Preview (When toggled) */}
                    {previewLessonId === lesson.id && (
                      <div className="pt-3 border-t border-border-slate/50">
                        {previewLoading ? (
                          <p className="text-xs text-slate-500">{t.loadingPreview}</p>
                        ) : lesson.content_type === "video" ? (
                          lesson.video_id ? (
                            <YouTubeVideoPlayer videoId={lesson.video_id} />
                          ) : (
                            <SelfHostedVideoPlayer url={previewUrl} />
                          )
                        ) : previewUrl ? (
                          canInlinePreview(lesson.storage_path) ? (
                            <iframe
                              src={previewUrl}
                              title={lesson.title}
                              className="w-full h-96 rounded-xl border border-border-slate bg-white"
                            />
                          ) : (
                            <p className="text-xs text-slate-500">
                              {t.cannotPreviewInline}{" "}
                              <a
                                href={previewUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-[#00236F] hover:underline font-bold"
                              >
                                {t.openInNewTab}
                              </a>
                            </p>
                          )
                        ) : (
                          <p className="text-xs text-slate-500">{t.noContentYet}</p>
                        )}
                      </div>
                    )}

                    {/* Extended Controls (When expanded) */}
                    {activeLessonId === lesson.id && (
                      <div className="pt-3 border-t border-border-slate/50 space-y-3 text-xs">
                        {/* File Upload (PDF/slides) */}
                        {lesson.content_type !== "video" && (
                          <div className="flex items-center gap-2">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                              {t.attachFile}
                            </label>
                            <input
                              type="file"
                              disabled={fileUploading[lesson.id] === true}
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) void handleUpload(lesson.id, file);
                              }}
                              className="text-xs file:mr-2 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:text-xs file:bg-white file:text-[#00236F] file:font-semibold disabled:opacity-50"
                            />
                            {fileUploading[lesson.id] === true && (
                              <span className="text-slate-500 font-semibold">{t.uploading}</span>
                            )}
                            {fileUploading[lesson.id] !== true && lesson.storage_path && (
                              <span className="text-emerald-700 font-bold">{t.fileAttached}</span>
                            )}
                          </div>
                        )}

                        {/* Video File Upload */}
                        {lesson.content_type === "video" && (
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2">
                              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                                {t.uploadVideoFile}
                              </label>
                              <input
                                type="file"
                                accept={LESSON_VIDEO_MIME_TYPES.join(",")}
                                disabled={videoUploadProgress[lesson.id] !== undefined}
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) void handleVideoUpload(lesson.id, file);
                                }}
                                className="text-xs file:mr-2 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:text-xs file:bg-white file:text-[#00236F] file:font-semibold disabled:opacity-50"
                              />
                              {lesson.storage_path && videoUploadProgress[lesson.id] === undefined && (
                                <span className="text-emerald-700 font-bold">
                                  {t.selfHostedVideoAttached}
                                </span>
                              )}
                            </div>
                            {videoUploadProgress[lesson.id] !== undefined && (
                              <div className="h-1.5 w-full max-w-xs rounded-full bg-slate-200 overflow-hidden">
                                <div
                                  className="h-full bg-[#FE932C] transition-all"
                                  style={{ width: `${Math.round(videoUploadProgress[lesson.id] * 100)}%` }}
                                />
                              </div>
                            )}
                          </div>
                        )}

                        {/* YouTube ID Updater */}
                        <div className="flex items-center gap-2">
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{t.youtubeIdLabel}</label>
                          <input
                            value={youtubeInputs[lesson.id] ?? ""}
                            onChange={(e) =>
                              setYoutubeInputs((prev) => ({ ...prev, [lesson.id]: e.target.value }))
                            }
                            placeholder="e.g. dQw4w9WgXcQ"
                            className="bg-white border border-border-slate rounded-lg px-2.5 py-1 flex-1 text-xs text-ink outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => void handleAttachYoutube(lesson.id)}
                            className="px-3 py-1 bg-[#00236F] hover:bg-[#001b54] text-white rounded-lg text-xs font-bold cursor-pointer"
                          >
                            {t.setId}
                          </button>
                        </div>

                        {/* Locale Translation */}
                        <div className="p-3 bg-paper rounded-xl border border-border-slate space-y-2">
                          <span className="text-[10px] uppercase font-bold tracking-wider text-[#D97706] block">
                            {t.addUpdateTranslation}
                          </span>
                          <div className="grid grid-cols-2 gap-2">
                            <select
                              value={translationInputs[lesson.id]?.locale ?? ""}
                              onChange={(e) =>
                                setTranslationInputs((prev) => ({
                                  ...prev,
                                  [lesson.id]: {
                                    ...(prev[lesson.id] ?? { title: "", body: "" }),
                                    locale: e.target.value,
                                  },
                                }))
                              }
                              className="bg-white border border-border-slate rounded-lg p-1.5 text-xs text-ink outline-none"
                            >
                              <option value="">{t.selectLanguage}</option>
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
                                    ...(prev[lesson.id] ?? { locale: "", body: "" }),
                                    title: e.target.value,
                                  },
                                }))
                              }
                              placeholder={t.localizedTitlePlaceholder}
                              className="bg-white border border-border-slate rounded-lg p-1.5 text-xs text-ink outline-none"
                            />
                          </div>
                          <textarea
                            value={translationInputs[lesson.id]?.body ?? ""}
                            onChange={(e) =>
                              setTranslationInputs((prev) => ({
                                ...prev,
                                [lesson.id]: {
                                  ...(prev[lesson.id] ?? { locale: "", title: "" }),
                                  body: e.target.value,
                                },
                              }))
                            }
                            placeholder={t.localizedBodyPlaceholder}
                            rows={2}
                            className="w-full bg-white border border-border-slate rounded-lg p-2 text-xs text-ink outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => void handleSaveTranslation(lesson.id)}
                            className="px-3.5 py-1.5 bg-[#FE932C] hover:bg-[#E07D1E] text-white rounded-lg font-bold text-xs cursor-pointer shadow-xs"
                          >
                            {t.saveTranslation}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}

              {/* Assessment Builder Panel */}
              {selectedCourseId && selectedModuleId && (
                <div className="mt-6 pt-5 border-t border-border-slate/60">
                  <h4 className="font-display text-base font-bold text-[#00236F] mb-3 flex items-center gap-2">
                    <span className="material-symbols-outlined text-[#D97706]">quiz</span>
                    {t.moduleAssessments}
                  </h4>
                  <AssessmentBuilder accessToken={accessToken} moduleId={selectedModuleId} />
                </div>
              )}

              {/* Course Gradebook — every roster trainee's best marks per
                  graded module test in the selected course. */}
              {selectedCourseId && (
                <div className="mt-6 pt-5 border-t border-border-slate/60">
                  <h4 className="font-display text-base font-bold text-[#00236F] mb-3 flex items-center gap-2">
                    <span className="material-symbols-outlined text-[#D97706]">grading</span>
                    {t.courseGradebook}
                  </h4>
                  <CourseGradebook key={selectedCourseId} accessToken={accessToken} courseId={selectedCourseId} />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
