import { NextRequest, NextResponse } from "next/server";
import { generateCaptionWithGroq } from "@/lib/groq";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const comment = String(body?.comment || "").trim();
    const videoTitle = String(body?.videoTitle || "").trim();

    if (!comment || !videoTitle) {
      return NextResponse.json(
        { error: "comment and videoTitle are required" },
        { status: 400 }
      );
    }

    const result = await generateCaptionWithGroq(comment, videoTitle);
    return NextResponse.json(result);
  } catch (err: any) {
    console.error("generate-caption route error", err);
    return NextResponse.json(
      { error: err?.message || "caption generation failed" },
      { status: 500 }
    );
  }
}
