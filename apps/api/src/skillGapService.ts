import { GoogleGenAI } from "@google/genai";
import type { Skill, SkillGapReasoningItem, SkillGapResult } from "@ncct/shared-types";
import { supabaseAdmin } from "./supabaseClient.js";

interface SkillRow {
  skill_id: string;
  skills: Skill | null;
}

// A trainee is read as having "acquired" every skill tagged on a programme
// they hold an issued certificate for — see the migration comment
// (20260901000012) for why this reads certificates.programme_id directly
// rather than joining through assessments/modules/courses.
async function getAcquiredSkillIds(traineeId: string): Promise<Set<string>> {
  const { data: certs, error: certsError } = await supabaseAdmin
    .from("certificates")
    .select("programme_id")
    .eq("trainee_id", traineeId);
  if (certsError) throw new Error(certsError.message);

  const programmeIds = [...new Set((certs ?? []).map((c) => c.programme_id as string))];
  if (programmeIds.length === 0) return new Set();

  const { data: rows, error } = await supabaseAdmin
    .from("programme_skills")
    .select("skill_id")
    .in("programme_id", programmeIds);
  if (error) throw new Error(error.message);

  return new Set((rows ?? []).map((r) => r.skill_id as string));
}

/**
 * Skill gap for one trainee against one job: which of the *job's* required
 * skills they already have vs. still need. Deliberately scoped to a single
 * job, not the trainee's full acquired-skill profile — that's what the
 * "Skill-Gap Check" screen picks a job to check against.
 */
export async function getSkillGap(traineeId: string, jobId: string): Promise<SkillGapResult> {
  const [{ data: jobSkillRows, error: jobSkillsError }, acquiredSkillIds] = await Promise.all([
    supabaseAdmin.from("job_skills").select("skill_id, skills(id, name, category)").eq("job_id", jobId),
    getAcquiredSkillIds(traineeId),
  ]);
  if (jobSkillsError) throw new Error(jobSkillsError.message);

  const requiredSkills = ((jobSkillRows ?? []) as unknown as SkillRow[])
    .map((row) => row.skills)
    .filter((skill): skill is Skill => skill !== null);

  const acquired_skills = requiredSkills.filter((skill) => acquiredSkillIds.has(skill.id));
  const gap_skills = requiredSkills.filter((skill) => !acquiredSkillIds.has(skill.id));

  const reasoning = await rankMissingSkills(gap_skills);

  return { acquired_skills, gap_skills, reasoning };
}

interface RankOptions {
  /** Injectable for tests so they never reach the real Gemini API. */
  client?: GoogleGenAI;
}

/**
 * Optional "what to learn first" ranking over the gap, via Gemini. This is
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
    const client = options.client ?? new GoogleGenAI({});
    const skillList = gapSkills.map((s) => `- ${s.id}: ${s.name}`).join("\n");

    const response = await client.models.generateContent({
      model: "gemini-3.1-flash-lite",
      contents: `A trainee is missing these skills for a job they're interested in:\n${skillList}\n\nRank them in the order they should learn them (most foundational / highest-impact first), with a one-sentence reason each.`,
      config: {
        systemInstruction:
          "You output only JSON matching the requested schema. Every skill_id in your output must be copied exactly from the input list — never invent one.",
        maxOutputTokens: 1024,
        responseMimeType: "application/json",
        responseSchema: {
          type: "array",
          items: {
            type: "object",
            properties: {
              skill_id: { type: "string" },
              reason: { type: "string" },
            },
            required: ["skill_id", "reason"],
          },
        },
      },
    });

    const text = (response.text ?? "").trim();
    if (!text) return null;

    const parsed = JSON.parse(text) as { skill_id: string; reason: string }[];
    const skillById = new Map(gapSkills.map((s) => [s.id, s]));

    const ranked: SkillGapReasoningItem[] = [];
    let rank = 1;
    for (const item of parsed) {
      const skill = skillById.get(item.skill_id);
      if (!skill || typeof item.reason !== "string") continue;
      ranked.push({ rank: rank++, skill_id: skill.id, skill_name: skill.name, reason: item.reason });
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
