import fs from "fs";

/**
 * Real speech synthesis via the ElevenLabs REST API (free tier works).
 * Returns true and writes an mp3 to destPath on success; false on any
 * failure (no key, quota, network) so callers fall back to the ffmpeg
 * placeholder tone.
 */
export function hasTtsKey(): boolean {
  return !!process.env.ELEVENLABS_API_KEY;
}

const DEFAULT_VOICE = "21m00Tcm4TlvDq8ikWAM"; // "Rachel", multilingual-capable

export async function synthesizeSpeech(
  text: string,
  destPath: string
): Promise<boolean> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey || !text.trim()) return false;

  const voiceId = process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE;
  try {
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text: text.slice(0, 500),
          // multilingual model so Hindi voiceover scripts also work
          model_id: "eleven_multilingual_v2",
          voice_settings: { stability: 0.4, similarity_boost: 0.75 },
        }),
      }
    );
    if (!res.ok) {
      console.error(`ElevenLabs TTS failed: ${res.status}`);
      return false;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 500) return false; // suspiciously small = error body
    fs.writeFileSync(destPath, buf);
    return true;
  } catch (err) {
    console.error("ElevenLabs TTS error:", (err as Error)?.message);
    return false;
  }
}
