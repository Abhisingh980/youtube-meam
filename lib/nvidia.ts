import axios from "axios";

const INVOKE_URL = "https://ai.api.nvidia.com/v1/vlm/google/paligemma";

export function hasNvidiaKey(): boolean {
  return !!process.env.NVIDIA_API_KEY;
}

/**
 * Describes a video thumbnail using NVIDIA's PaliGemma VLM endpoint
 * (non-streaming variant of the provided sample). The description is used
 * as extra context when generating funny captions. Fully optional — any
 * failure (no key, bad image, >180KB limit, network) returns null and the
 * pipeline continues without image context.
 */
export async function describeThumbnail(
  thumbnailUrl: string
): Promise<string | null> {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey || !thumbnailUrl.startsWith("http")) return null;

  try {
    const img = await axios.get<ArrayBuffer>(thumbnailUrl, {
      responseType: "arraybuffer",
      timeout: 15000,
    });
    const imageB64 = Buffer.from(img.data).toString("base64");
    if (imageB64.length > 180_000) {
      // Per NVIDIA docs, larger images need the assets API — skip instead.
      return null;
    }

    const payload = {
      messages: [
        {
          role: "user",
          content: `Describe the image in one short sentence. <img src="data:image/jpeg;base64,${imageB64}" />`,
        },
      ],
      max_tokens: 512,
      temperature: 1.0,
      top_p: 0.7,
      stream: false,
    };

    const res = await axios.post(INVOKE_URL, payload, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
      timeout: 30000,
    });

    const text = res.data?.choices?.[0]?.message?.content;
    return typeof text === "string" && text.trim() ? text.trim().slice(0, 300) : null;
  } catch (err) {
    console.error("NVIDIA PaliGemma describe failed:", (err as Error)?.message);
    return null;
  }
}
