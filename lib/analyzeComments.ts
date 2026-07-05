import { ChatGroq } from "@langchain/groq";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { FlatComment, CommentAnalysis } from "./types";
import { scoreHumor } from "./humorScore";

const MODEL = "llama-3.3-70b-versatile";

/** One LLM call analyzes at most this many comments (per the spec). */
export const BATCH_SIZE = 50;

function getKeyPool(): string[] {
  const raw = process.env.GROQ_API_KEYS || process.env.GROQ_API_KEY || "";
  return raw
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
}

export function hasGroqKey(): boolean {
  return getKeyPool().length > 0;
}

let rrIndex = 0;
function nextKey(pool: string[]): string {
  const key = pool[rrIndex % pool.length];
  rrIndex++;
  return key;
}

const SYSTEM_PROMPT = `You are a YouTube comment-section analyst. You will be given a numbered batch of comments (top-level comments and nested replies) from one video's comment section.

For EVERY comment in the batch, rate:
- funnyScore: 0-10, how genuinely funny / meme-worthy the comment is.
- galiScore: 0-10, how abusive / profane it is — this includes English profanity AND Hindi/Hinglish gali (abusive slang). 0 = totally clean, 10 = extremely abusive.
- reason: a very short (<= 10 words) note on your verdict.

Respond with ONLY a JSON array (no markdown fences, no prose), one object per comment, in the SAME order as given:
[{"i": <comment number>, "funnyScore": <0-10>, "galiScore": <0-10>, "reason": "<short note>"}]`;

function buildBatchPrompt(batch: FlatComment[]): string {
  const lines = batch.map((c) => {
    const kind = c.depth === 0 ? "comment" : `reply-to-#${c.threadStart}`;
    const text = c.text.replace(/\s+/g, " ").slice(0, 400);
    return `#${c.index} [${kind}, likes:${c.likeCount}] ${text}`;
  });
  return `Analyze these ${batch.length} comments:\n\n${lines.join("\n")}`;
}

function heuristicAnalysis(c: FlatComment): CommentAnalysis {
  const funny = Math.min(10, Math.round(scoreHumor(c.text, c.likeCount) / 6));
  const gali = detectGali(c.text);
  return {
    index: c.index,
    funnyScore: funny,
    galiScore: gali,
    isFunny: funny >= 5,
    isGali: gali >= 4,
    reason: "heuristic scoring (no LLM key / LLM failed)",
    source: "heuristic",
  };
}

// Small deliberately-mild keyword fallback used ONLY when no LLM is
// available — real gali detection is the LLM's job.
const GALI_HINTS = [
  "stupid",
  "idiot",
  "dumb",
  "trash",
  "garbage",
  "hate you",
  "shut up",
  "wtf",
  "bkl",
  "bsdk",
  "chutiya",
  "kamina",
  "harami",
  "gandu",
  "saala",
  "kutta",
  "kutte",
];

function detectGali(text: string): number {
  const lower = text.toLowerCase();
  let hits = 0;
  for (const w of GALI_HINTS) if (lower.includes(w)) hits++;
  return Math.min(10, hits * 4);
}

function extractJsonArray(raw: string): any[] | null {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    const m = raw.match(/\[[\s\S]*\]/);
    if (m) {
      try {
        const parsed = JSON.parse(m[0]);
        return Array.isArray(parsed) ? parsed : null;
      } catch {
        return null;
      }
    }
    return null;
  }
}

async function analyzeBatchWithLLM(
  batch: FlatComment[]
): Promise<CommentAnalysis[] | null> {
  const pool = getKeyPool();
  if (!pool.length) return null;

  // Try each key once so a rate-limited key doesn't fail the whole batch.
  for (let attempt = 0; attempt < pool.length; attempt++) {
    const apiKey = nextKey(pool);
    try {
      const llm = new ChatGroq({
        apiKey,
        model: MODEL,
        temperature: 0.2,
        maxTokens: 4000,
      });
      const res = await llm.invoke([
        new SystemMessage(SYSTEM_PROMPT),
        new HumanMessage(buildBatchPrompt(batch)),
      ]);
      const raw =
        typeof res.content === "string"
          ? res.content
          : JSON.stringify(res.content);
      const arr = extractJsonArray(raw);
      if (!arr) return null; // parse failure — no point retrying other keys

      const byIndex = new Map<number, any>();
      for (const item of arr) byIndex.set(Number(item.i), item);

      return batch.map((c) => {
        const item = byIndex.get(c.index);
        if (!item) return heuristicAnalysis(c);
        const funnyScore = clamp010(item.funnyScore);
        const galiScore = clamp010(item.galiScore);
        return {
          index: c.index,
          funnyScore,
          galiScore,
          isFunny: funnyScore >= 6,
          isGali: galiScore >= 4,
          reason: String(item.reason || "").slice(0, 120),
          source: "llm" as const,
        };
      });
    } catch (err) {
      console.error(
        `Groq analysis batch failed (key ${attempt + 1}/${pool.length}):`,
        err
      );
      continue;
    }
  }
  return null;
}

function clamp010(v: any): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(10, Math.round(n * 10) / 10));
}

/**
 * Analyzes an entire comment section. Comments are divided into batches of
 * BATCH_SIZE (50) and each batch is ONE LLM call (all using the same single
 * Groq model). Any batch whose LLM call fails degrades to per-comment
 * heuristic scoring, so the endpoint always returns a full result set.
 */
export async function analyzeAllComments(
  comments: FlatComment[]
): Promise<{ analyses: CommentAnalysis[]; llmCalls: number; usedLLM: boolean }> {
  const batches: FlatComment[][] = [];
  for (let i = 0; i < comments.length; i += BATCH_SIZE) {
    batches.push(comments.slice(i, i + BATCH_SIZE));
  }

  let llmCalls = 0;
  let usedLLM = false;
  const results: CommentAnalysis[] = [];

  // Batches run sequentially to stay friendly to free-tier rate limits.
  for (const batch of batches) {
    let batchResult: CommentAnalysis[] | null = null;
    if (hasGroqKey()) {
      llmCalls++;
      batchResult = await analyzeBatchWithLLM(batch);
    }
    if (batchResult) {
      usedLLM = true;
      results.push(...batchResult);
    } else {
      results.push(...batch.map(heuristicAnalysis));
    }
  }

  return { analyses: results, llmCalls, usedLLM };
}
