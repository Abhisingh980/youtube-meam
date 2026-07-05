import { NextRequest, NextResponse } from "next/server";
import { renderGenerativeMeme, renderAudioMeme } from "@/lib/render";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST {
 *   kind: "video" | "audio",
 *   id, caption, ttsScript, videoPrompt,
 *   thumbnailUrl?, isMockThumbnail?, colorSeedIndex?
 * }
 *
 * Analyzer meme rendering. "video" produces a generative-looking animated
 * mp4 (real text-to-video API when configured, otherwise animated
 * motion/procedural backgrounds — never a static lettered card). "audio"
 * produces a funny voiceover mp3 (real TTS when configured).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const kind = body?.kind === "audio" ? "audio" : "video";
    const id = String(
      body?.id || `meme_${Date.now()}_${Math.random().toString(36).slice(2)}`
    ).replace(/[^\w-]/g, "_");
    const caption = String(body?.caption || "").trim();
    const ttsScript = String(body?.ttsScript || caption).trim();
    const videoPrompt = String(body?.videoPrompt || caption).trim();

    if (!caption && !ttsScript) {
      return NextResponse.json(
        { error: "caption or ttsScript is required" },
        { status: 400 }
      );
    }

    if (kind === "audio") {
      const result = await renderAudioMeme(id, ttsScript);
      return NextResponse.json({ kind, ...result });
    }

    const result = await renderGenerativeMeme({
      id,
      caption,
      ttsScript,
      videoPrompt,
      thumbnailUrl: String(body?.thumbnailUrl || ""),
      isMockThumbnail: !!body?.isMockThumbnail,
      colorSeedIndex: Number(body?.colorSeedIndex) || 0,
    });
    return NextResponse.json({ kind, ...result });
  } catch (err: any) {
    console.error("render-meme route error", err);
    return NextResponse.json(
      { error: err?.message || "render failed", url: null },
      { status: 500 }
    );
  }
}
