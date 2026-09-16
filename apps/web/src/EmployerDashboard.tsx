import {
  createJob,
  createSkill,
  getEmployerTrainees,
  getJobInterests,
  getJobs,
  getJobSkills,
  getSkills,
  setJobSkills,
  shortlistTrainee,
} from "@ncct/api-client";
import type { Job, JobInterest, Skill, TraineeSearchResult } from "@ncct/shared-types";
import { useEffect, useState } from "react";
import { useLocale, type Locale } from "./i18n/LocaleContext.js";
import { SkillChips, SkillPicker } from "./SkillPicker.js";

interface EmployerDashboardProps {
  accessToken: string;
}

type InterestRow = JobInterest & { profiles: { full_name: string | null } | null };

interface EmployerDashboardText {
  heading: string;
  subheading: string;
  postOpportunity: string;
  jobTitleLabel: string;
  jobTitlePlaceholder: string;
  locationLabel: string;
  locationPlaceholder: string;
  requiredSkillsLabel: string;
  requiredSkillsPlaceholder: string;
  tagSkillsLabel: string;
  newSkillPlaceholder: string;
  addToTaxonomy: string;
  posting: string;
  activePostings: (count: number) => string;
  noJobsYet: string;
  flexible: string;
  candidateResponses: string;
  forJob: (title: string | undefined) => string;
  candidatesCount: (count: number) => string;
  taggedSkills: string;
  noApplicants: string;
  candidateFallback: (idPrefix: string) => string;
  statusLabel: string;
  searchCertifiedTrainees: string;
  searchSubheading: string;
  searchKeywordPlaceholder: string;
  searchLocationPlaceholder: string;
  searchTrainees: string;
  shortlistCandidate: string;
  status: Record<string, string>;
}

const content: Record<Locale, EmployerDashboardText> = {
  en: {
    heading: "Employer & Placement Exchange",
    subheading: "Post career opportunities, review interested candidates, and search certified rural talent.",
    postOpportunity: "Post Opportunity",
    jobTitleLabel: "Job / Role Title *",
    jobTitlePlaceholder: "e.g. Cooperative Accounts Officer",
    locationLabel: "Location",
    locationPlaceholder: "e.g. Pune, Maharashtra / Remote",
    requiredSkillsLabel: "Required Skills (Comma-separated)",
    requiredSkillsPlaceholder: "e.g. Bookkeeping, Tally, Agronomy",
    tagSkillsLabel: "Tag Skills (for Skill-Gap matching)",
    newSkillPlaceholder: "New skill, e.g. Tally",
    addToTaxonomy: "Add to Taxonomy",
    posting: "Posting...",
    activePostings: (count) => `Active Postings (${count})`,
    noJobsYet: "No jobs posted yet.",
    flexible: "Flexible",
    candidateResponses: "Candidate Responses",
    forJob: (title) => `for "${title}"`,
    candidatesCount: (count) => `${count} Candidates`,
    taggedSkills: "Tagged skills:",
    noApplicants: "No applicants or shortlist entries for this role yet. Search verified trainees below.",
    candidateFallback: (idPrefix) => `Candidate #${idPrefix}`,
    statusLabel: "Status:",
    searchCertifiedTrainees: "Search Certified Trainees",
    searchSubheading: "Explore candidates certified by NCCT / VAMNICOM / RICM cooperative institutions.",
    searchKeywordPlaceholder: "Skill or course keyword...",
    searchLocationPlaceholder: "Location (e.g. Pune)...",
    searchTrainees: "Search Trainees",
    shortlistCandidate: "Shortlist Candidate",
    status: {
      approved: "Approved",
      shortlisted: "Shortlisted",
      pending: "Pending",
      waitlisted: "Waitlisted",
      viewed: "Viewed",
      rejected: "Rejected",
      contacted: "Contacted",
    },
  },
  hi: {
    heading: "नियोक्ता एवं प्लेसमेंट एक्सचेंज",
    subheading: "करियर अवसर पोस्ट करें, रुचि रखने वाले उम्मीदवारों की समीक्षा करें, और प्रमाणित ग्रामीण प्रतिभा खोजें।",
    postOpportunity: "अवसर पोस्ट करें",
    jobTitleLabel: "नौकरी / पद शीर्षक *",
    jobTitlePlaceholder: "उदा. सहकारी लेखा अधिकारी",
    locationLabel: "स्थान",
    locationPlaceholder: "उदा. पुणे, महाराष्ट्र / रिमोट",
    requiredSkillsLabel: "आवश्यक कौशल (अल्पविराम से अलग करें)",
    requiredSkillsPlaceholder: "उदा. बहीखाता, टैली, कृषि विज्ञान",
    tagSkillsLabel: "कौशल टैग करें (कौशल-अंतर मिलान हेतु)",
    newSkillPlaceholder: "नया कौशल, उदा. टैली",
    addToTaxonomy: "वर्गीकरण में जोड़ें",
    posting: "पोस्ट हो रहा है...",
    activePostings: (count) => `सक्रिय पोस्टिंग (${count})`,
    noJobsYet: "अभी तक कोई नौकरी पोस्ट नहीं की गई है।",
    flexible: "लचीला",
    candidateResponses: "उम्मीदवार प्रतिक्रियाएं",
    forJob: (title) => `"${title}" के लिए`,
    candidatesCount: (count) => `${count} उम्मीदवार`,
    taggedSkills: "टैग किए गए कौशल:",
    noApplicants: "इस भूमिका के लिए अभी तक कोई आवेदक या शॉर्टलिस्ट प्रविष्टि नहीं है। नीचे सत्यापित प्रशिक्षणार्थियों को खोजें।",
    candidateFallback: (idPrefix) => `उम्मीदवार #${idPrefix}`,
    statusLabel: "स्थिति:",
    searchCertifiedTrainees: "सत्यापित प्रशिक्षणार्थी खोजें",
    searchSubheading: "NCCT / VAMNICOM / RICM सहकारी संस्थानों द्वारा प्रमाणित उम्मीदवारों को देखें।",
    searchKeywordPlaceholder: "कौशल या पाठ्यक्रम कीवर्ड...",
    searchLocationPlaceholder: "स्थान (उदा. पुणे)...",
    searchTrainees: "प्रशिक्षणार्थी खोजें",
    shortlistCandidate: "उम्मीदवार को शॉर्टलिस्ट करें",
    status: {
      approved: "स्वीकृत",
      shortlisted: "शॉर्टलिस्ट किया गया",
      pending: "लंबित",
      waitlisted: "प्रतीक्षा सूची में",
      viewed: "देखा गया",
      rejected: "अस्वीकृत",
      contacted: "संपर्क किया गया",
    },
  },
};

export function EmployerDashboard({ accessToken }: EmployerDashboardProps) {
  const { locale } = useLocale();
  const t = content[locale];
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [interests, setInterests] = useState<InterestRow[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchLocation, setSearchLocation] = useState("");
  const [results, setResults] = useState<TraineeSearchResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // P1 Skill-Gap Analysis (DECISIONS.md #26): tagging a posting against the
  // shared skills taxonomy is what lets a trainee later check their gap
  // against it. `required_skills` (free text) stays untouched as-is for F6
  // search — this is an additive taxonomy layer, not a replacement.
  const [skills, setSkills] = useState<Skill[]>([]);
  const [selectedSkillIds, setSelectedSkillIds] = useState<Set<string>>(new Set());
  const [newSkillName, setNewSkillName] = useState("");
  const [selectedJobSkills, setSelectedJobSkills] = useState<Skill[]>([]);

  useEffect(() => {
    loadOwnJobs();
    getSkills(accessToken)
      .then(setSkills)
      .catch((err: Error) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadOwnJobs() {
    setError(null);
    try {
      const fetchedJobs = await getJobs();
      setJobs(fetchedJobs);
      if (fetchedJobs.length > 0 && !selectedJobId) {
        void loadInterests(fetchedJobs[0].id);
      }
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleCreateJob(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const formEl = e.currentTarget;
    const title = String(form.get("title") ?? "").trim();
    const location = String(form.get("location") ?? "").trim() || undefined;
    const skillsRaw = String(form.get("required_skills") ?? "");
    const required_skills = skillsRaw
      ? skillsRaw
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : undefined;
    setError(null);
    setBusy(true);
    try {
      const created = await createJob(accessToken, { title, location, required_skills });
      if (selectedSkillIds.size > 0) {
        await setJobSkills(accessToken, created.id, [...selectedSkillIds]);
      }
      formEl.reset();
      setSelectedSkillIds(new Set());
      await loadOwnJobs();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function toggleSkillSelection(skillId: string) {
    setSelectedSkillIds((prev) => {
      const next = new Set(prev);
      if (next.has(skillId)) next.delete(skillId);
      else next.add(skillId);
      return next;
    });
  }

  async function handleCreateSkill() {
    const name = newSkillName.trim();
    if (!name) return;
    setError(null);
    try {
      const skill = await createSkill(accessToken, { name });
      setSkills((prev) => [...prev, skill].sort((a, b) => a.name.localeCompare(b.name)));
      setSelectedSkillIds((prev) => new Set(prev).add(skill.id));
      setNewSkillName("");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function loadInterests(jobId: string) {
    setSelectedJobId(jobId);
    setError(null);
    try {
      const [jobInterests, jobSkills] = await Promise.all([
        getJobInterests(accessToken, jobId),
        getJobSkills(jobId),
      ]);
      setInterests(jobInterests);
      setSelectedJobSkills(jobSkills);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleSearch(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      setResults(
        await getEmployerTrainees(accessToken, {
          q: searchQuery || undefined,
          location: searchLocation || undefined,
        }),
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleShortlist(traineeId: string) {
    if (!selectedJobId) return;
    setError(null);
    try {
      await shortlistTrainee(accessToken, selectedJobId, traineeId);
      await loadInterests(selectedJobId);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const selectedJob = jobs.find((j) => j.id === selectedJobId);
  const statusLabel = (status: string) => t.status[status] ?? status;

  return (
    <div className="p-margin-mobile md:p-margin-desktop max-w-max-width-desktop mx-auto w-full flex flex-col gap-8 text-left">
      {/* Page Header */}
      <header className="border-b border-outline-variant pb-4">
        <h1 className="font-headline-lg-mobile md:font-headline-lg text-headline-lg-mobile md:text-headline-lg text-on-surface m-0">
          {t.heading}
        </h1>
        <p className="font-body-md text-body-md text-on-surface-variant mt-1">{t.subheading}</p>
      </header>

      {error && (
        <div className="bg-error-container text-on-error-container p-4 rounded-xl flex items-center gap-3 border border-error/20">
          <span className="material-symbols-outlined text-error">error</span>
          <p className="font-body-md text-body-md">{error}</p>
        </div>
      )}

      {/* Bento Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-gutter items-start">
        {/* Left Column: Post Job & Active Jobs (Span 5) */}
        <div className="lg:col-span-5 flex flex-col gap-gutter">
          {/* Post a Job Card */}
          <div className="bg-surface-card border border-outline-variant rounded-xl p-6 shadow-sm">
            <h3 className="font-headline-sm text-headline-sm text-on-surface mb-4 flex items-center gap-2 m-0">
              <span className="material-symbols-outlined text-primary">add_circle</span>
              {t.postOpportunity}
            </h3>
            <form onSubmit={(e) => void handleCreateJob(e)} className="space-y-4">
              <div>
                <label className="block font-label-md text-label-md text-on-surface mb-1">
                  {t.jobTitleLabel}
                </label>
                <input
                  name="title"
                  required
                  placeholder={t.jobTitlePlaceholder}
                  className="w-full h-touch-target bg-surface-container-lowest border border-outline-variant rounded-lg px-3 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                  type="text"
                />
              </div>

              <div>
                <label className="block font-label-md text-label-md text-on-surface mb-1">{t.locationLabel}</label>
                <input
                  name="location"
                  placeholder={t.locationPlaceholder}
                  className="w-full h-touch-target bg-surface-container-lowest border border-outline-variant rounded-lg px-3 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                  type="text"
                />
              </div>

              <div>
                <label className="block font-label-md text-label-md text-on-surface mb-1">
                  {t.requiredSkillsLabel}
                </label>
                <input
                  name="required_skills"
                  placeholder={t.requiredSkillsPlaceholder}
                  className="w-full h-touch-target bg-surface-container-lowest border border-outline-variant rounded-lg px-3 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                  type="text"
                />
              </div>

              <div>
                <label className="skill-picker-label block font-label-md text-label-md text-on-surface mb-1">
                  {t.tagSkillsLabel}
                </label>
                <SkillPicker skills={skills} selectedIds={selectedSkillIds} onToggle={toggleSkillSelection} />
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
                    className="flex-1 h-touch-target bg-surface-container-lowest border border-outline-variant rounded-lg px-3 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                    type="text"
                  />
                  <button
                    type="button"
                    onClick={() => void handleCreateSkill()}
                    className="px-4 h-touch-target bg-surface-container-highest text-on-surface rounded-lg font-label-sm text-label-sm hover:bg-surface-variant cursor-pointer"
                  >
                    {t.addToTaxonomy}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={busy}
                className="w-full h-touch-target bg-cta text-on-primary hover:bg-cta-hover rounded-full font-label-md text-label-md transition-colors flex items-center justify-center gap-2 shadow-sm cursor-pointer disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[18px]">send</span>
                <span>{busy ? t.posting : t.postOpportunity}</span>
              </button>
            </form>
          </div>

          {/* All Jobs List Card */}
          <div className="bg-surface-card border border-outline-variant rounded-xl p-6 shadow-sm">
            <h3 className="font-headline-sm text-headline-sm text-on-surface mb-4 flex items-center gap-2 m-0">
              <span className="material-symbols-outlined text-secondary">work</span>
              {t.activePostings(jobs.length)}
            </h3>
            {jobs.length === 0 ? (
              <p className="text-sm text-on-surface-variant">{t.noJobsYet}</p>
            ) : (
              <ul className="flex flex-col gap-2 max-h-72 overflow-y-auto pr-1 list-none p-0 m-0">
                {jobs.map((job) => {
                  const isSelected = job.id === selectedJobId;
                  return (
                    <li
                      key={job.id}
                      onClick={() => void loadInterests(job.id)}
                      className={`p-3 rounded-lg cursor-pointer border transition-all ${
                        isSelected
                          ? "bg-surface-container border-primary"
                          : "bg-surface-container-lowest border-outline-variant/40 hover:bg-surface-container-low"
                      }`}
                    >
                      <div className="font-body-md font-bold text-primary">{job.title}</div>
                      <div className="font-label-sm text-on-surface-variant flex items-center gap-2 mt-1">
                        <span className="material-symbols-outlined text-[14px]">location_on</span>
                        <span>{job.location || t.flexible}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* Right Column: Candidates & Trainee Search (Span 7) */}
        <div className="lg:col-span-7 flex flex-col gap-gutter">
          {/* Candidates / Shortlist for selected job */}
          {selectedJobId && (
            <div className="bg-surface-card border border-outline-variant rounded-xl p-6 shadow-sm">
              <div className="flex justify-between items-center mb-4">
                <div>
                  <h3 className="font-headline-sm text-headline-sm text-on-surface m-0">
                    {t.candidateResponses}
                  </h3>
                  <p className="font-label-sm text-on-surface-variant mt-0.5">{t.forJob(selectedJob?.title)}</p>
                </div>
                <span className="bg-secondary-container text-on-secondary-container px-3 py-1 rounded-full font-label-sm font-bold">
                  {t.candidatesCount(interests.length)}
                </span>
              </div>

              {selectedJobSkills.length > 0 && (
                <div className="mb-4 flex items-center gap-2 text-sm">
                  <span className="font-label-sm text-on-surface-variant">{t.taggedSkills}</span>
                  <SkillChips skills={selectedJobSkills} />
                </div>
              )}

              {interests.length === 0 ? (
                <div className="p-6 text-center text-on-surface-variant text-sm bg-surface-container-low rounded-lg">
                  {t.noApplicants}
                </div>
              ) : (
                <ul className="flex flex-col gap-2 list-none p-0 m-0">
                  {interests.map((interest) => (
                    <li
                      key={interest.id}
                      className="flex items-center justify-between p-3 bg-surface-container-lowest rounded-lg border border-outline-variant/50"
                    >
                      <div>
                        <p className="font-body-md font-semibold text-primary m-0">
                          {interest.profiles?.full_name ?? t.candidateFallback(interest.trainee_id.slice(0, 8))}
                        </p>
                        <p className="font-label-sm text-on-surface-variant m-0 mt-0.5">
                          {t.statusLabel} <span className="font-bold text-primary">{statusLabel(interest.status)}</span>
                        </p>
                      </div>
                      <span className="bg-status-success/15 text-status-success px-2.5 py-1 rounded-full font-label-sm font-bold uppercase">
                        {statusLabel(interest.status)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Search Certified Trainees Card */}
          <div className="bg-surface-card border border-outline-variant rounded-xl p-6 shadow-sm">
            <h3 className="font-headline-sm text-headline-sm text-on-surface mb-2 flex items-center gap-2 m-0">
              <span className="material-symbols-outlined text-primary">person_search</span>
              {t.searchCertifiedTrainees}
            </h3>
            <p className="font-body-sm text-on-surface-variant mb-4">{t.searchSubheading}</p>

            <form onSubmit={(e) => void handleSearch(e)} className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t.searchKeywordPlaceholder}
                className="h-touch-target bg-surface-container-lowest border border-outline-variant rounded-lg px-3 text-sm focus:border-primary outline-none"
              />
              <input
                value={searchLocation}
                onChange={(e) => setSearchLocation(e.target.value)}
                placeholder={t.searchLocationPlaceholder}
                className="h-touch-target bg-surface-container-lowest border border-outline-variant rounded-lg px-3 text-sm focus:border-primary outline-none"
              />
              <div className="sm:col-span-2 flex justify-end">
                <button
                  type="submit"
                  disabled={busy}
                  className="px-6 h-touch-target bg-primary text-on-primary rounded-full font-label-md text-label-md hover:bg-primary/90 transition-colors flex items-center gap-2 cursor-pointer shadow-sm"
                >
                  <span className="material-symbols-outlined text-[18px]">search</span>
                  {t.searchTrainees}
                </button>
              </div>
            </form>

            {/* Results List */}
            {results.length > 0 && (
              <div className="space-y-3 pt-4 border-t border-outline-variant/50 max-h-80 overflow-y-auto pr-1">
                {results.map((result) => (
                  <div
                    key={result.trainee_id}
                    className="p-4 bg-surface-container-lowest border border-outline-variant rounded-lg flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3"
                  >
                    <div>
                      <h4 className="font-body-md font-bold text-primary m-0">{result.full_name}</h4>
                      <div className="mt-1 space-y-1">
                        {result.certificates.map((cert) => (
                          <p key={cert.certificate_code} className="font-label-sm text-on-surface-variant m-0">
                            • {cert.programme_title} ({cert.institution_name})
                          </p>
                        ))}
                      </div>
                    </div>

                    {selectedJobId && (
                      <button
                        type="button"
                        onClick={() => void handleShortlist(result.trainee_id)}
                        className="px-4 py-2 bg-cta text-on-primary hover:bg-cta-hover rounded-full font-label-md text-xs font-semibold shrink-0 cursor-pointer shadow-xs"
                      >
                        {t.shortlistCandidate}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
