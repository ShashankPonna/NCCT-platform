import {
  assignProgrammeTrainer,
  createProgramme,
  createSkill,
  createTimetableSession,
  decideNomination,
  getInstitutions,
  getProgrammeNominations,
  getProgrammes,
  getProgrammeSkills,
  getProgrammeTrainers,
  getSkills,
  getTimetableSessions,
  listUsers,
  setProgrammeSkills,
  unassignProgrammeTrainer,
} from "@ncct/api-client";
import { PROGRAMME_MODES } from "@ncct/constants";
import type {
  AdminUserRow,
  Institution,
  NominationDecision,
  NominationWithTrainee,
  Programme,
  ProgrammeMode,
  ProgrammeTrainerRow,
  Skill,
  TimetableSession,
} from "@ncct/shared-types";
import { useEffect, useState } from "react";
import { useLocale, type Locale } from "./i18n/LocaleContext.js";
import { SkillPicker } from "./SkillPicker.js";

interface AdminProgrammeManagerProps {
  accessToken: string;
  // Trainers can browse programmes and manage their own timetable sessions
  // here (direct user request — they had no way to schedule a session slot
  // at all), but programme creation and nomination approval stay admin-only,
  // per PRD's role table; skill-taxonomy tagging is likewise left admin-only
  // as a judgment call, since it's a P1 acquisition-source config PRD never
  // assigns to trainer either.
  role: "admin" | "trainer";
}

interface AdminProgrammeManagerText {
  heading: string;
  subheading: string;
  newProgramme: string;
  searchPlaceholder: string;
  noProgrammesFound: string;
  mode: Record<string, string>;
  flexibleDate: string;
  seats: (count: number) => string;
  openCapacity: string;
  active: string;
  noDescription: string;
  institution: string;
  independentCentral: string;
  dates: string;
  ongoing: string;
  selfPaced: string;
  nominationsLabel: string;
  nominationsSummary: (approved: number, pending: number, total: number) => string;
  nominationsHeading: (count: number) => string;
  seatsFilled: (approved: number, capacity: number) => string;
  seatsFull: string;
  noNominationsYet: string;
  unnamedTrainee: string;
  nominatedOn: (date: string) => string;
  decidedOn: (date: string) => string;
  approve: string;
  waitlist: string;
  rejectTitle: string;
  timetableHeading: (count: number) => string;
  cancel: string;
  addSession: string;
  newTimetableSession: string;
  sessionTitleLabel: string;
  sessionTitlePlaceholder: string;
  startsAt: string;
  endsAt: string;
  locationLabel: string;
  locationPlaceholder: string;
  saving: string;
  saveSession: string;
  noSessionsYet: string;
  scheduledSessionFallback: string;
  sessionUuidLabel: string;
  copySessionUuidTitle: string;
  copySessionUuidAria: (code: string) => string;
  copied: string;
  copy: string;
  copyFailedError: string;
  skillsGranted: (count: number) => string;
  saveSkills: string;
  skillsGrantedBody: string;
  newSkillPlaceholder: string;
  addToTaxonomy: string;
  noProgrammeSelected: string;
  noProgrammeSelectedBody: string;
  createNewProgramme: string;
  programmeTitleLabel: string;
  programmeTitlePlaceholder: string;
  institutionLabel: string;
  selectInstitution: string;
  modeLabel: string;
  capacity: string;
  capacityPlaceholder: string;
  startDate: string;
  endDate: string;
  targetAudience: string;
  targetAudiencePlaceholder: string;
  description: string;
  descriptionPlaceholder: string;
  creating: string;
  createProgramme: string;
  status: Record<string, string>;
  assignedTrainers: (count: number) => string;
  assignedTrainersBody: string;
  noTrainersAssigned: string;
  selectTrainerToAssign: string;
  assignTrainer: string;
  unassignTrainer: string;
  assigning: string;
}

const content: Record<Locale, AdminProgrammeManagerText> = {
  en: {
    heading: "Programme Management",
    subheading: "Administer training programmes and participant nominations.",
    newProgramme: "New Programme",
    searchPlaceholder: "Search programmes...",
    noProgrammesFound: "No programmes found.",
    mode: { online: "Online", hybrid: "Hybrid", offline: "Offline" },
    flexibleDate: "Flexible date",
    seats: (count) => `${count} seats`,
    openCapacity: "Open",
    active: "Active",
    noDescription: "No description provided.",
    institution: "Institution",
    independentCentral: "Independent / Central",
    dates: "Dates",
    ongoing: "Ongoing",
    selfPaced: "Self-paced",
    nominationsLabel: "Nominations",
    nominationsSummary: (approved, pending, total) =>
      `${approved} Approved${pending > 0 ? ` · ${pending} Pending` : ""} / ${total} Total`,
    nominationsHeading: (count) => `Nominations (${count})`,
    seatsFilled: (approved, capacity) => `${approved} of ${capacity} seats filled`,
    seatsFull: "Programme is at capacity — approving more will exceed it",
    noNominationsYet: "No nominations submitted for this programme yet.",
    unnamedTrainee: "Unnamed trainee",
    nominatedOn: (date) => `Nominated: ${date}`,
    decidedOn: (date) => `Decided: ${date}`,
    approve: "Approve",
    waitlist: "Waitlist",
    rejectTitle: "Reject nomination",
    timetableHeading: (count) => `Timetable (${count} sessions)`,
    cancel: "Cancel",
    addSession: "Add Session",
    newTimetableSession: "New Timetable Session",
    sessionTitleLabel: "Session Title",
    sessionTitlePlaceholder: "e.g. Introduction to Cooperative Governance",
    startsAt: "Starts At *",
    endsAt: "Ends At *",
    locationLabel: "Location",
    locationPlaceholder: "e.g. Room 204 or a video-call link",
    saving: "Saving...",
    saveSession: "Save Session",
    noSessionsYet: "No timetable sessions scheduled yet.",
    scheduledSessionFallback: "Scheduled Session",
    sessionUuidLabel: "Session Code:",
    copySessionUuidTitle: "Copy session code",
    copySessionUuidAria: (code) => `Copy session code ${code}`,
    copied: "Copied",
    copy: "Copy",
    copyFailedError: "Could not copy the session UUID. Please select and copy it manually.",
    skillsGranted: (count) => `Skills Granted (${count})`,
    saveSkills: "Save Skills",
    skillsGrantedBody:
      "A trainee who earns a certificate under this programme is read as having acquired every skill tagged here — this is what the Skill-Gap Check compares a job's required skills against.",
    newSkillPlaceholder: "New skill, e.g. Bookkeeping",
    addToTaxonomy: "Add to Taxonomy",
    noProgrammeSelected: "No Programme Selected",
    noProgrammeSelectedBody:
      "Select a programme from the list on the left to review nominations, timetable schedules, and participant details.",
    createNewProgramme: "Create New Programme",
    programmeTitleLabel: "Programme Title *",
    programmeTitlePlaceholder: "e.g. Sustainable Agri-Cooperative Management",
    institutionLabel: "Institution *",
    selectInstitution: "Select Institution...",
    modeLabel: "Mode *",
    capacity: "Capacity",
    capacityPlaceholder: "e.g. 30",
    startDate: "Start Date",
    endDate: "End Date",
    targetAudience: "Target Audience",
    targetAudiencePlaceholder: "e.g. Rural youth, cooperative society secretaries",
    description: "Description",
    descriptionPlaceholder: "Detailed course description, prerequisites, and learning outcomes...",
    creating: "Creating...",
    createProgramme: "Create Programme",
    status: { pending: "Pending", approved: "Approved", waitlisted: "Waitlisted", rejected: "Rejected" },
    assignedTrainers: (count) => `Assigned Trainers (${count})`,
    assignedTrainersBody:
      "Only trainers assigned here can manage this programme's courses, content, and attendance.",
    noTrainersAssigned: "No trainers assigned yet — this programme has no faculty who can manage it.",
    selectTrainerToAssign: "Select a trainer to assign...",
    assignTrainer: "Assign",
    unassignTrainer: "Unassign",
    assigning: "Assigning...",
  },
  hi: {
    heading: "कार्यक्रम प्रबंधन",
    subheading: "प्रशिक्षण कार्यक्रमों और प्रतिभागी नामांकनों का प्रबंधन करें।",
    newProgramme: "नया कार्यक्रम",
    searchPlaceholder: "कार्यक्रम खोजें...",
    noProgrammesFound: "कोई कार्यक्रम नहीं मिला।",
    mode: { online: "ऑनलाइन", hybrid: "हाइब्रिड", offline: "ऑफ़लाइन" },
    flexibleDate: "लचीली तिथि",
    seats: (count) => `${count} सीटें`,
    openCapacity: "खुला",
    active: "सक्रिय",
    noDescription: "कोई विवरण उपलब्ध नहीं है।",
    institution: "संस्थान",
    independentCentral: "स्वतंत्र / केंद्रीय",
    dates: "तिथियां",
    ongoing: "जारी",
    selfPaced: "स्व-गति",
    nominationsLabel: "नामांकन",
    nominationsSummary: (approved, pending, total) =>
      `${approved} स्वीकृत${pending > 0 ? ` · ${pending} लंबित` : ""} / कुल ${total}`,
    nominationsHeading: (count) => `नामांकन (${count})`,
    seatsFilled: (approved, capacity) => `${capacity} में से ${approved} सीटें भरी गईं`,
    seatsFull: "कार्यक्रम पूर्ण क्षमता पर है — अधिक स्वीकृत करने से यह क्षमता से अधिक हो जाएगा",
    noNominationsYet: "इस कार्यक्रम के लिए अभी तक कोई नामांकन जमा नहीं किया गया है।",
    unnamedTrainee: "अनाम प्रशिक्षणार्थी",
    nominatedOn: (date) => `नामांकित: ${date}`,
    decidedOn: (date) => `निर्णय: ${date}`,
    approve: "स्वीकृत करें",
    waitlist: "प्रतीक्षा सूची में डालें",
    rejectTitle: "नामांकन अस्वीकार करें",
    timetableHeading: (count) => `समय-सारणी (${count} सत्र)`,
    cancel: "रद्द करें",
    addSession: "सत्र जोड़ें",
    newTimetableSession: "नया समय-सारणी सत्र",
    sessionTitleLabel: "सत्र शीर्षक",
    sessionTitlePlaceholder: "उदा. सहकारी शासन का परिचय",
    startsAt: "प्रारंभ समय *",
    endsAt: "समाप्ति समय *",
    locationLabel: "स्थान",
    locationPlaceholder: "उदा. कक्ष 204 या वीडियो-कॉल लिंक",
    saving: "सहेजा जा रहा है...",
    saveSession: "सत्र सहेजें",
    noSessionsYet: "अभी तक कोई समय-सारणी सत्र निर्धारित नहीं है।",
    scheduledSessionFallback: "निर्धारित सत्र",
    sessionUuidLabel: "सत्र कोड:",
    copySessionUuidTitle: "सत्र कोड कॉपी करें",
    copySessionUuidAria: (code) => `सत्र कोड ${code} कॉपी करें`,
    copied: "कॉपी किया गया",
    copy: "कॉपी करें",
    copyFailedError: "सत्र UUID कॉपी नहीं हो सका। कृपया इसे मैन्युअल रूप से चुनें और कॉपी करें।",
    skillsGranted: (count) => `प्रदत्त कौशल (${count})`,
    saveSkills: "कौशल सहेजें",
    skillsGrantedBody:
      "जो प्रशिक्षणार्थी इस कार्यक्रम के तहत प्रमाणपत्र अर्जित करता है, उसे यहां टैग किए गए हर कौशल को अर्जित माना जाता है — कौशल-अंतर जांच किसी नौकरी के आवश्यक कौशलों की तुलना इसी से करती है।",
    newSkillPlaceholder: "नया कौशल, उदा. बहीखाता",
    addToTaxonomy: "वर्गीकरण में जोड़ें",
    noProgrammeSelected: "कोई कार्यक्रम चयनित नहीं",
    noProgrammeSelectedBody:
      "नामांकन, समय-सारणी और प्रतिभागी विवरण की समीक्षा करने के लिए बाईं ओर सूची से एक कार्यक्रम चुनें।",
    createNewProgramme: "नया कार्यक्रम बनाएं",
    programmeTitleLabel: "कार्यक्रम शीर्षक *",
    programmeTitlePlaceholder: "उदा. सतत कृषि-सहकारी प्रबंधन",
    institutionLabel: "संस्थान *",
    selectInstitution: "संस्थान चुनें...",
    modeLabel: "मोड *",
    capacity: "क्षमता",
    capacityPlaceholder: "उदा. 30",
    startDate: "प्रारंभ तिथि",
    endDate: "समाप्ति तिथि",
    targetAudience: "लक्षित दर्शक",
    targetAudiencePlaceholder: "उदा. ग्रामीण युवा, सहकारी समिति सचिव",
    description: "विवरण",
    descriptionPlaceholder: "विस्तृत पाठ्यक्रम विवरण, पूर्वापेक्षाएं, और सीखने के परिणाम...",
    creating: "बनाया जा रहा है...",
    createProgramme: "कार्यक्रम बनाएं",
    status: { pending: "लंबित", approved: "स्वीकृत", waitlisted: "प्रतीक्षा सूची में", rejected: "अस्वीकृत" },
    assignedTrainers: (count) => `नियुक्त प्रशिक्षक (${count})`,
    assignedTrainersBody:
      "केवल यहां नियुक्त प्रशिक्षक ही इस कार्यक्रम के पाठ्यक्रम, सामग्री और उपस्थिति का प्रबंधन कर सकते हैं।",
    noTrainersAssigned: "अभी तक कोई प्रशिक्षक नियुक्त नहीं — इस कार्यक्रम का प्रबंधन करने वाला कोई संकाय सदस्य नहीं है।",
    selectTrainerToAssign: "नियुक्त करने के लिए एक प्रशिक्षक चुनें...",
    assignTrainer: "नियुक्त करें",
    unassignTrainer: "हटाएं",
    assigning: "नियुक्त किया जा रहा है...",
  },
};

export function AdminProgrammeManager({ accessToken, role }: AdminProgrammeManagerProps) {
  const isAdmin = role === "admin";
  const { locale } = useLocale();
  const t = content[locale];
  const dateLocale = locale === "hi" ? "hi-IN" : undefined;
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [programmes, setProgrammes] = useState<Programme[]>([]);
  const [selectedProgrammeId, setSelectedProgrammeId] = useState<string | null>(null);
  const [nominations, setNominations] = useState<NominationWithTrainee[]>([]);
  const [sessions, setSessions] = useState<TimetableSession[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showSessionForm, setShowSessionForm] = useState(false);
  const [copiedSessionId, setCopiedSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // P1 Skill-Gap Analysis (DECISIONS.md #26): skills a trainee is read as
  // "acquiring" by earning a certificate under this programme — the
  // acquisition source getSkillGap (apps/api/src/skillGapService.ts) reads
  // from.
  const [skills, setSkills] = useState<Skill[]>([]);
  const [programmeSkillIds, setProgrammeSkillIds] = useState<Set<string>>(new Set());
  const [newSkillName, setNewSkillName] = useState("");
  const [savingSkills, setSavingSkills] = useState(false);

  // Programme-trainer assignment (docs/DECISIONS.md #52) — admin-only, same
  // gating as the skills-taxonomy section below.
  const [trainerProfiles, setTrainerProfiles] = useState<AdminUserRow[]>([]);
  const [assignedTrainers, setAssignedTrainers] = useState<ProgrammeTrainerRow[]>([]);
  const [trainerToAssign, setTrainerToAssign] = useState("");
  const [assigningTrainer, setAssigningTrainer] = useState(false);

  useEffect(() => {
    getInstitutions(accessToken)
      .then(setInstitutions)
      .catch((err: Error) => setError(err.message));
    getProgrammes(accessToken)
      .then((progs) => {
        setProgrammes(progs);
        if (progs.length > 0 && !selectedProgrammeId) {
          void selectProgramme(progs[0].id);
        }
      })
      .catch((err: Error) => setError(err.message));
    getSkills(accessToken)
      .then(setSkills)
      .catch((err: Error) => setError(err.message));
    if (isAdmin) {
      listUsers(accessToken, { role: "trainer" })
        .then(setTrainerProfiles)
        .catch((err: Error) => setError(err.message));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  async function refreshProgrammes() {
    const list = await getProgrammes(accessToken);
    setProgrammes(list);
    return list;
  }

  async function selectProgramme(programmeId: string) {
    setSelectedProgrammeId(programmeId);
    setError(null);
    try {
      const [noms, sess, progSkills] = await Promise.all([
        getProgrammeNominations(accessToken, programmeId),
        getTimetableSessions(accessToken, programmeId),
        getProgrammeSkills(accessToken, programmeId),
      ]);
      setNominations(noms);
      setSessions(sess);
      setProgrammeSkillIds(new Set(progSkills.map((s) => s.id)));
      if (isAdmin) {
        setAssignedTrainers(await getProgrammeTrainers(accessToken, programmeId));
      }
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleAssignTrainer() {
    if (!selectedProgrammeId || !trainerToAssign) return;
    setError(null);
    setAssigningTrainer(true);
    try {
      await assignProgrammeTrainer(accessToken, selectedProgrammeId, trainerToAssign);
      setAssignedTrainers(await getProgrammeTrainers(accessToken, selectedProgrammeId));
      setTrainerToAssign("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setAssigningTrainer(false);
    }
  }

  async function handleUnassignTrainer(trainerId: string) {
    if (!selectedProgrammeId) return;
    setError(null);
    try {
      await unassignProgrammeTrainer(accessToken, selectedProgrammeId, trainerId);
      setAssignedTrainers((prev) => prev.filter((t) => t.trainer_id !== trainerId));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  function toggleProgrammeSkill(skillId: string) {
    setProgrammeSkillIds((prev) => {
      const next = new Set(prev);
      if (next.has(skillId)) next.delete(skillId);
      else next.add(skillId);
      return next;
    });
  }

  async function handleSaveProgrammeSkills() {
    if (!selectedProgrammeId) return;
    setError(null);
    setSavingSkills(true);
    try {
      await setProgrammeSkills(accessToken, selectedProgrammeId, [...programmeSkillIds]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSavingSkills(false);
    }
  }

  async function handleCreateSkill() {
    const name = newSkillName.trim();
    if (!name) return;
    setError(null);
    try {
      const skill = await createSkill(accessToken, { name });
      setSkills((prev) => [...prev, skill].sort((a, b) => a.name.localeCompare(b.name)));
      setProgrammeSkillIds((prev) => new Set(prev).add(skill.id));
      setNewSkillName("");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleCreateProgramme(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const capacityRaw = String(form.get("capacity") ?? "");
    setError(null);
    setBusy(true);
    try {
      const created = await createProgramme(accessToken, {
        institution_id: String(form.get("institution_id") ?? ""),
        title: String(form.get("title") ?? "").trim(),
        mode: String(form.get("mode") ?? "online") as ProgrammeMode,
        description: String(form.get("description") ?? "").trim() || undefined,
        target_audience: String(form.get("target_audience") ?? "").trim() || undefined,
        capacity: capacityRaw ? Number(capacityRaw) : undefined,
        start_date: String(form.get("start_date") ?? "") || undefined,
        end_date: String(form.get("end_date") ?? "") || undefined,
      });
      setShowCreateModal(false);
      const updatedList = await refreshProgrammes();
      await selectProgramme(created.id || (updatedList[0]?.id ?? ""));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDecide(nominationId: string, status: NominationDecision) {
    if (!selectedProgrammeId) return;
    setError(null);
    try {
      await decideNomination(accessToken, selectedProgrammeId, nominationId, status);
      setNominations(await getProgrammeNominations(accessToken, selectedProgrammeId));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleCreateSession(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selectedProgrammeId) return;
    const form = new FormData(e.currentTarget);
    const formEl = e.currentTarget;
    setError(null);
    setBusy(true);
    try {
      const startsAt = new Date(String(form.get("starts_at") ?? "")).toISOString();
      const endsAt = new Date(String(form.get("ends_at") ?? "")).toISOString();
      await createTimetableSession(accessToken, selectedProgrammeId, {
        title: String(form.get("title") ?? "").trim() || undefined,
        starts_at: startsAt,
        ends_at: endsAt,
        location: String(form.get("location") ?? "").trim() || undefined,
      });
      formEl.reset();
      setShowSessionForm(false);
      setSessions(await getTimetableSessions(accessToken, selectedProgrammeId));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleCopySessionId(sessionId: string) {
    try {
      await navigator.clipboard.writeText(sessionId);
      setCopiedSessionId(sessionId);
      window.setTimeout(() => setCopiedSessionId(null), 2000);
    } catch {
      setError(t.copyFailedError);
    }
  }

  const selectedProg = programmes.find((p) => p.id === selectedProgrammeId);
  const selectedInst = institutions.find((i) => i.id === selectedProg?.institution_id);

  const filteredProgrammes = programmes.filter((p) =>
    p.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const pendingNominations = nominations.filter((n) => n.status === "pending");
  const approvedNominations = nominations.filter((n) => n.status === "approved");
  const modeLabel = (mode: string) => t.mode[mode] ?? mode;
  const statusLabel = (status: string) => t.status[status] ?? status;

  return (
    <div className="flex flex-col h-full w-full overflow-hidden text-left gap-4">
      {/* Header */}
      <header className="bg-white rounded-2xl border border-border-slate px-6 py-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shrink-0 shadow-xs">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#FE932C]" />
            <span className="text-xs uppercase tracking-wider text-[#D97706] font-bold">
              Administration • Programme & Cohort Governance
            </span>
          </div>
          <h1 className="font-display text-2xl lg:text-3xl text-[#00236F] tracking-tight font-extrabold m-0">
            {t.heading}
          </h1>
          <p className="font-body text-xs text-slate-600 mt-1 max-w-3xl">{t.subheading}</p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowCreateModal(true)}
            type="button"
            className="bg-[#FE932C] hover:bg-[#E07D1E] text-white px-5 py-2.5 rounded-xl text-sm font-bold transition-colors flex items-center gap-2 shadow-xs cursor-pointer shrink-0"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            {t.newProgramme}
          </button>
        )}
      </header>

      {error && (
        <div className="p-3 bg-rose-50 text-rose-900 rounded-xl flex items-center gap-2 border border-rose-200 text-xs font-medium">
          <span className="material-symbols-outlined text-rose-600 shrink-0">error</span>
          <p>{error}</p>
        </div>
      )}

      {/* Master-Detail Dual-Pane Layout */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden rounded-2xl border border-border-slate bg-white shadow-xs">
        {/* Master List (Left Column) */}
        <div className="w-full md:w-80 lg:w-96 bg-paper border-r border-border-slate/70 flex flex-col overflow-hidden shrink-0">
          {/* Search Box */}
          <div className="p-4 border-b border-border-slate/70 bg-paper shrink-0">
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-[20px]">
                search
              </span>
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t.searchPlaceholder}
                className="w-full bg-paper-light border border-border-slate rounded-xl pl-10 pr-4 py-2.5 text-xs text-ink focus:outline-none focus:bg-white focus:border-[#00236F] focus:ring-1 focus:ring-[#00236F]/20 transition-all"
                type="text"
              />
            </div>
          </div>

          {/* Programmes List */}
          <div className="flex-1 overflow-y-auto">
            {filteredProgrammes.length === 0 ? (
              <div className="p-6 text-center text-slate-500 text-xs">{t.noProgrammesFound}</div>
            ) : (
              filteredProgrammes.map((p) => {
                const isSelected = p.id === selectedProgrammeId;
                return (
                  <div
                    key={p.id}
                    onClick={() => void selectProgramme(p.id)}
                    className={`p-4 border-b border-border-slate/40 cursor-pointer transition-all flex flex-col gap-2 relative ${
                      isSelected
                        ? "bg-white border-l-4 border-l-[#FE932C] shadow-xs"
                        : "hover:bg-white/60"
                    }`}
                  >
                    <div className="flex justify-between items-start gap-2">
                      <h3 className="font-bold text-sm text-[#00236F] m-0 line-clamp-1">
                        {p.title}
                      </h3>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] uppercase font-bold tracking-wider shrink-0 border ${
                          p.mode === "online"
                            ? "bg-blue-50 text-blue-800 border-blue-200"
                            : p.mode === "hybrid"
                            ? "bg-amber-50 text-amber-800 border-amber-200"
                            : "bg-emerald-50 text-emerald-800 border-emerald-200"
                        }`}
                      >
                        {modeLabel(p.mode)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-xs text-slate-500 mt-0.5">
                      <span className="font-metric-mono text-[11px]">
                        {p.start_date ? new Date(p.start_date).toLocaleDateString(dateLocale) : t.flexibleDate}
                      </span>
                      <div className="flex items-center gap-1 font-metric-mono font-medium text-[11px]">
                        <span className="material-symbols-outlined text-[14px]">group</span>
                        <span>{p.capacity ? t.seats(p.capacity) : t.openCapacity}</span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Detail Section (Right Column) */}
        <div className="flex-1 flex flex-col overflow-hidden bg-white">
          {selectedProg ? (
            <>
              {/* Detail Header */}
              <div className="p-6 border-b border-border-slate/60 bg-paper-light shrink-0">
                <div className="flex flex-col md:flex-row justify-between items-start gap-4">
                  <div>
                    <div className="flex items-center gap-3 mb-2 flex-wrap">
                      <h2 className="font-display text-xl lg:text-2xl text-[#00236F] font-bold m-0">
                        {selectedProg.title}
                      </h2>
                      <span className="bg-emerald-50 text-emerald-700 px-3 py-0.5 rounded-full text-xs border border-emerald-200 font-bold uppercase tracking-wider">
                        {t.active}
                      </span>
                    </div>
                    <p className="font-body text-xs text-slate-600 max-w-3xl leading-relaxed">
                      {selectedProg.description || t.noDescription}
                    </p>
                  </div>
                </div>

                {/* Stats / Meta Info Bar */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-5 p-4 bg-white rounded-xl border border-border-slate shadow-xs">
                  <div>
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">
                      {t.institution}
                    </p>
                    <p className="text-xs text-[#00236F] font-bold mt-1 truncate">
                      {selectedInst?.name ?? t.independentCentral}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">
                      {t.dates}
                    </p>
                    <p className="font-metric-mono text-xs text-slate-700 font-medium mt-1">
                      {selectedProg.start_date
                        ? `${new Date(selectedProg.start_date).toLocaleDateString(dateLocale)} - ${
                            selectedProg.end_date
                              ? new Date(selectedProg.end_date).toLocaleDateString(dateLocale)
                              : t.ongoing
                          }`
                        : t.selfPaced}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">
                      {t.nominationsLabel}
                    </p>
                    <p className="font-metric-mono text-xs text-slate-700 font-medium mt-1">
                      {t.nominationsSummary(approvedNominations.length, pendingNominations.length, nominations.length)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Scrollable Content */}
              <div className="flex-1 overflow-y-auto p-6 space-y-8 bg-white">
                {/* Nominations Section */}
                <div>
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="font-display text-base text-[#00236F] font-bold m-0">
                      {t.nominationsHeading(nominations.length)}
                    </h3>
                    {selectedProg.capacity != null && (
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                          approvedNominations.length >= selectedProg.capacity
                            ? "bg-rose-50 text-rose-800 border-rose-200"
                            : "bg-blue-50 text-blue-800 border-blue-200"
                        }`}
                        title={
                          approvedNominations.length >= selectedProg.capacity ? t.seatsFull : undefined
                        }
                      >
                        {t.seatsFilled(approvedNominations.length, selectedProg.capacity)}
                      </span>
                    )}
                  </div>

                  {nominations.length === 0 ? (
                    <div className="p-8 text-center bg-paper-light rounded-xl border border-dashed border-border-slate text-slate-500">
                      <span className="material-symbols-outlined text-[36px] text-slate-400 mb-1">person_off</span>
                      <p className="text-xs">{t.noNominationsYet}</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                      {nominations.map((nom) => {
                        const traineeName = nom.trainee_name?.trim() || t.unnamedTrainee;
                        const initials = traineeName.slice(0, 2).toUpperCase();
                        const supportingInfo = [nom.trainee_phone, nom.trainee_cooperative_affiliation]
                          .filter(Boolean)
                          .join(" · ");

                        return (
                          <div
                            key={nom.id}
                            className="bg-paper-light rounded-xl p-4 border border-border-slate shadow-xs flex flex-col justify-between gap-3.5 hover:border-[#FE932C]/40 transition-all"
                          >
                            <div className="flex justify-between items-start gap-2">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-[#00236F] text-white flex items-center justify-center font-bold text-xs shadow-xs shrink-0">
                                  {initials}
                                </div>
                                <div>
                                  <h4 className="font-bold text-xs text-[#00236F] m-0">
                                    {traineeName}
                                  </h4>
                                  {supportingInfo && (
                                    <p className="font-metric-mono text-[11px] text-slate-600 m-0 mt-0.5">
                                      {supportingInfo}
                                    </p>
                                  )}
                                  <p className="font-metric-mono text-[11px] text-slate-500 m-0 mt-0.5">
                                    {t.nominatedOn(new Date(nom.nominated_at).toLocaleDateString(dateLocale))}
                                    {nom.decided_at &&
                                      ` · ${t.decidedOn(new Date(nom.decided_at).toLocaleDateString(dateLocale))}`}
                                  </p>
                                </div>
                              </div>
                              <span
                                className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                  nom.status === "approved"
                                    ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                                    : nom.status === "waitlisted"
                                    ? "bg-amber-50 text-amber-800 border border-amber-200"
                                    : nom.status === "rejected"
                                    ? "bg-rose-50 text-rose-800 border border-rose-200"
                                    : "bg-blue-50 text-blue-800 border border-blue-200"
                                }`}
                              >
                                {statusLabel(nom.status)}
                              </span>
                            </div>

                            {/* Decision Buttons — approval stays admin-only per PRD's role table */}
                            {isAdmin && (
                              <div className="flex gap-2 pt-2 border-t border-border-slate/50">
                                <button
                                  type="button"
                                  onClick={() => void handleDecide(nom.id, "approved")}
                                  disabled={nom.status === "approved"}
                                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-40 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                                >
                                  {t.approve}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void handleDecide(nom.id, "waitlisted")}
                                  disabled={nom.status === "waitlisted"}
                                  className="flex-1 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 disabled:opacity-40 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                                >
                                  {t.waitlist}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void handleDecide(nom.id, "rejected")}
                                  disabled={nom.status === "rejected"}
                                  title={t.rejectTitle}
                                  className="w-8 h-8 flex items-center justify-center bg-rose-50 hover:bg-rose-100 text-rose-700 disabled:opacity-40 rounded-lg transition-colors border border-rose-200 cursor-pointer"
                                >
                                  <span className="material-symbols-outlined text-[16px]">close</span>
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Timetable Section */}
                <div>
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="font-display text-base text-[#00236F] font-bold m-0">
                      {t.timetableHeading(sessions.length)}
                    </h3>
                    <button
                      type="button"
                      onClick={() => setShowSessionForm(!showSessionForm)}
                      className="flex items-center gap-1 text-[#D97706] hover:text-[#B45309] text-xs font-bold cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[16px]">
                        {showSessionForm ? "close" : "add"}
                      </span>
                      {showSessionForm ? t.cancel : t.addSession}
                    </button>
                  </div>

                  {/* Create Session Form */}
                  {showSessionForm && (
                    <form
                      onSubmit={(e) => void handleCreateSession(e)}
                      className="mb-6 bg-paper p-5 rounded-2xl border border-border-slate shadow-xs space-y-4"
                    >
                      <h4 className="font-display text-sm font-bold text-[#00236F] m-0">{t.newTimetableSession}</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">
                            {t.sessionTitleLabel}
                          </label>
                          <input
                            name="title"
                            placeholder={t.sessionTitlePlaceholder}
                            className="w-full bg-white border border-border-slate rounded-xl px-3 py-2 text-xs text-ink outline-none focus:border-[#00236F]"
                            type="text"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">
                            {t.startsAt}
                          </label>
                          <input
                            name="starts_at"
                            required
                            className="w-full bg-white border border-border-slate rounded-xl px-3 py-2 text-xs text-ink outline-none focus:border-[#00236F]"
                            type="datetime-local"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">
                            {t.endsAt}
                          </label>
                          <input
                            name="ends_at"
                            required
                            className="w-full bg-white border border-border-slate rounded-xl px-3 py-2 text-xs text-ink outline-none focus:border-[#00236F]"
                            type="datetime-local"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">
                            {t.locationLabel}
                          </label>
                          <input
                            name="location"
                            placeholder={t.locationPlaceholder}
                            className="w-full bg-white border border-border-slate rounded-xl px-3 py-2 text-xs text-ink outline-none focus:border-[#00236F]"
                            type="text"
                          />
                        </div>
                      </div>
                      <div className="flex justify-end gap-2 pt-2">
                        <button
                          type="button"
                          onClick={() => setShowSessionForm(false)}
                          className="px-4 py-2 rounded-xl text-xs font-medium border border-border-slate text-slate-600 hover:bg-slate-100"
                        >
                          {t.cancel}
                        </button>
                        <button
                          disabled={busy}
                          type="submit"
                          className="px-5 py-2 rounded-xl text-xs font-bold bg-[#FE932C] hover:bg-[#E07D1E] text-white shadow-xs cursor-pointer"
                        >
                          {busy ? t.saving : t.saveSession}
                        </button>
                      </div>
                    </form>
                  )}

                  {/* Sessions List */}
                  {sessions.length === 0 ? (
                    <p className="text-xs text-slate-500">{t.noSessionsYet}</p>
                  ) : (
                    <div className="space-y-3">
                      {sessions.map((sess) => {
                        const start = new Date(sess.starts_at);
                        const end = new Date(sess.ends_at);
                        const month = start.toLocaleDateString(dateLocale, { month: "short" });
                        const day = String(start.getDate()).padStart(2, "0");
                        const timeStr = `${start.toLocaleTimeString(dateLocale, {
                          hour: "2-digit",
                          minute: "2-digit",
                        })} - ${end.toLocaleTimeString(dateLocale, {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}`;

                        return (
                          <div
                            key={sess.id}
                            className="flex items-center gap-4 p-4 bg-paper-light rounded-xl border border-border-slate hover:bg-white transition-colors shadow-xs"
                          >
                            <div className="bg-[#00236F] text-white p-2.5 rounded-xl text-center min-w-[64px] shadow-xs">
                              <div className="text-[10px] uppercase font-bold tracking-wider">
                                {month}
                              </div>
                              <div className="font-metric-mono text-base font-bold">
                                {day}
                              </div>
                            </div>
                            <div className="flex-1">
                              <h4 className="font-bold text-xs text-[#00236F] m-0">
                                {sess.title || t.scheduledSessionFallback}
                              </h4>
                              <p className="text-xs text-slate-500 m-0 flex items-center gap-1.5 mt-0.5">
                                <span className="material-symbols-outlined text-[14px]">schedule</span>
                                <span className="font-metric-mono text-[11px]">{timeStr}</span>
                                {sess.location && <span className="ml-2 font-medium">• {sess.location}</span>}
                              </p>
                              <div className="flex flex-wrap items-center gap-2 mt-2">
                                <span className="text-[11px] text-slate-500 font-medium">{t.sessionUuidLabel}</span>
                                <code className="font-metric-mono text-xs text-[#00236F] font-bold bg-white px-2 py-0.5 rounded border border-border-slate break-all select-all">
                                  {sess.check_in_code}
                                </code>
                                <button
                                  type="button"
                                  onClick={() => void handleCopySessionId(sess.check_in_code)}
                                  title={t.copySessionUuidTitle}
                                  aria-label={t.copySessionUuidAria(sess.check_in_code)}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-border-slate text-[#00236F] hover:bg-slate-100 text-[11px] font-semibold cursor-pointer"
                                >
                                  <span className="material-symbols-outlined text-[14px]">
                                    {copiedSessionId === sess.check_in_code ? "check" : "content_copy"}
                                  </span>
                                  {copiedSessionId === sess.check_in_code ? t.copied : t.copy}
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Assigned Trainers Section (DECISIONS.md #52) — admin-only: which
                    trainers can manage this programme's courses, content, and attendance. */}
                {isAdmin && (
                  <div>
                    <h3 className="font-display text-base text-[#00236F] font-bold m-0 mb-1">
                      {t.assignedTrainers(assignedTrainers.length)}
                    </h3>
                    <p className="text-xs text-slate-600 mb-3">{t.assignedTrainersBody}</p>

                    {assignedTrainers.length === 0 ? (
                      <p className="text-xs text-slate-500 mb-3">{t.noTrainersAssigned}</p>
                    ) : (
                      <div className="flex flex-wrap gap-2 mb-3">
                        {assignedTrainers.map((tr) => (
                          <span
                            key={tr.trainer_id}
                            className="inline-flex items-center gap-2 bg-paper-light border border-border-slate rounded-full pl-3 pr-1.5 py-1 text-xs font-medium text-[#00236F]"
                          >
                            {tr.full_name ?? tr.trainer_id.slice(0, 8)}
                            <button
                              type="button"
                              onClick={() => void handleUnassignTrainer(tr.trainer_id)}
                              title={t.unassignTrainer}
                              aria-label={`${t.unassignTrainer}: ${tr.full_name ?? tr.trainer_id}`}
                              className="w-5 h-5 flex items-center justify-center rounded-full hover:bg-rose-100 text-rose-600 cursor-pointer"
                            >
                              <span className="material-symbols-outlined text-[14px]">close</span>
                            </button>
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="flex gap-2">
                      <select
                        value={trainerToAssign}
                        onChange={(e) => setTrainerToAssign(e.target.value)}
                        className="flex-1 h-10 bg-paper-light border border-border-slate rounded-xl px-3.5 text-xs text-ink focus:bg-white focus:border-[#00236F] outline-none cursor-pointer"
                      >
                        <option value="">{t.selectTrainerToAssign}</option>
                        {trainerProfiles
                          .filter((tp) => !assignedTrainers.some((at) => at.trainer_id === tp.id))
                          .map((tp) => (
                            <option key={tp.id} value={tp.id}>
                              {tp.full_name ?? tp.email ?? tp.id}
                            </option>
                          ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => void handleAssignTrainer()}
                        disabled={!trainerToAssign || assigningTrainer}
                        className="px-4 h-10 bg-paper-light border border-border-slate text-[#00236F] font-bold rounded-xl text-xs hover:bg-slate-100 disabled:opacity-50 cursor-pointer"
                      >
                        {assigningTrainer ? t.assigning : t.assignTrainer}
                      </button>
                    </div>
                  </div>
                )}

                {/* Skills Granted Section (P1 Skill-Gap Analysis, DECISIONS.md #26) — admin-only config */}
                {isAdmin && (
                  <div>
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="font-display text-base text-[#00236F] font-bold m-0">
                        {t.skillsGranted(programmeSkillIds.size)}
                      </h3>
                      <button
                        type="button"
                        onClick={() => void handleSaveProgrammeSkills()}
                        disabled={savingSkills}
                        className="px-4 py-2 rounded-xl text-xs font-bold bg-[#FE932C] hover:bg-[#E07D1E] text-white shadow-xs disabled:opacity-50 cursor-pointer"
                      >
                        {savingSkills ? t.saving : t.saveSkills}
                      </button>
                    </div>
                    <p className="text-xs text-slate-600 mb-3">{t.skillsGrantedBody}</p>
                    <SkillPicker skills={skills} selectedIds={programmeSkillIds} onToggle={toggleProgrammeSkill} />
                    <div className="flex gap-2 mt-3">
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
                        className="flex-1 h-10 bg-paper-light border border-border-slate rounded-xl px-3.5 text-xs text-ink focus:bg-white focus:border-[#00236F] outline-none"
                        type="text"
                      />
                      <button
                        type="button"
                        onClick={() => void handleCreateSkill()}
                        className="px-4 h-10 bg-paper-light border border-border-slate text-[#00236F] font-bold rounded-xl text-xs hover:bg-slate-100 cursor-pointer"
                      >
                        {t.addToTaxonomy}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-400">
              <span className="material-symbols-outlined text-[64px] text-slate-300 mb-4">school</span>
              <h3 className="font-display text-base font-bold text-slate-700 mb-1">{t.noProgrammeSelected}</h3>
              <p className="text-xs text-slate-500 max-w-sm">{t.noProgrammeSelectedBody}</p>
            </div>
          )}
        </div>
      </div>

      {/* Create Programme Modal Overlay */}
      {isAdmin && showCreateModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-border-slate shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden text-left">
            <div className="p-5 border-b border-border-slate/60 flex justify-between items-center bg-paper">
              <h2 className="font-display text-lg text-[#00236F] font-bold m-0">{t.createNewProgramme}</h2>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-200/60 text-slate-500 transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
            <form onSubmit={(e) => void handleCreateProgramme(e)} className="p-6 overflow-y-auto flex-1 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  {t.programmeTitleLabel}
                </label>
                <input
                  name="title"
                  required
                  placeholder={t.programmeTitlePlaceholder}
                  className="w-full bg-paper-light border border-border-slate rounded-xl px-3.5 py-2.5 text-xs text-ink focus:bg-white focus:ring-1 focus:ring-[#00236F]/20 focus:border-[#00236F] outline-none"
                  type="text"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {t.institutionLabel}
                  </label>
                  <select
                    name="institution_id"
                    required
                    className="w-full bg-paper-light border border-border-slate rounded-xl px-3.5 py-2.5 text-xs text-ink focus:bg-white focus:border-[#00236F] outline-none cursor-pointer"
                  >
                    <option value="">{t.selectInstitution}</option>
                    {institutions.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {t.modeLabel}
                  </label>
                  <select
                    name="mode"
                    defaultValue="online"
                    className="w-full bg-paper-light border border-border-slate rounded-xl px-3.5 py-2.5 text-xs text-ink focus:bg-white focus:border-[#00236F] outline-none cursor-pointer"
                  >
                    {PROGRAMME_MODES.map((m) => (
                      <option key={m} value={m}>
                        {modeLabel(m)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">{t.capacity}</label>
                  <input
                    name="capacity"
                    placeholder={t.capacityPlaceholder}
                    type="number"
                    min="1"
                    className="w-full bg-paper-light border border-border-slate rounded-xl px-3.5 py-2.5 text-xs text-ink focus:bg-white focus:border-[#00236F] outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">{t.startDate}</label>
                  <input
                    name="start_date"
                    type="date"
                    className="w-full bg-paper-light border border-border-slate rounded-xl px-3.5 py-2.5 text-xs text-ink focus:bg-white focus:border-[#00236F] outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">{t.endDate}</label>
                  <input
                    name="end_date"
                    type="date"
                    className="w-full bg-paper-light border border-border-slate rounded-xl px-3.5 py-2.5 text-xs text-ink focus:bg-white focus:border-[#00236F] outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  {t.targetAudience}
                </label>
                <input
                  name="target_audience"
                  placeholder={t.targetAudiencePlaceholder}
                  className="w-full bg-paper-light border border-border-slate rounded-xl px-3.5 py-2.5 text-xs text-ink focus:bg-white focus:border-[#00236F] outline-none"
                  type="text"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">{t.description}</label>
                <textarea
                  name="description"
                  rows={3}
                  placeholder={t.descriptionPlaceholder}
                  className="w-full bg-paper-light border border-border-slate rounded-xl p-3 text-xs text-ink focus:bg-white focus:border-[#00236F] outline-none"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-border-slate/60">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold border border-border-slate text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  {t.cancel}
                </button>
                <button
                  disabled={busy}
                  type="submit"
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-[#FE932C] hover:bg-[#E07D1E] text-white shadow-xs cursor-pointer"
                >
                  {busy ? t.creating : t.createProgramme}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
