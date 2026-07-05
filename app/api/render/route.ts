import { NextRequest, NextResponse } from "next/server";
import { renderMeme } from "@/lib/render";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const id = String(body?.id || `meme_${Date.now()}_${Math.random().toString(36).slice(2)}`);
    const caption = String(body?.caption || "").trim();
    const thumbnailUrl = String(body?.thumbnailUrl || "");
    const isMockThumbnail = !!body?.isMockThumbnail;
    const ttsScript = String(body?.ttsScript || caption);
    const colorSeedIndex = Number(body?.colorSeedIndex) || 0;

    if (!caption) {
      return NextResponse.json({ error: "caption is required" }, { status: 400 });
    }

    const url = await renderMeme({
      id,
      caption,
      thumbnailUrl,
      isMockThumbnail,
      ttsScript,
      colorSeedIndex,
    });

    return NextResponse.json({ url, mock: isMockThumbnail });
  } catch (err: any) {
    console.error("render route error", err);
    return NextResponse.json(
      { error: err?.message || "render failed", url: null },
      { status: 500 }
    );
  }
}
