import {
  createPartFromFunctionCall,
  createPartFromFunctionResponse,
  createPartFromText,
  GoogleGenAI,
  type Content,
  type FunctionDeclaration,
} from "@google/genai";
import type { CareerCounsellorAnswer } from "@ncct/shared-types";
import { getSkillGap } from "./skillGapService.js";
import { supabaseAdmin } from "./supabaseClient.js";

// P2 AI Career Counsellor (PRD §6.12, promoted from Phase-2 — see
// docs/DECISIONS.md #27). Unlike F7's chatbot (chatbotService.ts), which is
// deliberately scoped to shared, non-personalized FAQ content and refuses
// career advice, this *is* the personalized-advice feature — the model is
// given read-only tools over the calling trainee's own data (never anyone
// else's: every tool ignores any trainee-identifying argument the model
// might supply and always uses the server-verified `req.user.id` instead)
// and reasons over what they actually come back with.

// Bounds the tool-calling loop so a model that keeps requesting tools
// (or requests the same one repeatedly) can't turn one question into an
// unbounded number of Gemini calls.
const MAX_TOOL_TURNS = 4;

// A caller can never name their own or anyone else's trainee id — every
// tool is implicitly scoped to whoever is asking. Job/programme ids are
// not sensitive (the catalog is browsable to any authenticated user
// already, per programmes_read_authenticated / jobs_public_read).
const TOOLS: FunctionDeclaration[] = [
  {
    name: "get_my_profile",
    description: "The caller's own name and cooperative/PACS affiliation.",
    parametersJsonSchema: { type: "object", properties: {} },
  },
  {
    name: "list_my_certificates",
    description: "Certificates the caller has already earned, with the programme and institution each came from.",
    parametersJsonSchema: { type: "object", properties: {} },
  },
  {
    name: "list_my_nominations",
    description: "Programmes the caller has been nominated/enrolled for and each nomination's status (pending/approved/waitlisted/rejected).",
    parametersJsonSchema: { type: "object", properties: {} },
  },
  {
    name: "list_open_programmes",
    description: "Training programmes currently open in the catalog, optionally filtered by mode.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        mode: { type: "string", enum: ["online", "offline", "hybrid"], description: "Optional delivery mode filter." },
      },
    },
  },
  {
    name: "list_open_jobs",
    description: "Employer job postings currently open, optionally filtered by location keyword.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        location: { type: "string", description: "Optional location keyword filter." },
      },
    },
  },
  {
    name: "get_my_skill_gap_for_job",
    description:
      "For one job (by id, from list_open_jobs), which of its required skills the caller already has vs. still needs.",
    parametersJsonSchema: {
      type: "object",
      properties: { job_id: { type: "string", description: "A job id returned by list_open_jobs." } },
      required: ["job_id"],
    },
  },
];

const LIST_LIMIT = 20;

async function executeTool(
  name: string,
  args: Record<string, unknown>,
  traineeId: string,
): Promise<unknown> {
  switch (name) {
    case "get_my_profile": {
      const { data, error } = await supabaseAdmin
        .from("profiles")
        .select("full_name, cooperative_affiliation")
        .eq("id", traineeId)
        .single();
      if (error) throw new Error(error.message);
      return data;
    }
    case "list_my_certificates": {
      const { data, error } = await supabaseAdmin
        .from("certificates")
        .select("certificate_code, issued_at, programmes(title), institutions(name)")
        .eq("trainee_id", traineeId)
        .order("issued_at", { ascending: false })
        .limit(LIST_LIMIT);
      if (error) throw new Error(error.message);
      return data;
    }
    case "list_my_nominations": {
      const { data, error } = await supabaseAdmin
        .from("nominations")
        .select("status, nominated_at, programmes(id, title, mode, start_date, end_date)")
        .eq("trainee_id", traineeId)
        .order("nominated_at", { ascending: false })
        .limit(LIST_LIMIT);
      if (error) throw new Error(error.message);
      return data;
    }
    case "list_open_programmes": {
      let query = supabaseAdmin
        .from("programmes")
        .select("id, title, mode, target_audience, start_date, end_date")
        .order("created_at", { ascending: false })
        .limit(LIST_LIMIT);
      const mode = args.mode;
      if (typeof mode === "string" && mode.length > 0) {
        query = query.eq("mode", mode);
      }
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return data;
    }
    case "list_open_jobs": {
      let query = supabaseAdmin
        .from("jobs")
        .select("id, title, location, required_skills")
        .order("created_at", { ascending: false })
        .limit(LIST_LIMIT);
      const location = args.location;
      if (typeof location === "string" && location.length > 0) {
        query = query.ilike("location", `%${location}%`);
      }
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return data;
    }
    case "get_my_skill_gap_for_job": {
      const jobId = args.job_id;
      if (typeof jobId !== "string" || jobId.length === 0) {
        throw new Error("job_id is required");
      }
      // Reuses P1's exact gap computation (skillGapService.ts) rather than
      // duplicating it — same acquired-vs-gap logic the trainee-facing
      // Skill-Gap Check screen uses.
      return getSkillGap(traineeId, jobId);
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// Distinct from F7's chatbot system prompt (chatbotService.ts): that one
// explicitly refuses personalized advice to stay on PRD §6.7's
// informational-only side of the Phase-2 boundary. This prompt is the
// deliberate reversal of that boundary for this one feature — see
// docs/DECISIONS.md #27 for why. The grounding discipline (never invent
// facts) carries over unchanged; only the advice-refusal rule is dropped.
const SYSTEM_PROMPT = `You are a career counsellor for trainees on the NCCT cooperative training platform. Unlike a general FAQ bot, you give personalized guidance — which programme to take next, whether a trainee is ready for a job, what to learn first — grounded in that trainee's own real data.

Rules:
- Before answering anything that depends on the trainee's own data (their certificates, nominations, skill gaps) or the current catalog (open programmes, open jobs), call the relevant tool. Never guess or assume what they have or what's available.
- Ground every factual claim (a certificate, a nomination status, a programme's dates, a job's required skills, a skill gap) ONLY in what a tool call actually returned. Never invent a programme name, job, certificate, or skill that wasn't in a tool result.
- If a tool returns nothing relevant (e.g. no certificates yet, no open programmes matching), say so plainly rather than inventing something to fill the gap.
- Personalized career, skill, and programme-choice advice is exactly what you're for — give it directly, don't deflect to "contact your institution" the way a generic FAQ would.
- Refuse anything outside this platform's cooperative-training/employment domain (general chit-chat, unrelated topics) — redirect to what you can actually help with.
- Keep answers concise and in plain language — a few sentences to a short paragraph, not an essay.`;

interface AskOptions {
  /** Injectable for tests so they never reach the real Gemini API. */
  client?: GoogleGenAI;
}

export async function askCareerCounsellor(
  traineeId: string,
  question: string,
  options: AskOptions = {},
): Promise<CareerCounsellorAnswer> {
  const client = options.client ?? new GoogleGenAI({});
  const contents: Content[] = [{ role: "user", parts: [createPartFromText(question)] }];
  const toolCalls: CareerCounsellorAnswer["toolCalls"] = [];

  for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
    const response = await client.models.generateContent({
      model: "gemini-3.1-flash-lite",
      contents,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        maxOutputTokens: 1024,
        tools: [{ functionDeclarations: TOOLS }],
      },
    });

    const calls = response.functionCalls;
    if (!calls || calls.length === 0) {
      return { answer: (response.text ?? "").trim() || FALLBACK_ANSWER, toolCalls };
    }

    contents.push({
      role: "model",
      parts: calls.map((call) => createPartFromFunctionCall(call.name ?? "", call.args ?? {})),
    });

    const responseParts = [];
    for (const call of calls) {
      const name = call.name ?? "";
      const args = call.args ?? {};
      let result: Record<string, unknown>;
      try {
        result = { output: await executeTool(name, args, traineeId) };
      } catch (err) {
        result = { error: (err as Error).message };
      }
      toolCalls.push({ tool: name, args });
      responseParts.push(createPartFromFunctionResponse(call.id ?? name, name, result));
    }
    contents.push({ role: "user", parts: responseParts });
  }

  // The model kept requesting tools past MAX_TOOL_TURNS — one last call
  // with no tools available forces a text answer from whatever context has
  // already been gathered, rather than an unbounded loop or a dead end.
  const finalResponse = await client.models.generateContent({
    model: "gemini-3.1-flash-lite",
    contents,
    config: { systemInstruction: SYSTEM_PROMPT, maxOutputTokens: 1024 },
  });
  return { answer: (finalResponse.text ?? "").trim() || FALLBACK_ANSWER, toolCalls };
}

const FALLBACK_ANSWER =
  "I wasn't able to work out a clear answer to that. Try rephrasing, or ask about your certificates, nominations, or a specific open programme or job.";
