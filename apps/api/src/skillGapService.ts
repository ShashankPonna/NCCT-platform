import { JOB_MATCH_COUNT, SKILL_SEMANTIC_SIMILARITY_THRESHOLD } from "@ncct/constants";
import type {
  RelatedSkillMatch,
  Skill,
  SkillGapAcrossJobsResult,
  SkillGapReasoningItem,
  SkillGapResult,
} from "@ncct/shared-types";
import { embedText } from "./chatbotService.js";
import { GROQ_SMALL_MODEL, groqChat, type GroqChat } from "./groqClient.js";
import { matchJobsForTrainee } from "./jobMatchingService.js";
import { cosineSimilarity } from "./routes/attendance.js";
import { supabaseAdmin } from "./supabaseClient.js";

interface SkillRow {
  skill_id: string;
  skills: Skill | null;
}

interface CertRow {
  programme_id: string;
  course_id: string | null;
}

// PostgREST's "table not in the schema cache" code — thrown for every
// query against `course_skills` on a project where migration
// 20260901000017 hasn't been applied yet. Every certificate has carried a
// non-null `course_id` since #37, so treating this the same as any other
// query error would break the already-shipped, already-working
// programme-level gap check the moment this code deploys, on every project
// that hasn't run the migration yet — not an acceptable regression for an
// additive feature. Degrading this one specific error to "no course-level
// skills yet" (silently, matching this file's existing enrichment-layer
// posture) keeps pre-migration behavior byte-for-byte identical to before
// #45, while the new finer-grained union activates automatically the
// moment the table exists — no code change or redeploy needed at that
// point.
const POSTGREST_TABLE_NOT_FOUND = "PGRST205";

// Exported so employerSearch.ts's identical course_skills query (also
// unioned with programme_skills for the same reason) degrades the same way.
export function isMissingCourseSkillsTable(error: { code?: string } | null): boolean {
  return error?.code === POSTGREST_TABLE_NOT_FOUND;
}

/**
 * A trainee's full acquired-skill profile — every skill they're read as
 * holding, from any certificate, not scoped to one job. Two acquisition
 * routes, unioned (DECISIONS.md #45 added the second one):
 *  - every skill tagged on the whole *programme* a certificate is issued
 *    under (`programme_skills`, the original, all-or-nothing-per-programme
 *    rule from migration 20260901000012);
 *  - every skill tagged on the specific *course* the certificate actually
 *    certifies (`course_skills`) — finer-grained, since certificates have
 *    carried `course_id` directly since #37's course-completion rework. A
 *    trainee certified for one course of a multi-course programme gets
 *    that course's tagged skills even if the whole programme was never
 *    tagged, and without losing anything a programme-level tag already
 *    granted.
 */
async function getAcquiredSkills(traineeId: string): Promise<Skill[]> {
  const { data: certs, error: certsError } = await supabaseAdmin
    .from("certificates")
    .select("programme_id, course_id")
    .eq("trainee_id", traineeId);
  if (certsError) throw new Error(certsError.message);

  const certRows = (certs ?? []) as CertRow[];
  const programmeIds = [...new Set(certRows.map((c) => c.programme_id))];
  const courseIds = [
    ...new Set(certRows.map((c) => c.course_id).filter((id): id is string => id != null)),
  ];
  if (programmeIds.length === 0 && courseIds.length === 0) return [];

  const [programmeResult, courseResult] = await Promise.all([
    programmeIds.length > 0
      ? supabaseAdmin
          .from("programme_skills")
          .select("skill_id, skills(id, name, category)")
          .in("programme_id", programmeIds)
      : Promise.resolve({ data: [] as SkillRow[], error: null }),
    courseIds.length > 0
      ? supabaseAdmin
          .from("course_skills")
          .select("skill_id, skills(id, name, category)")
          .in("course_id", courseIds)
      : Promise.resolve({ data: [] as SkillRow[], error: null }),
  ]);
  if (programmeResult.error) throw new Error(programmeResult.error.message);
  if (courseResult.error && !isMissingCourseSkillsTable(courseResult.error)) {
    throw new Error(courseResult.error.message);
  }

  const bySkillId = new Map<string, Skill>();
  for (const row of [
    ...((programmeResult.data ?? []) as unknown as SkillRow[]),
    ...((courseResult.error ? [] : (courseResult.data ?? [])) as unknown as SkillRow[]),
  ]) {
    if (row.skills) bySkillId.set(row.skills.id, row.skills);
  }
  return [...bySkillId.values()];
}

/**
 * Skill gap for one trainee against one job: which of the *job's* required
 * skills they already have vs. still need. Deliberately scoped to a single
 * job, not the trainee's full acquired-skill profile — that's what the
 * "Skill-Gap Check" screen picks a job to check against. See
 * `getSkillGapAcrossJobs` below for the multi-job counterpart.
 */
export async function getSkillGap(traineeId: string, jobId: string): Promise<SkillGapResult> {
  const [{ data: jobSkillRows, error: jobSkillsError }, acquiredSkills] = await Promise.all([
    supabaseAdmin
      .from("job_skills")
      .select("skill_id, skills(id, name, category)")
      .eq("job_id", jobId),
    getAcquiredSkills(traineeId),
  ]);
  if (jobSkillsError) throw new Error(jobSkillsError.message);

  const acquiredSkillIds = new Set(acquiredSkills.map((s) => s.id));
  const requiredSkills = ((jobSkillRows ?? []) as unknown as SkillRow[])
    .map((row) => row.skills)
    .filter((skill): skill is Skill => skill !== null);

  const acquired_skills = requiredSkills.filter((skill) => acquiredSkillIds.has(skill.id));
  const gap_skills = requiredSkills.filter((skill) => !acquiredSkillIds.has(skill.id));

  const [reasoning, related_skills] = await Promise.all([
    rankMissingSkills(gap_skills),
    findRelatedSkills(gap_skills, acquiredSkills),
  ]);

  return { acquired_skills, gap_skills, reasoning, related_skills };
}

export const computeSkillGap = getSkillGap;

interface FindRelatedOptions {
  /** Injectable for tests so they never load the real embedding model. */
  embed?: (text: string) => Promise<number[]>;
}

/**
 * Semantic partial-credit layer (DECISIONS.md #45): for each gap skill,
 * finds the trainee's closest *already-acquired* skill by name embedding
 * (reusing F7/F13's local model — no API key, no network call) and reports
 * it when the similarity clears SKILL_SEMANTIC_SIMILARITY_THRESHOLD. Never
 * changes acquired_skills/gap_skills themselves — a trainee with
 * "Accounting" still genuinely lacks "Bookkeeping" in the exact sense the
 * job asked for, this is an annotation on top, not a reclassification.
 * Degrades to `[]` (not an error) on any failure, same posture as
 * `rankMissingSkills`'s `null` — this is enrichment, never the feature.
 */
export async function findRelatedSkills(
  gapSkills: Skill[],
  acquiredSkills: Skill[],
  options: FindRelatedOptions = {},
): Promise<RelatedSkillMatch[]> {
  if (gapSkills.length === 0 || acquiredSkills.length === 0) return [];

  try {
    const embed = options.embed ?? embedText;
    const [gapEmbeddings, acquiredEmbeddings] = await Promise.all([
      Promise.all(gapSkills.map((s) => embed(s.name))),
      Promise.all(acquiredSkills.map((s) => embed(s.name))),
    ]);

    const matches: RelatedSkillMatch[] = [];
    gapSkills.forEach((gapSkill, gapIdx) => {
      let bestIdx = -1;
      let bestSimilarity = -1;
      acquiredSkills.forEach((_, acquiredIdx) => {
        const similarity = cosineSimilarity(gapEmbeddings[gapIdx], acquiredEmbeddings[acquiredIdx]);
        if (similarity > bestSimilarity) {
          bestSimilarity = similarity;
          bestIdx = acquiredIdx;
        }
      });
      if (bestIdx !== -1 && bestSimilarity >= SKILL_SEMANTIC_SIMILARITY_THRESHOLD) {
        matches.push({
          gap_skill_id: gapSkill.id,
          gap_skill_name: gapSkill.name,
          related_acquired_skill_id: acquiredSkills[bestIdx].id,
          related_acquired_skill_name: acquiredSkills[bestIdx].name,
          similarity: bestSimilarity,
        });
      }
    });
    return matches;
  } catch {
    // Embedding model failed to load or run — the deterministic gap is
    // still complete and correct without this layer.
    return [];
  }
}

/**
 * F11's multi-job counterpart (DECISIONS.md #45): rather than one job at a
 * time, aggregates the gap across every job in the trainee's own F13
 * top-match set (or, with no profile signal yet, the newest open postings)
 * — "learn this one skill and you close a gap for N of the jobs you're
 * actually a realistic fit for," not the single-job "am I ready for this
 * job" question `getSkillGap` answers.
 */
export async function getSkillGapAcrossJobs(traineeId: string): Promise<SkillGapAcrossJobsResult> {
  const { matches, hasProfileSignal } = await matchJobsForTrainee(traineeId);

  let jobs: { id: string; title: string }[];
  if (hasProfileSignal && matches.length > 0) {
    jobs = matches.map((m) => ({ id: m.id, title: m.title }));
  } else {
    const { data, error } = await supabaseAdmin
      .from("jobs")
      .select("id, title")
      .order("created_at", { ascending: false })
      .limit(JOB_MATCH_COUNT);
    if (error) throw new Error(error.message);
    jobs = data ?? [];
  }

  if (jobs.length === 0) {
    return { jobs: [], gap_summary: [], hasProfileSignal };
  }

  const jobIds = jobs.map((j) => j.id);
  const [{ data: jobSkillRows, error: jobSkillsError }, acquiredSkills] = await Promise.all([
    supabaseAdmin
      .from("job_skills")
      .select("job_id, skill_id, skills(id, name, category)")
      .in("job_id", jobIds),
    getAcquiredSkills(traineeId),
  ]);
  if (jobSkillsError) throw new Error(jobSkillsError.message);

  const acquiredSkillIds = new Set(acquiredSkills.map((s) => s.id));
  const bySkill = new Map<string, { skill: Skill; jobIds: Set<string> }>();

  for (const row of (jobSkillRows ?? []) as unknown as (SkillRow & { job_id: string })[]) {
    if (!row.skills || acquiredSkillIds.has(row.skills.id)) continue;
    const entry = bySkill.get(row.skills.id) ?? { skill: row.skills, jobIds: new Set<string>() };
    entry.jobIds.add(row.job_id);
    bySkill.set(row.skills.id, entry);
  }

  const gap_summary = [...bySkill.values()]
    .map(({ skill, jobIds: needingJobIds }) => ({
      skill_id: skill.id,
      skill_name: skill.name,
      category: skill.category,
      jobs_needing_it: needingJobIds.size,
      job_ids: [...needingJobIds],
    }))
    .sort(
      (a, b) => b.jobs_needing_it - a.jobs_needing_it || a.skill_name.localeCompare(b.skill_name),
    );

  return { jobs, gap_summary, hasProfileSignal };
}

interface RankOptions {
  /** Injectable for tests so they never reach the real Groq API. */
  chat?: GroqChat;
}

/**
 * Optional "what to learn first" ranking over the gap, via Groq (moved from
 * Gemini — docs/DECISIONS.md #68). This is
 * a genuinely optional enrichment layer, not the feature itself — the gap
 * above is fully deterministic set subtraction. Any failure here (missing
 * key, model error, malformed response) degrades to `null`, which the UI
 * renders as a distinct "no suggested order available" state, never an
 * error — see TraineeCareerSkillGap.tsx.
 */
export async function rankMissingSkills(
  gapSkills: Skill[],
  options: RankOptions = {},
): Promise<SkillGapReasoningItem[] | null> {
  if (gapSkills.length === 0) return null;

  try {
    const chat = options.chat ?? groqChat;
    const skillList = gapSkills.map((s) => `- ${s.id}: ${s.name}`).join("\n");

    // JSON mode guarantees syntactically valid JSON but not the shape, so
    // the prompt pins it and the parsing below still validates every item.
    const response = await chat({
      model: GROQ_SMALL_MODEL,
      messages: [
        {
          role: "system",
          content:
            'You output only a JSON object of the form {"ranking": [{"skill_id": string, "reason": string}]}. Every skill_id in your output must be copied exactly from the input list — never invent one.',
        },
        {
          role: "user",
          content: `A trainee is missing these skills for a job they're interested in:\n${skillList}\n\nRank them in the order they should learn them (most foundational / highest-impact first), with a one-sentence reason each. Respond in JSON.`,
        },
      ],
      response_format: { type: "json_object" },
    });

    const text = (response.content ?? "").trim();
    if (!text) return null;

    const json: unknown = JSON.parse(text);
    const parsed = (
      Array.isArray(json) ? json : ((json as { ranking?: unknown }).ranking ?? [])
    ) as { skill_id: string; reason: string }[];
    if (!Array.isArray(parsed)) return null;
    const skillById = new Map(gapSkills.map((s) => [s.id, s]));

    const ranked: SkillGapReasoningItem[] = [];
    let rank = 1;
    for (const item of parsed) {
      const skill = skillById.get(item.skill_id);
      if (!skill || typeof item.reason !== "string") continue;
      ranked.push({
        rank: rank++,
        skill_id: skill.id,
        skill_name: skill.name,
        reason: item.reason,
      });
    }

    return ranked.length > 0 ? ranked : null;
  } catch {
    // Missing API key, model error, or a malformed response — all treated
    // the same way: the deterministic gap above is still complete and
    // correct on its own, so this layer fails silently rather than
    // breaking (or even error-flagging) the whole request.
    return null;
  }
}
