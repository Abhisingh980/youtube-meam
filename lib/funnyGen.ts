import { ChatGroq } from "@langchain/groq";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { FunnyGeneration } from "./types";
import { generateTemplateCaption } from "./captionFallback";
import { describeThumbnail } from "./nvidia";

const MODEL = "llama-3.3-70b-versatile";

function getKeyPool(): string[] {
  const raw = process.env.GROQ_API_KEYS || process.env.GROQ_API_KEY || "";
  return raw
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
}

let rrIndex = 0;
function nextKey(pool: string[]): string {
  const key = pool[rrIndex % pool.length];
  rrIndex++;
  return key;
}

function extractJson(raw: string): any | null {
  try {
    return JSON.parse(raw);
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}

/**
 * Second LLM stage: given one funny comment (picked by the batch analyzer),
 * generate punchy meme content — a caption to burn onto the video and a
 * short voiceover script. Uses LangChain's ChatGroq; if NVIDIA_API_KEY is
 * set, the thumbnail is first described by PaliGemma and that description
 * is fed in as visual context. Falls back to the deterministic template
 * generator on any failure.
 */
export async function generateFunnyContent(
  comment: string,
  videoTitle: string,
  thumbnailUrl?: string
): Promise<FunnyGeneration> {
  const imageContext = thumbnailUrl
    ? await describeThumbnail(thumbnailUrl)
    : null;

  const pool = getKeyPool();
  if (!pool.length) {
    const t = generateTemplateCaption(comment, videoTitle);
    return { ...t, imageContext: imageContext || undefined };
  }

  const system = new SystemMessage(
    "You write short, punchy, genuinely funny meme content from YouTube comments. Never be abusive. Respond with ONLY a JSON object, no markdown fences."
  );
  const human = new HumanMessage(
    `Video title: "${videoTitle}"
${imageContext ? `Video thumbnail shows: ${imageContext}\n` : ""}Funny comment: "${comment}"

Return exactly:
{"caption": "<= 20 words, punchy meme caption to burn onto a vertical video>", "ttsScript": "<= 30 words, short funny voiceover script for this meme>"}`
  );

  for (let attempt = 0; attempt < pool.length; attempt++) {
    const apiKey = nextKey(pool);
    try {
      const llm = new ChatGroq({
        apiKey,
        model: MODEL,
        temperature: 1,
        maxTokens: 300,
      });
      const res = await llm.invoke([system, human]);
      const raw =
        typeof res.content === "string"
          ? res.content
          : JSON.stringify(res.content);
      const parsed = extractJson(raw);
      if (parsed?.caption) {
        return {
          caption: String(parsed.caption).slice(0, 220),
          ttsScript: String(parsed.ttsScript || parsed.caption).slice(0, 300),
          source: "groq",
          imageContext: imageContext || undefined,
        };
      }
      break; // parse failure — other keys won't help
    } catch (err) {
      console.error(
        `Groq funny-gen failed (key ${attempt + 1}/${pool.length}):`,
        err
      );
      continue;
    }
  }

  const t = generateTemplateCaption(comment, videoTitle);
  return { ...t, imageContext: imageContext || undefined };
}
