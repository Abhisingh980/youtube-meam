import { FlatComment, VideoInfo } from "./types";
import { generateMockVideoFromId } from "./mock";

const YT_BASE = "https://www.googleapis.com/youtube/v3";

/**
 * Hard cap on how many comment threads we pull per video so a viral video
 * with 100k comments doesn't blow up quota / LLM cost. ~500 comments =
 * at most 10 analysis LLM calls at 50 comments per call.
 */
const MAX_THREADS = 200;
const MAX_TOTAL_COMMENTS = 500;

interface RawThread {
  id: string;
  top: {
    text: string;
    author: string;
    likeCount: number;
    publishedAt: string;
  };
  replies: {
    id: string;
    parentId: string;
    text: string;
    author: string;
    likeCount: number;
    publishedAt: string;
  }[];
  totalReplyCount: number;
}

/**
 * Fetches the FULL comment section of a video (top-level comments AND their
 * nested replies) from the YouTube Data API v3, paginating commentThreads
 * until MAX limits are hit.
 *
 * Returns null when comments are disabled / the request fails, and an empty
 * array when the video simply has no comments.
 */
async function fetchRawThreads(videoId: string): Promise<RawThread[] | null> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return null;

  const threads: RawThread[] = [];
  let pageToken: string | undefined;
  let total = 0;

  while (threads.length < MAX_THREADS && total < MAX_TOTAL_COMMENTS) {
    const params = new URLSearchParams({
      part: "snippet,replies",
      videoId,
      maxResults: "100",
      order: "relevance",
      textFormat: "plainText",
      key,
    });
    if (pageToken) params.set("pageToken", pageToken);

    let json: any;
    try {
      const res = await fetch(`${YT_BASE}/commentThreads?${params.toString()}`);
      if (!res.ok) {
        // 403 commentsDisabled, 404 bad video, quota errors, etc.
        return threads.length ? threads : null;
      }
      json = await res.json();
    } catch {
      return threads.length ? threads : null;
    }

    for (const item of (json.items || []) as any[]) {
      const top = item.snippet?.topLevelComment?.snippet;
      if (!top) continue;
      const replies = ((item.replies?.comments || []) as any[]).map((r) => ({
        id: r.id,
        parentId: item.snippet.topLevelComment.id,
        text: r.snippet?.textDisplay || r.snippet?.textOriginal || "",
        author: r.snippet?.authorDisplayName || "Viewer",
        likeCount: r.snippet?.likeCount || 0,
        publishedAt: r.snippet?.publishedAt || "",
      }));
      threads.push({
        id: item.snippet.topLevelComment.id,
        top: {
          text: top.textDisplay || top.textOriginal || "",
          author: top.authorDisplayName || "Viewer",
          likeCount: top.likeCount || 0,
          publishedAt: top.publishedAt || "",
        },
        replies,
        totalReplyCount: item.snippet.totalReplyCount || replies.length,
      });
      total += 1 + replies.length;
      if (threads.length >= MAX_THREADS || total >= MAX_TOTAL_COMMENTS) break;
    }

    pageToken = json.nextPageToken;
    if (!pageToken) break;
  }

  return threads;
}

/**
 * Flattens comment threads into a single ordered list while recording, for
 * every thread, WHERE it starts and WHERE it ends in the flat list
 * (threadStart / threadEnd references). Replies carry parentId + depth so
 * the tree is fully reconstructible.
 */
function flattenThreads(threads: RawThread[]): FlatComment[] {
  const flat: FlatComment[] = [];
  for (const t of threads) {
    const start = flat.length;
    const end = start + t.replies.length; // inclusive index of last reply
    flat.push({
      index: start,
      id: t.id,
      parentId: null,
      depth: 0,
      text: t.top.text,
      author: t.top.author,
      likeCount: t.top.likeCount,
      publishedAt: t.top.publishedAt,
      threadStart: start,
      threadEnd: end,
      replyCount: t.replies.length,
    });
    for (const r of t.replies) {
      flat.push({
        index: flat.length,
        id: r.id,
        parentId: r.parentId,
        depth: 1,
        text: r.text,
        author: r.author,
        likeCount: r.likeCount,
        publishedAt: r.publishedAt,
        threadStart: start,
        threadEnd: end,
        replyCount: 0,
      });
    }
  }
  return flat;
}

// ---------------------------------------------------------------------------
// Mock comment tree (demo mode, no YOUTUBE_API_KEY)
// ---------------------------------------------------------------------------

const MOCK_TOP = [
  "bro really did that and NOBODY blinked 💀",
  "the way I laughed at 0:42 lmaooo",
  "not me watching this at 3am 😂😂",
  "why is this so underrated, this comment section deserves better",
  "I'm deceased, the editing on this is unmatched",
  "the algorithm knew exactly what it was doing",
  "this aged like fine wine ngl",
  "POV: you're reading comments instead of doing homework",
  "the guy in the back is the real main character fr fr",
  "I've watched this 14 times today, send help",
  "abe yaar ye kya bana diya 😭",
  "this is criminally underrated, why only 200 likes",
];

const MOCK_REPLIES = [
  "fr fr no cap",
  "underrated reply section too 💀",
  "bro said what we were all thinking",
  "nah this reply is funnier than the video",
  "sahi bola bhai",
  "I can't breathe 😭",
  "someone pin this",
  "the accuracy is scary",
];

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h) || 1;
}

function seededRandom(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export function generateMockThreads(videoId: string): RawThread[] {
  const rnd = seededRandom(hashString(videoId));
  const count = 8 + Math.floor(rnd() * 10);
  const threads: RawThread[] = [];
  for (let i = 0; i < count; i++) {
    const id = `${videoId}_t${i}`;
    const replyCount = Math.floor(rnd() * 4); // 0-3 nested replies
    const replies = [];
    for (let j = 0; j < replyCount; j++) {
      replies.push({
        id: `${id}_r${j}`,
        parentId: id,
        text: MOCK_REPLIES[Math.floor(rnd() * MOCK_REPLIES.length)],
        author: `Viewer${Math.floor(rnd() * 900)}`,
        likeCount: Math.floor(rnd() * 400),
        publishedAt: new Date(Date.now() - rnd() * 1e10).toISOString(),
      });
    }
    threads.push({
      id,
      top: {
        text: MOCK_TOP[Math.floor(rnd() * MOCK_TOP.length)],
        author: `Viewer${Math.floor(rnd() * 900)}`,
        likeCount: Math.floor(rnd() * 5000),
        publishedAt: new Date(Date.now() - rnd() * 1e10).toISOString(),
      },
      replies,
      totalReplyCount: replyCount,
    });
  }
  return threads;
}

export interface CommentTreeFetch {
  video: VideoInfo;
  comments: FlatComment[];
  mockMode: boolean;
}

/**
 * Main entry: given a video id (already extracted from a pasted URL) return
 * the video's metadata + its flattened comment tree. Falls back to a
 * deterministic mock comment tree in demo mode (no YOUTUBE_API_KEY).
 */
export async function fetchCommentTree(
  videoId: string,
  realVideo: VideoInfo | null
): Promise<CommentTreeFetch> {
  if (process.env.YOUTUBE_API_KEY && realVideo) {
    const threads = await fetchRawThreads(videoId);
    return {
      video: realVideo,
      comments: flattenThreads(threads || []),
      mockMode: false,
    };
  }
  const mockVideo = generateMockVideoFromId(videoId);
  return {
    video: mockVideo,
    comments: flattenThreads(generateMockThreads(videoId)),
    mockMode: true,
  };
}
