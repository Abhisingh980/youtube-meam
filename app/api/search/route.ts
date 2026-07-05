import { NextRequest, NextResponse } from "next/server";
import { ContentType, MemeJob, VideoInfo } from "@/lib/types";
import { generateMockComments, generateMockVideos, generateMockVideoFromId } from "@/lib/mock";
import {
  hasYoutubeKey,
  searchYoutubeVideos,
  fetchTopComments,
  extractVideoId,
  fetchVideoById,
} from "@/lib/youtube";
import { pickBestComment, scoreHumor } from "@/lib/humorScore";
import { getCached, setCached } from "@/lib/cache";

export const dynamic = "force-dynamic";

const TOTAL_RESULTS = 100;
const PAGE_SIZE = 10;

/**
 * Link mode: user pasted a single YouTube video/short URL instead of a
 * keyword. We fetch that ONE video plus up to 100 of its top-level
 * comments (never nested replies), rank them funniest-first, and turn
 * each comment into its own meme job — so pagination walks through the
 * comment pool (10/page) rather than through 100 different videos.
 */
async function buildJobsForVideoLink(
  videoId: string,
  type: ContentType
): Promise<MemeJob[]> {
  const cacheKey = `link_${videoId}_${type}`;
  const cached = getCached<MemeJob[]>(cacheKey);
  if (cached) return cached;

  let video: VideoInfo | null = hasYoutubeKey()
    ? await fetchVideoById(videoId)
    : null;
  if (!video) video = generateMockVideoFromId(videoId);

  let comments = video.isMock
    ? generateMockComments(video.title, videoId, TOTAL_RESULTS)
    : await fetchTopComments(videoId, TOTAL_RESULTS);

  if (!comments.length) {
    comments = generateMockComments(video.title, videoId, TOTAL_RESULTS);
  }

  // Defensive dedup on comment text — real YouTube data can have a small
  // number of copy-pasted spam duplicates, and this also protects against
  // any residual repeats from the mock generator.
  const seenText = new Set<string>();
  const unique = comments.filter((c) => {
    const key = c.text.trim().toLowerCase();
    if (seenText.has(key)) return false;
    seenText.add(key);
    return true;
  });

  const ranked = unique
    .map((c) => ({ ...c, humorScore: scoreHumor(c.text, c.likeCount) }))
    .sort((a, b) => b.humorScore - a.humorScore)
    .slice(0, TOTAL_RESULTS);

  const jobs: MemeJob[] = ranked.map((c, i) => ({
    index: i,
    video,
    comment: {
      id: c.id,
      text: c.text,
      author: c.author,
      likeCount: c.likeCount,
      humorScore: c.humorScore,
    },
  }));

  setCached(cacheKey, jobs);
  return jobs;
}

async function buildJobsForQuery(
  query: string,
  type: ContentType
): Promise<MemeJob[]> {
  const cacheKey = `search_${query}_${type}`;
  const cached = getCached<MemeJob[]>(cacheKey);
  if (cached) return cached;

  let videos: VideoInfo[] = [];
  const usingRealApi = hasYoutubeKey();

  if (usingRealApi) {
    try {
      videos = await searchYoutubeVideos(query, type, TOTAL_RESULTS);
    } catch (err) {
      console.error("YouTube search failed, falling back to mock data:", err);
      videos = [];
    }
  }

  if (!videos.length) {
    videos = generateMockVideos(query, type, TOTAL_RESULTS);
  }

  const jobs: MemeJob[] = [];
  for (let i = 0; i < videos.length; i++) {
    const video = videos[i];
    let comments = video.isMock
      ? generateMockComments(query, video.id)
      : await fetchTopComments(video.id);

    if (!comments.length) {
      comments = generateMockComments(query, video.id);
    }

    const best = pickBestComment(comments);
    if (!best) continue;

    jobs.push({
      index: i,
      video,
      comment: {
        id: best.id,
        text: best.text,
        author: best.author,
        likeCount: best.likeCount,
        humorScore: best.humorScore,
      },
    });
  }

  setCached(cacheKey, jobs);
  return jobs;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const query = (searchParams.get("query") || "").trim();
  const type = (searchParams.get("type") || "video") as ContentType;
  const requestedPage = Math.max(1, Number(searchParams.get("page")) || 1);

  if (!query) {
    return NextResponse.json({ error: "query is required" }, { status: 400 });
  }
  if (type !== "video" && type !== "short") {
    return NextResponse.json(
      { error: "type must be 'video' or 'short'" },
      { status: 400 }
    );
  }

  try {
    const linkVideoId = extractVideoId(query);
    const allJobs = linkVideoId
      ? await buildJobsForVideoLink(linkVideoId, type)
      : await buildJobsForQuery(query, type);

    // Pagination reflects how many *unique* jobs actually came back (after
    // dedup), not a hardcoded 10 — a video with fewer than 100 unique
    // top-level comments legitimately has fewer than 10 pages.
    const actualTotalPages = Math.max(1, Math.ceil(allJobs.length / PAGE_SIZE));
    const page = Math.max(1, Math.min(actualTotalPages, requestedPage));
    const start = (page - 1) * PAGE_SIZE;
    const pageJobs = allJobs.slice(start, start + PAGE_SIZE);

    return NextResponse.json({
      query,
      type,
      page,
      totalPages: actualTotalPages,
      totalResults: allJobs.length,
      mockMode: !hasYoutubeKey(),
      linkMode: !!linkVideoId,
      jobs: pageJobs,
    });
  } catch (err: any) {
    console.error("search route error", err);
    return NextResponse.json(
      { error: err?.message || "search failed" },
      { status: 500 }
    );
  }
}
