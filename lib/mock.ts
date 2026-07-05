import { ContentType, VideoInfo, CommentInfo } from "./types";

const GRADIENTS = [
  ["#ff3d6e", "#7c5cff"],
  ["#ff9a3d", "#ff3d6e"],
  ["#3dfff0", "#7c5cff"],
  ["#ffe23d", "#ff3d6e"],
  ["#3dff7a", "#3d8fff"],
  ["#c93dff", "#ff3d6e"],
  ["#3dd6ff", "#3d3dff"],
  ["#ff3d3d", "#ffae3d"],
];

const TITLE_TEMPLATES = [
  "I tried {query} for 24 hours and this happened",
  "{query} but it's actually insane",
  "why is nobody talking about {query}",
  "the ultimate {query} compilation",
  "{query} gone wrong (not clickbait)",
  "rating every {query} video so you don't have to",
  "{query}... but make it chaotic",
  "this {query} moment broke the internet",
  "POV: you searched {query}",
  "{query} explained in 60 seconds",
];

const CHANNELS = [
  "MemeLordTV",
  "DailyClips",
  "ChaosChannel",
  "TrendWatch",
  "NightOwlUploads",
  "ViralVault",
  "RandomButFunny",
  "TheClipShop",
  "InternetArchive_",
  "SnackSizeVideos",
];

const COMMENT_TEMPLATES = [
  "bro really said {query} and NOBODY blinked 💀",
  "the way I laughed at 0:{sec} lol",
  "not me watching this at 3am 😂😂",
  "this is the {query} content I signed up for, no cap",
  "why is this so underrated, this comment section deserves better",
  "I'm deceased, the editing on this is unmatched",
  "who else came here after the {query} meme blew up",
  "the algorithm knew exactly what it was doing",
  "this aged like fine wine ngl",
  "POV: you're reading comments instead of doing homework lmaooo",
  "ratio + you fell off + {query} isn't even real",
  "the guy in the back is the real main character fr fr",
  "I've watched this 14 times today, send help",
  "this is criminally underrated, why only 200 likes",
  "the sound effect at the end sent me 🤣",
];

function seededRandom(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h) || 1;
}

function pick<T>(arr: T[], rnd: () => number): T {
  return arr[Math.floor(rnd() * arr.length)];
}

export function generateMockThumbnailDataUri(index: number): string {
  const [c1, c2] = GRADIENTS[index % GRADIENTS.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${c1}"/>
        <stop offset="100%" stop-color="${c2}"/>
      </linearGradient>
    </defs>
    <rect width="480" height="360" fill="url(#g)"/>
    <circle cx="240" cy="180" r="60" fill="rgba(255,255,255,0.15)"/>
    <text x="240" y="190" font-size="40" text-anchor="middle" fill="rgba(255,255,255,0.55)" font-family="Arial, sans-serif">#${
      index + 1
    }</text>
  </svg>`;
  const base64 = Buffer.from(svg).toString("base64");
  return `data:image/svg+xml;base64,${base64}`;
}

/**
 * Single mock video for "paste a YouTube link" mode when no YOUTUBE_API_KEY
 * is configured — deterministic from the extracted video ID so the same
 * pasted link always yields the same demo video + comment pool.
 */
export function generateMockVideoFromId(videoId: string): VideoInfo {
  const rnd = seededRandom(hashString(videoId));
  const template = pick(TITLE_TEMPLATES, rnd);
  const title = template.replace(/\{query\}/g, "this video");
  const channel = pick(CHANNELS, rnd);
  return {
    id: videoId,
    title,
    channelTitle: channel + Math.floor(rnd() * 99),
    thumbnail: generateMockThumbnailDataUri(hashString(videoId)),
    url: `https://www.youtube.com/watch?v=${videoId}`,
    isMock: true,
  };
}

export function generateMockVideos(
  query: string,
  type: ContentType,
  count: number
): VideoInfo[] {
  const rnd = seededRandom(hashString(query + type));
  const videos: VideoInfo[] = [];
  for (let i = 0; i < count; i++) {
    const template = pick(TITLE_TEMPLATES, rnd);
    const title = template.replace(/\{query\}/g, query);
    const channel = pick(CHANNELS, rnd);
    const id = `mock_${type}_${hashString(query + type + i)}`;
    videos.push({
      id,
      title: type === "short" ? `${title} #shorts` : title,
      channelTitle: channel + Math.floor(rnd() * 99),
      thumbnail: generateMockThumbnailDataUri(i),
      url: `https://www.youtube.com/${type === "short" ? "shorts/" : "watch?v="}${id}`,
      isMock: true,
    });
  }
  return videos;
}

const REACTION_TAILS = [
  "",
  " fr fr",
  " no cap",
  " 💀",
  " 😭😭",
  " why is this so real",
  " I can't breathe",
  " someone pin this",
  " underrated comment",
  " this needs more likes",
];

export function generateMockComments(
  query: string,
  videoId: string,
  count = 8
): CommentInfo[] {
  const rnd = seededRandom(hashString(videoId));
  const comments: CommentInfo[] = [];
  const seen = new Set<string>();
  // With only a handful of base templates, cycling through them for a
  // large `count` produces exact duplicates. Combine template + a
  // reaction tail + a varying {sec} so distinct (template, tail) pairs
  // give distinct comment text instead of the same string repeating.
  let attempts = 0;
  while (comments.length < count && attempts < count * 20) {
    attempts++;
    const template = pick(COMMENT_TEMPLATES, rnd);
    const tail = pick(REACTION_TAILS, rnd);
    const text = (
      template
        .replace(/\{query\}/g, query)
        .replace(/\{sec\}/g, String(Math.floor(rnd() * 59)).padStart(2, "0")) + tail
    ).trim();
    if (seen.has(text)) continue;
    seen.add(text);
    comments.push({
      id: `${videoId}_c${comments.length}`,
      text,
      author: "Viewer",
      likeCount: Math.floor(rnd() * 5000),
      humorScore: 0,
    });
  }
  return comments;
}
