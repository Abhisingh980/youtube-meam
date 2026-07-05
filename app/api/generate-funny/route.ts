import { NextRequest, NextResponse } from "next/server";
import { generateFunnyContent } from "@/lib/funnyGen";

export const dynamic = "force-dynamic";

/**
 * POST { comment, videoTitle, thumbnailUrl? }
 *
 * LLM call #2 of the pipeline: turns one funny comment (already picked by
 * the batch analyzer) into meme content — caption + voiceover script. When
 * NVIDIA_API_KEY is set, the thumbnail is described by PaliGemma first and
 * used as visual context.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const comment = String(body?.comment || "").trim();
    const videoTitle = String(body?.videoTitle || "this video").trim();
    const thumbnailUrl = body?.thumbnailUrl
      ? String(body.thumbnailUrl)
      : undefined;

    if (!comment) {
      return NextResponse.json(
        { error: "comment is required" },
        { status: 400 }
      );
    }

    const result = await generateFunnyContent(comment, videoTitle, thumbnailUrl);
    return NextResponse.json(result);
  } catch (err: any) {
    console.error("generate-funny route error", err);
    return NextResponse.json(
      { error: err?.message || "Generation failed." },
      { status: 500 }
    );
  }
}
