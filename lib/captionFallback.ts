import { CaptionResult } from "./types";

const OPENERS = [
  "when the comments hit different:",
  "nobody:\nthis comment:",
  "the way this comment sent me:",
  "me reading the top comment at 2am:",
  "plot twist nobody asked for:",
  "breaking news from the comment section:",
];

function truncateWords(text: string, maxWords: number): string {
  const words = text.trim().split(/\s+/);
  if (words.length <= maxWords) return text.trim();
  return words.slice(0, maxWords).join(" ") + "...";
}

/**
 * Deterministic, dependency-free template-based caption generator used
 * when no GROQ_API_KEY is configured. Produces a short punchy
 * meme caption and a matching TTS script from a comment + video title.
 */
export function generateTemplateCaption(
  comment: string,
  videoTitle: string
): CaptionResult {
  const opener = OPENERS[Math.abs(hash(comment)) % OPENERS.length];
  const cleanComment = comment.replace(/\s+/g, " ").trim();
  const caption = truncateWords(`${opener} "${cleanComment}"`, 20);
  const ttsScript = truncateWords(
    `Top comment on ${videoTitle}: ${cleanComment}`,
    30
  );
  return { caption, ttsScript, source: "template" };
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}
