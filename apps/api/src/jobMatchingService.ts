import { JOB_MATCH_COUNT } from "@ncct/constants";
import type { Job, JobMatch, JobMatchesResult } from "@ncct/shared-types";
import { embedText } from "./chatbotService.js";
import { supabaseAdmin } from "./supabaseClient.js";

// P3 AI Job Matching (DECISIONS.md #28). Reuses F7's exact embedding
// primitive (`embedText`, local Xenova/all-MiniLM-L6-v2 — DECISIONS.md
// #17) rather than adding a second embedding pipeline; only the corpus
// (jobs, not FAQ chunks) and the SQL RPC (`match_jobs`, not
// `match_corpus_chunks`) differ.

function buildJobEmbeddingText(
  job: Pick<Job, "title" | "description" | "required_skills">,
  taggedSkillNames: string[],
): string {
  const parts = [job.title];
  if (job.description) parts.push(job.description);
  const skills = [...new Set([...(job.required_skills ?? []), ...taggedSkillNames])];
  if (skills.length > 0) parts.push(`Required skills: ${skills.join(", ")}.`);
  return parts.join(". ");
}

/**
 * (Re)computes and stores one job's embedding from its current title/
 * description/required_skills plus its P1 taxonomy-tagged skills (if any).
 * Called after job create/update (jobs.ts) and after job skill-tagging
 * changes (skills.ts) so the embedding stays current with either path.
 * Deliberately swallows its own errors — see `embedJobBestEffort` below,
 * the only way this should actually be called from a route.
 */
async function embedJob(jobId: string): Promise<void> {
  const { data: job, error: jobError } = await supabaseAdmin
    .from("jobs")
    .select("title, description, required_skills")
    .eq("id", jobId)
    .single();
  if (jobError) throw new Error(jobError.message);

  const { data: skillRows, error: skillsError } = await supabaseAdmin
    .from("job_skills")
    .select("skills(name)")
    .eq("job_id", jobId);
  if (skillsError) throw new Error(skillsError.message);
  const taggedSkillNames = (skillRows ?? [])
    .map((row) => (row as unknown as { skills: { name: string } | null }).skills?.name)
    .filter((name): name is string => Boolean(name));

  const embedding = await embedText(buildJobEmbeddingText(job, taggedSkillNames));

  const { error: updateError } = await supabaseAdmin.from("jobs").update({ embedding }).eq("id", jobId);
  if (updateError) throw new Error(updateError.message);
}

/**
 * The only entry point routes should call. A job's embedding is an
 * enrichment for ranking, never a requirement for the job posting itself
 * to succeed — a failure here (model cold-start hiccup, transient DB
 * error) is logged and swallowed, leaving `embedding` null. A null
 * embedding just means the job won't surface in ranked matches until a
 * later write recomputes it; it is not a broken job posting.
 */
export async function embedJobBestEffort(jobId: string): Promise<void> {
  try {
    await embedJob(jobId);
  } catch (err) {
    console.error(`Job embedding failed for ${jobId}:`, (err as Error).message);
  }
}

async function buildTraineeProfileText(traineeId: string): Promise<{ text: string; hasSignal: boolean }> {
  const [{ data: profile }, { data: certs, error: certsError }] = await Promise.all([
    supabaseAdmin.from("profiles").select("cooperative_affiliation").eq("id", traineeId).maybeSingle(),
    supabaseAdmin
      .from("certificates")
      .select("programme_id, programmes(title)")
      .eq("trainee_id", traineeId),
  ]);
  if (certsError) throw new Error(certsError.message);

  const programmeIds = [...new Set((certs ?? []).map((c) => c.programme_id as string))];
  let skillNames: string[] = [];
  if (programmeIds.length > 0) {
    const { data: skillRows, error: skillsError } = await supabaseAdmin
      .from("programme_skills")
      .select("skills(name)")
      .in("programme_id", programmeIds);
    if (skillsError) throw new Error(skillsError.message);
    skillNames = [
      ...new Set(
        (skillRows ?? [])
          .map((row) => (row as unknown as { skills: { name: string } | null }).skills?.name)
          .filter((name): name is string => Boolean(name)),
      ),
    ];
  }
  const programmeTitles = [
    ...new Set(
      (certs ?? [])
        .map((c) => (c as unknown as { programmes: { title: string } | null }).programmes?.title)
        .filter((title): title is string => Boolean(title)),
    ),
  ];

  const parts: string[] = [];
  if (profile?.cooperative_affiliation) {
    parts.push(`Cooperative affiliation: ${profile.cooperative_affiliation}.`);
  }
  if (programmeTitles.length > 0) parts.push(`Certified in: ${programmeTitles.join(", ")}.`);
  if (skillNames.length > 0) parts.push(`Skills: ${skillNames.join(", ")}.`);

  const hasSignal = programmeTitles.length > 0 || skillNames.length > 0;
  return { text: parts.length > 0 ? parts.join(" ") : "No certifications or skills on record yet.", hasSignal };
}

/**
 * Ranks currently-embedded jobs against a trainee's own profile — never
 * the other way around, and never against another trainee's data. The
 * profile embedding is built fresh per request (cheap, and always
 * reflects the trainee's latest certificates), not stored.
 */
export async function matchJobsForTrainee(traineeId: string): Promise<JobMatchesResult> {
  const { text, hasSignal } = await buildTraineeProfileText(traineeId);
  const queryEmbedding = await embedText(text);

  const { data, error } = await supabaseAdmin.rpc("match_jobs", {
    query_embedding: queryEmbedding,
    match_count: JOB_MATCH_COUNT,
  });
  if (error) throw new Error(error.message);

  return { matches: (data ?? []) as JobMatch[], hasProfileSignal: hasSignal };
}
