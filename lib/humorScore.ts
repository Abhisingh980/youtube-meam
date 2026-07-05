/**
 * Lightweight, dependency-free heuristic "humor" scorer for comments.
 *
 * This is NOT a real ML/BERT model — it's a deterministic scoring
 * heuristic that rewards signals correlated with funny/meme-worthy
 * YouTube comments: laughter tokens, emoji density, exclamation/caps,
 * comment length sweet-spot, like count, and presence of meme slang.
 */

const LAUGH_PATTERNS = [
  /\blmao+\b/i,
  /\blol+\b/i,
  /\brofl\b/i,
  /\bha(ha)+\b/i,
  /\bbruh\b/i,
  /\bskull\b/i,
  /💀/g,
  /😂/g,
  /🤣/g,
];

const MEME_SLANG = [
  "no cap",
  "fr fr",
  "not the",
  "i'm deceased",
  "im deceased",
  "the way",
  "why is no one talking about",
  "this you",
  "ratio",
  "goated",
  "sent me",
  "i can't",
  "icant",
  "not me",
  "who else",
  "green flag",
  "red flag",
  "ai enhanced",
  "underrated comment",
];

export function scoreHumor(text: string, likeCount = 0): number {
  if (!text) return 0;
  let score = 0;
  const lower = text.toLowerCase();

  for (const pattern of LAUGH_PATTERNS) {
    const matches = lower.match(pattern);
    if (matches) score += Math.min(matches.length, 3) * 8;
  }

  for (const slang of MEME_SLANG) {
    if (lower.includes(slang)) score += 6;
  }

  const emojiCount = (text.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu) || [])
    .length;
  score += Math.min(emojiCount, 5) * 3;

  const exclaims = (text.match(/!/g) || []).length;
  score += Math.min(exclaims, 4) * 2;

  const capsWords = (text.match(/\b[A-Z]{3,}\b/g) || []).length;
  score += Math.min(capsWords, 3) * 3;

  // Length sweet spot: short punchy comments score higher than walls of text.
  const len = text.trim().length;
  if (len >= 15 && len <= 140) score += 10;
  else if (len > 140) score -= Math.min((len - 140) / 20, 15);
  else if (len < 15) score -= 5;

  // Popularity boost (diminishing returns).
  score += Math.min(Math.log10(likeCount + 1) * 6, 20);

  // Light randomness seeded by text length so results are stable per input
  // but candidates don't tie deterministically.
  score += (hashString(text) % 5) * 0.5;

  return Math.max(0, Math.round(score * 10) / 10);
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function pickBestComment<T extends { text: string; likeCount: number }>(
  comments: T[]
): (T & { humorScore: number }) | null {
  if (!comments.length) return null;
  let best: (T & { humorScore: number }) | null = null;
  for (const c of comments) {
    const humorScore = scoreHumor(c.text, c.likeCount);
    if (!best || humorScore > best.humorScore) {
      best = { ...c, humorScore };
    }
  }
  return best;
}
