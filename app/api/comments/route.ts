import { NextRequest, NextResponse } from "next/server";
import { extractVideoId, fetchVideoById, hasYoutubeKey } from "@/lib/youtube";
import { fetchCommentTree } from "@/lib/commentTree";
import { CommentSectionResult } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * POST { url: "<youtube video / shorts / youtu.be link or bare 11-char id>" }
 *
 * Skips the video content entirely and goes STRAIGHT to the comment
 * section: returns the video's metadata plus its full flattened comment
 * tree (top-level comments and nested replies, with threadStart/threadEnd
 * references marking where each nested thread begins and ends).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const input = String(body?.url || "").trim();
    if (!input) {
      return NextResponse.json(
        { error: "Paste a YouTube video or Shorts link." },
        { status: 400 }
      );
    }

    const videoId =
      extractVideoId(input) || (/^[\w-]{11}$/.test(input) ? input : null);
    if (!videoId) {
      return NextResponse.json(
        { error: "That doesn't look like a YouTube video/Shorts link." },
        { status: 400 }
      );
    }

    let realVideo = null;
    if (hasYoutubeKey()) {
      realVideo = await fetchVideoById(videoId);
      if (!realVideo) {
        return NextResponse.json(
          { error: "Video not found (bad link, private, or deleted)." },
          { status: 404 }
        );
      }
    }

    const { video, comments, mockMode } = await fetchCommentTree(
      videoId,
      realVideo
    );

    const totalTopLevel = comments.filter((c) => c.depth === 0).length;
    const result: CommentSectionResult = {
      video,
      comments,
      totalTopLevel,
      totalWithReplies: comments.length,
      mockMode,
    };

    if (comments.length === 0) {
      result.message = "There is no comment on this video.";
    }

    return NextResponse.json(result);
  } catch (err: any) {
    console.error("comments route error", err);
    return NextResponse.json(
      { error: err?.message || "Failed to load comment section." },
      { status: 500 }
    );
  }
}
