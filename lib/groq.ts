import { CaptionResult } from "./types";
import { generateTemplateCaption } from "./captionFallback";

const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.3-70b-versatile";

/**
 * GROQ_API_KEYS supports one or more comma-separated keys, e.g.
 *   GROQ_API_KEYS=gsk_aaa,gsk_bbb
 * Falls back to GROQ_API_KEY (single key) for convenience.
 * Keys are rotated round-robin across concurrent caption requests so
 * parallel meme generation spreads load across multiple keys instead of
 * hammering a single one into rate limits.
 */
function getKeyPool(): string[] {
  const multi = process.env.GROQ_API_KEYS;
  const single = process.env.GROQ_API_KEY;
  const raw = multi || single || "";
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

export async function generateCaptionWithGroq(
  comment: string,
  videoTitle: string
): Promise<CaptionResult> {
  const pool = getKeyPool();
  if (!pool.length) {
    return generateTemplateCaption(comment, videoTitle);
  }

  const prompt = `You are writing a short, punchy meme caption for a vertical video meme based on a YouTube comment.

Video title: "${videoTitle}"
Top comment: "${comment}"

Return ONLY a JSON object (no markdown fences, no extra text) with exactly these keys:
{"caption": "<= 20 words, punchy meme caption text to burn onto the video>", "ttsScript": "<= 30 words, a short script to read aloud as voiceover for this meme>"}`;

  // Try each key once (starting from the next in rotation) before falling
  // back to the template generator, so a single rate-limited/bad key
  // doesn't fail the whole request when others are available.
  const attempts = pool.length;
  for (let i = 0; i < attempts; i++) {
    const apiKey = nextKey(pool);
    try {
      const res = await fetch(GROQ_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [{ role: "user", content: prompt }],
          temperature: 1,
          top_p: 0.7,
          max_tokens: 300,
          stream: false,
        }),
      });

      if (!res.ok) {
        // 401 = bad key, 429 = rate limited — try the next key.
        console.error(
          `Groq caption request failed (key ${i + 1}/${attempts}): ${res.status}`
        );
        continue;
      }

      const json = await res.json();
      const raw = json?.choices?.[0]?.message?.content ?? "";
      const parsed = extractJson(raw);
      if (parsed && parsed.caption) {
        return {
          caption: String(parsed.caption).slice(0, 220),
          ttsScript: String(parsed.ttsScript || parsed.caption).slice(0, 300),
          source: "groq",
        };
      }
      // Got a response but couldn't parse it — no point retrying other
      // keys for a parsing issue, fall through to template.
      break;
    } catch (err) {
      console.error(
        `Groq caption request errored (key ${i + 1}/${attempts}):`,
        err
      );
      // network error — worth trying the next key.
      continue;
    }
  }

  return generateTemplateCaption(comment, videoTitle);
}

function extractJson(raw: string): any | null {
  try {
    return JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}
