import { ContentType, VideoInfo, CommentInfo } from "./types";

const YT_BASE = "https://www.googleapis.com/youtube/v3";

export function hasYoutubeKey(): boolean {
  return !!process.env.YOUTUBE_API_KEY;
}

/**
 * Extracts a YouTube video ID from a pasted URL (watch, youtu.be, or
 * /shorts/ links) or returns the input unchanged if it already looks like
 * a bare 11-char video ID. Returns null if the input isn't a YouTube
 * link/ID at all (i.e. it's a plain keyword search query).
 */
export function extractVideoId(input: string): string | null {
  const trimmed = input.trim();
  const patterns = [
    /(?:youtube\.com\/watch\?v=)([\w-]{11})/,
    /(?:youtu\.be\/)([\w-]{11})/,
    /(?:youtube\.com\/shorts\/)([\w-]{11})/,
    /(?:youtube\.com\/embed\/)([\w-]{11})/,
  ];
  for (const p of patterns) {
    const m = trimmed.match(p);
    if (m) return m[1];
  }
  return null;
}

export async function fetchVideoById(videoId: string): Promise<VideoInfo | null> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return null;

  const params = new URLSearchParams({ part: "snippet", id: videoId, key });
  const res = await fetch(`${YT_BASE}/videos?${params.toString()}`);
  if (!res.ok) return null;
  const json = await res.json();
  const item = (json.items || [])[0];
  if (!item) return null;

  return {
    id: videoId,
    title: item.snippet.title,
    channelTitle: item.snippet.channelTitle,
    thumbnail:
      item.snippet.thumbnails?.high?.url ||
      item.snippet.thumbnails?.default?.url ||
      "",
    url: `https://www.youtube.com/watch?v=${videoId}`,
    isMock: false,
  };
}

export async function searchYoutubeVideos(
  query: string,
  type: ContentType,
  count: number
): Promise<VideoInfo[]> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return [];

  const params = new URLSearchParams({
    part: "snippet",
    q: type === "short" ? `${query} #shorts` : query,
    type: "video",
    maxResults: String(Math.min(count, 50)),
    key,
  });

  const res = await fetch(`${YT_BASE}/search?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`YouTube search failed: ${res.status} ${await res.text()}`);
  }
  const json = await res.json();
  const items = (json.items || []) as any[];
  return items.map((item) => ({
    id: item.id.videoId,
    title: item.snippet.title,
    channelTitle: item.snippet.channelTitle,
    thumbnail:
      item.snippet.thumbnails?.high?.url ||
      item.snippet.thumbnails?.default?.url ||
      "",
    url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
    isMock: false,
  }));
}

export async function fetchTopComments(
  videoId: string,
  count = 100
): Promise<CommentInfo[]> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return [];

  // part="snippet" (no "replies") deliberately fetches only each thread's
  // top-level comment — nested reply comments are never requested.
  const params = new URLSearchParams({
    part: "snippet",
    videoId,
    maxResults: String(Math.min(count, 100)),
    order: "relevance",
    textFormat: "plainText",
    key,
  });

  try {
    const res = await fetch(`${YT_BASE}/commentThreads?${params.toString()}`);
    if (!res.ok) {
      // Comments may be disabled for a video; treat as empty rather than fatal.
      return [];
    }
    const json = await res.json();
    const items = (json.items || []) as any[];
    return items.map((item) => {
      const top = item.snippet.topLevelComment.snippet;
      return {
        id: item.id,
        text: top.textDisplay || top.textOriginal || "",
        // Author identity is intentionally dropped — only comment text is
        // ever analyzed/displayed, no personal info is carried downstream.
        author: "Viewer",
        likeCount: top.likeCount || 0,
        humorScore: 0,
      };
    });
  } catch {
    return [];
  }
}
