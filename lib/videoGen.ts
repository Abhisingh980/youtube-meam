import fs from "fs";

/**
 * Pluggable text-to-video provider hook.
 *
 * When VIDEO_GEN_API_URL + VIDEO_GEN_API_KEY are configured (e.g. a
 * MiniMax/Hailuo, Runway, or any OpenAI-compatible video generation
 * endpoint that accepts {prompt} and returns a video URL), the funny
 * comment's LLM-written videoPrompt is sent there and the resulting real
 * generative-AI video is downloaded and used as the meme background.
 *
 * Without those env vars this returns null and lib/render.ts falls back
 * to its procedural "generative-look" animated ffmpeg renderer.
 */
export function hasVideoGenApi(): boolean {
  return !!(process.env.VIDEO_GEN_API_URL && process.env.VIDEO_GEN_API_KEY);
}

export async function generateVideoFromPrompt(
  prompt: string,
  destPath: string
): Promise<boolean> {
  const url = process.env.VIDEO_GEN_API_URL;
  const key = process.env.VIDEO_GEN_API_KEY;
  if (!url || !key || !prompt.trim()) return false;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt: prompt.slice(0, 500),
        // common fields across providers; unknown fields are ignored
        model: process.env.VIDEO_GEN_MODEL || undefined,
        aspect_ratio: "9:16",
        duration: 6,
      }),
    });
    if (!res.ok) {
      console.error(`video-gen API failed: ${res.status}`);
      return false;
    }
    const json = await res.json();
    // Accept the common response shapes: {video_url}, {url},
    // {data:{video_url}}, {output:[url]}
    const videoUrl =
      json.video_url ||
      json.url ||
      json?.data?.video_url ||
      (Array.isArray(json.output) ? json.output[0] : null);
    if (!videoUrl || typeof videoUrl !== "string") return false;

    const dl = await fetch(videoUrl);
    if (!dl.ok) return false;
    fs.writeFileSync(destPath, Buffer.from(await dl.arrayBuffer()));
    return true;
  } catch (err) {
    console.error("video-gen API error:", (err as Error)?.message);
    return false;
  }
}
