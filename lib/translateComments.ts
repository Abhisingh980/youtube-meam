import { ChatGroq } from "@langchain/groq";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { FlatComment } from "./types";

const MODEL = "llama-3.3-70b-versatile";

/** One LLM call translates at most this many comments. */
export const TRANSLATE_BATCH_SIZE = 50;

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

const SYSTEM_PROMPT = `You are a precise English-to-Hindi translator for YouTube comments.

Translate EVERY comment EXACTLY as written into natural Hindi (Devanagari script):
- Faithful translation of the exact comment — do NOT summarize, censor, embellish, or change meaning.
- Keep emojis, numbers, @mentions, and timestamps exactly as they are.
- Keep well-known slang/meme words that have no Hindi equivalent as Hinglish (transliterated) where natural.
- If a comment is already in Hindi, return it unchanged.

Respond with ONLY a JSON array (no markdown fences, no prose), one object per comment, same order:
[{"i": <comment number>, "hi": "<exact Hindi translation>"}]`;

function buildBatchPrompt(batch: FlatComment[]): string {
  const lines = batch.map(
    (c) => `#${c.index} ${c.text.replace(/\s+/g, " ").slice(0, 500)}`
  );
  return `Translate these ${batch.length} comments to Hindi:\n\n${lines.join("\n")}`;
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

async function translateBatch(
  batch: FlatComment[]
): Promise<Map<number, string> | null> {
  const pool = getKeyPool();
  if (!pool.length) return null;

  for (let attempt = 0; attempt < pool.length; attempt++) {
    const apiKey = nextKey(pool);
    try {
      const llm = new ChatGroq({
        apiKey,
        model: MODEL,
        temperature: 0.1, // exact translation — keep it deterministic
        maxTokens: 6000,
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
      if (!arr) return null;
      const map = new Map<number, string>();
      for (const item of arr) {
        const hi = String(item.hi || "").trim();
        if (hi) map.set(Number(item.i), hi.slice(0, 1000));
      }
      return map;
    } catch (err) {
      console.error(
        `Groq translate batch failed (key ${attempt + 1}/${pool.length}):`,
        err
      );
      continue;
    }
  }
  return null;
}

/**
 * Translates a whole comment section English -> Hindi. The EXACT text of
 * each comment is translated (faithful, no rewriting). Batches of 50
 * comments per LLM call, same single Groq model as the analyzer.
 *
 * Returns null translations when no Groq key is configured — the UI shows
 * a notice instead of fake translations (translation is never mocked).
 */
export async function translateAllComments(
  comments: FlatComment[]
): Promise<{
  translations: Record<number, string> | null;
  llmCalls: number;
}> {
  if (!hasGroqKey()) return { translations: null, llmCalls: 0 };

  const out: Record<number, string> = {};
  let llmCalls = 0;
  for (let i = 0; i < comments.length; i += TRANSLATE_BATCH_SIZE) {
    const batch = comments.slice(i, i + TRANSLATE_BATCH_SIZE);
    llmCalls++;
    const map = await translateBatch(batch);
    if (map) {
      map.forEach((hi, idx) => (out[idx] = hi));
    }
    // A failed batch simply leaves those comments untranslated — the UI
    // falls back to the original English text for them.
  }
  return { translations: out, llmCalls };
}
