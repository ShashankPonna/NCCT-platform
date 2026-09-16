import { getMyNominations, getProgrammes, nominateSelf } from "@ncct/api-client";
import type { Nomination, Programme } from "@ncct/shared-types";
import { useEffect, useState } from "react";
import { useLocale, type Locale } from "../i18n/LocaleContext.js";
import { EmptyState, ErrorBanner, StatusPill } from "./pieces.js";

interface TraineeLearnNominateProps {
  accessToken: string;
}

type MyNomination = Nomination & {
  programmes: { title: string; mode: string; start_date: string | null; end_date: string | null } | null;
};

interface TraineeLearnNominateText {
  heading: string;
  subheading: string;
  myNominations: string;
  programmeFallback: string;
  openProgrammes: string;
  emptyTitle: string;
  emptyBody: string;
  dates: string;
  tbd: string;
  capacity: string;
  openCapacity: string;
  alreadyNominated: string;
  nominating: string;
  nominateMe: string;
}

const content: Record<Locale, TraineeLearnNominateText> = {
  en: {
    heading: "Learn Programmes",
    subheading: "Browse and enroll in available training programmes.",
    myNominations: "My Nominations",
    programmeFallback: "Programme",
    openProgrammes: "Open Programmes",
    emptyTitle: "No programmes yet",
    emptyBody: "Check back soon for open programmes.",
    dates: "Dates",
    tbd: "TBD",
    capacity: "Capacity",
    openCapacity: "Open",
    alreadyNominated: "Already nominated",
    nominating: "Nominating…",
    nominateMe: "Nominate me",
  },
  hi: {
    heading: "सीखने के कार्यक्रम",
    subheading: "उपलब्ध प्रशिक्षण कार्यक्रमों को देखें और नामांकन करें।",
    myNominations: "मेरे नामांकन",
    programmeFallback: "कार्यक्रम",
    openProgrammes: "खुले कार्यक्रम",
    emptyTitle: "अभी तक कोई कार्यक्रम नहीं",
    emptyBody: "खुले कार्यक्रमों के लिए जल्द ही दोबारा देखें।",
    dates: "तिथियां",
    tbd: "तय होना बाकी",
    capacity: "क्षमता",
    openCapacity: "खुला",
    alreadyNominated: "पहले से नामांकित",
    nominating: "नामांकन हो रहा है…",
    nominateMe: "मुझे नामांकित करें",
  },
};

// design/stitch_ncct_trainee_portal/learn_nominate_enroll — new screen,
// backed by F2's existing self-nomination route (POST
// /programmes/:id/nominations) plus the new GET /api/nominations/mine.
export function TraineeLearnNominate({ accessToken }: TraineeLearnNominateProps) {
  const { locale } = useLocale();
  const t = content[locale];
  const [programmes, setProgrammes] = useState<Programme[]>([]);
  const [nominations, setNominations] = useState<MyNomination[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [nominatingId, setNominatingId] = useState<string | null>(null);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  function load() {
    getProgrammes(accessToken)
      .then(setProgrammes)
      .catch((err: Error) => setError(err.message));
    getMyNominations(accessToken)
      .then(setNominations)
      .catch((err: Error) => setError(err.message));
  }

  async function handleNominate(programmeId: string) {
    setError(null);
    setNominatingId(programmeId);
    try {
      await nominateSelf(accessToken, programmeId);
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setNominatingId(null);
    }
  }

  const nominatedProgrammeIds = new Set(nominations.map((n) => n.programme_id));

  return (
    <div className="flex flex-col gap-6 py-6 md:py-8">
      <div>
        <h1 className="font-headline text-headline-lg-mobile text-primary md:text-headline-lg">
          {t.heading}
        </h1>
        <p className="mt-1 text-body-md text-on-surface-variant">{t.subheading}</p>
      </div>

      <ErrorBanner message={error} />

      {nominations.length > 0 && (
        <div className="flex flex-col gap-4">
          <h2 className="font-headline text-headline-md text-primary">{t.myNominations}</h2>
          {nominations.map((nom) => (
            <div
              key={nom.id}
              className="flex flex-col justify-between gap-4 rounded-xl border border-border-low-contrast bg-surface-card p-6 md:flex-row md:items-center"
            >
              <div>
                <h3 className="mb-1 font-headline text-headline-md text-primary">
                  {nom.programmes?.title ?? t.programmeFallback}
                </h3>
                <p className="text-body-md text-on-surface-variant">{nom.programmes?.mode}</p>
              </div>
              <StatusPill status={nom.status} />
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-4">
        <h2 className="font-headline text-headline-md text-primary">{t.openProgrammes}</h2>
        {programmes.length === 0 ? (
          <EmptyState icon="school" title={t.emptyTitle} body={t.emptyBody} />
        ) : (
          programmes.map((programme) => {
            const already = nominatedProgrammeIds.has(programme.id);
            return (
              <div
                key={programme.id}
                className="flex flex-col justify-between gap-4 rounded-xl border border-border-low-contrast bg-surface-card p-6 transition-shadow hover:shadow-md md:flex-row"
              >
                <div className="flex-grow">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="rounded bg-surface-container-highest px-2 py-1 text-label-sm capitalize text-on-surface">
                      {programme.mode}
                    </span>
                  </div>
                  <h2 className="mb-1 font-headline text-headline-md text-primary">{programme.title}</h2>
                  {programme.description && (
                    <p className="mb-4 text-body-md text-on-surface-variant">{programme.description}</p>
                  )}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="block text-label-sm text-outline">{t.dates}</span>
                      <span className="text-body-md text-on-surface">
                        {programme.start_date ?? t.tbd} — {programme.end_date ?? t.tbd}
                      </span>
                    </div>
                    <div>
                      <span className="block text-label-sm text-outline">{t.capacity}</span>
                      <span className="text-body-md text-on-surface">{programme.capacity ?? t.openCapacity}</span>
                    </div>
                  </div>
                </div>
                <div className="flex min-w-[150px] flex-col items-start justify-end md:items-end">
                  <button
                    type="button"
                    disabled={already || nominatingId === programme.id}
                    onClick={() => handleNominate(programme.id)}
                    className="min-h-touch-target w-full rounded bg-secondary-container px-6 py-3 text-label-md text-on-secondary-container transition-colors hover:bg-secondary hover:text-on-secondary disabled:cursor-not-allowed disabled:opacity-60 md:w-auto"
                  >
                    {already ? t.alreadyNominated : nominatingId === programme.id ? t.nominating : t.nominateMe}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
