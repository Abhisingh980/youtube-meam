import fs from "fs";
import path from "path";
import os from "os";
import { spawn } from "child_process";
// @ts-ignore - ffmpeg-static has no bundled types
import ffmpegPath from "ffmpeg-static";
import { synthesizeSpeech } from "./tts";
import { generateVideoFromPrompt, hasVideoGenApi } from "./videoGen";

const GENERATED_DIR = path.join(process.cwd(), "public", "generated");

const FONT_CANDIDATES = [
  "/System/Library/Fonts/Supplemental/Arial.ttf",
  "/System/Library/Fonts/Helvetica.ttc",
  "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
  "/Library/Fonts/Arial.ttf",
];

function findFont(): string | null {
  for (const f of FONT_CANDIDATES) {
    if (fs.existsSync(f)) return f;
  }
  return null;
}

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function wrapText(text: string, maxCharsPerLine = 24): string {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const w of words) {
    if ((current + " " + w).trim().length > maxCharsPerLine) {
      if (current) lines.push(current.trim());
      current = w;
    } else {
      current = (current + " " + w).trim();
    }
  }
  if (current) lines.push(current.trim());
  return lines.join("\\N");
}

function formatSrtTime(seconds: number): string {
  const ms = Math.floor((seconds % 1) * 1000);
  const totalSec = Math.floor(seconds);
  const s = totalSec % 60;
  const m = Math.floor(totalSec / 60) % 60;
  const h = Math.floor(totalSec / 3600);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(
    s
  ).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

function writeSrt(filePath: string, text: string, duration: number) {
  const wrapped = wrapText(text, 26).replace(/\\N/g, "\n");
  const srt = `1\n${formatSrtTime(0)} --> ${formatSrtTime(
    duration
  )}\n${wrapped}\n`;
  fs.writeFileSync(filePath, srt, "utf-8");
}

// Escape a filesystem path for safe use inside an ffmpeg filtergraph string
// (colons and backslashes are filtergraph metacharacters).
function escapeFilterPath(p: string): string {
  return p.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

// Resolve a usable ffmpeg binary: FFMPEG_PATH env override, then the
// ffmpeg-static download, then common system locations. Returns null if
// none exists (e.g. the postinstall download was blocked) — callers treat
// that as "video rendering unavailable" and fall back to text memes.
function resolveFfmpeg(): string | null {
  const candidates = [
    process.env.FFMPEG_PATH,
    ffmpegPath as unknown as string,
    "/usr/bin/ffmpeg",
    "/usr/local/bin/ffmpeg",
    "/opt/homebrew/bin/ffmpeg",
  ];
  for (const c of candidates) {
    if (c && fs.existsSync(c)) return c;
  }
  return null;
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const bin = resolveFfmpeg();
    if (!bin) {
      reject(
        new Error(
          "no ffmpeg binary available (ffmpeg-static download missing and no system ffmpeg / FFMPEG_PATH)"
        )
      );
      return;
    }
    const proc = spawn(bin, args);
    let stderr = "";
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-2000)}`));
    });
  });
}

async function downloadImage(url: string, destPath: string): Promise<boolean> {
  try {
    const res = await fetch(url);
    if (!res.ok) return false;
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(destPath, buf);
    return true;
  } catch {
    return false;
  }
}

export interface RenderOptions {
  id: string;
  caption: string;
  thumbnailUrl: string;
  isMockThumbnail: boolean;
  ttsScript: string;
  colorSeedIndex: number;
}

const GRADIENT_COLORS = [
  "0x1a1a2e",
  "0x2e1a3e",
  "0x1a2e2e",
  "0x2e2e1a",
  "0x1a2e3e",
  "0x3e1a2e",
];

export async function renderMeme(opts: RenderOptions): Promise<string> {
  ensureDir(GENERATED_DIR);
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "meme-"));
  const outFile = path.join(GENERATED_DIR, `${opts.id}.mp4`);
  const outUrl = `/generated/${opts.id}.mp4`;

  const duration = 6;
  const srtPath = path.join(tmpDir, "caption.srt");
  writeSrt(srtPath, opts.caption, duration);
  const fontDir = findFont() ? path.dirname(findFont() as string) : null;

  // Background input: real remote thumbnail is downloaded to a local file;
  // mock thumbnails (SVG data URIs) use a synthetic ffmpeg color background
  // instead, since ffmpeg-static has no SVG decoder.
  let bgArgs: string[];
  let localImage: string | null = null;
  if (!opts.isMockThumbnail && opts.thumbnailUrl.startsWith("http")) {
    const imgPath = path.join(tmpDir, "bg.jpg");
    const ok = await downloadImage(opts.thumbnailUrl, imgPath);
    if (ok) localImage = imgPath;
  }

  if (localImage) {
    bgArgs = ["-loop", "1", "-i", localImage];
  } else {
    const color = GRADIENT_COLORS[opts.colorSeedIndex % GRADIENT_COLORS.length];
    bgArgs = [
      "-f",
      "lavfi",
      "-i",
      `color=c=${color}:s=1080x1920:d=${duration}`,
    ];
  }

  // Audio: synthesized tone track (no TTS provider wired up) so every
  // rendered mp4 always has a valid audio stream.
  const audioArgs = [
    "-f",
    "lavfi",
    "-i",
    `sine=frequency=440:duration=${duration}`,
  ];

  // Burn captions in via the "subtitles" (libass) filter, since the
  // ffmpeg-static binary does not ship the drawtext filter. libass gives
  // us proper text wrapping, outline, and positioning out of the box.
  const style =
    "FontName=Arial,Fontsize=20,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000," +
    "BorderStyle=1,Outline=2,Shadow=0,Alignment=2,MarginV=180";
  const subtitlesFilter =
    `scale=1080:1920:force_original_aspect_ratio=increase,` +
    `crop=1080:1920,` +
    `subtitles=filename='${escapeFilterPath(srtPath)}':force_style='${style}'` +
    (fontDir ? `:fontsdir='${escapeFilterPath(fontDir)}'` : "");

  const args = [
    "-y",
    ...bgArgs,
    ...audioArgs,
    "-vf",
    subtitlesFilter,
    "-t",
    String(duration),
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-shortest",
    outFile,
  ];

  try {
    await runFfmpeg(args);
    return outUrl;
  } finally {
    fs.rm(tmpDir, { recursive: true, force: true }, () => {});
  }
}

// ---------------------------------------------------------------------------
// Comment Analyzer: generative video + audio memes
// ---------------------------------------------------------------------------

export interface GenerativeRenderOptions {
  id: string;
  caption: string;
  ttsScript: string;
  /** LLM-written text-to-video scene prompt derived from the comment */
  videoPrompt: string;
  thumbnailUrl: string;
  isMockThumbnail: boolean;
  colorSeedIndex: number;
}

export interface GenerativeRenderResult {
  url: string;
  /** which background source produced the video */
  backgroundSource: "video-gen-api" | "thumbnail-motion" | "procedural";
  /** true when a real TTS voiceover was synthesized (vs placeholder tone) */
  realVoice: boolean;
}

/**
 * Builds the audio input for a render: real TTS speech when
 * ELEVENLABS_API_KEY is configured, otherwise a placeholder tone. Returns
 * ffmpeg input args + whether the voice is real.
 */
async function buildAudio(
  ttsScript: string,
  tmpDir: string,
  duration: number
): Promise<{ args: string[]; realVoice: boolean }> {
  const speechPath = path.join(tmpDir, "voice.mp3");
  const ok = await synthesizeSpeech(ttsScript, speechPath);
  if (ok) {
    return { args: ["-i", speechPath], realVoice: true };
  }
  return {
    args: ["-f", "lavfi", "-i", `sine=frequency=440:duration=${duration}`],
    realVoice: false,
  };
}

/**
 * Renders a GENERATIVE-looking meme video. The comment itself is never
 * burned in — the LLM's original funny caption is; the comment only shaped
 * the videoPrompt. Background priority:
 *
 * 1. Real text-to-video API (VIDEO_GEN_API_URL/KEY) fed the videoPrompt —
 *    a genuinely generative AI clip.
 * 2. The video thumbnail animated with a ken-burns zoom + continuous hue
 *    drift, so it moves like generated footage instead of a static card.
 * 3. A procedural animated multi-color gradient (lavfi `gradients` source,
 *    seeded per comment) — no static frames anywhere.
 */
export async function renderGenerativeMeme(
  opts: GenerativeRenderOptions
): Promise<GenerativeRenderResult> {
  ensureDir(GENERATED_DIR);
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "genmeme-"));
  const outFile = path.join(GENERATED_DIR, `${opts.id}.mp4`);
  const outUrl = `/generated/${opts.id}.mp4`;

  const duration = 8;
  const srtPath = path.join(tmpDir, "caption.srt");
  writeSrt(srtPath, opts.caption, duration);
  const fontDir = findFont() ? path.dirname(findFont() as string) : null;

  const subtitles =
    `subtitles=filename='${escapeFilterPath(srtPath)}':force_style='` +
    "FontName=Arial,Fontsize=20,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000," +
    "BorderStyle=1,Outline=2,Shadow=0,Alignment=2,MarginV=180'" +
    (fontDir ? `:fontsdir='${escapeFilterPath(fontDir)}'` : "");

  let bgArgs: string[] = [];
  let filter = "";
  let backgroundSource: GenerativeRenderResult["backgroundSource"] =
    "procedural";

  // 1. Real generative video API
  if (hasVideoGenApi()) {
    const clipPath = path.join(tmpDir, "genclip.mp4");
    if (await generateVideoFromPrompt(opts.videoPrompt, clipPath)) {
      backgroundSource = "video-gen-api";
      bgArgs = ["-stream_loop", "-1", "-i", clipPath];
      filter =
        `scale=1080:1920:force_original_aspect_ratio=increase,` +
        `crop=1080:1920,${subtitles}`;
    }
  }

  // 2. Thumbnail with ken-burns motion + hue drift
  if (!bgArgs.length && !opts.isMockThumbnail && opts.thumbnailUrl.startsWith("http")) {
    const imgPath = path.join(tmpDir, "bg.jpg");
    if (await downloadImage(opts.thumbnailUrl, imgPath)) {
      backgroundSource = "thumbnail-motion";
      bgArgs = ["-loop", "1", "-framerate", "25", "-i", imgPath];
      filter =
        `scale=2160:3840:force_original_aspect_ratio=increase,crop=2160:3840,` +
        `zoompan=z='min(zoom+0.0012,1.4)':d=${duration * 25}` +
        `:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920:fps=25,` +
        `hue=H=0.3*t,${subtitles}`;
    }
  }

  // 3. Procedural animated gradients (always available)
  if (!bgArgs.length) {
    backgroundSource = "procedural";
    const seed = (opts.colorSeedIndex * 7919 + 13) % 100000;
    bgArgs = [
      "-f",
      "lavfi",
      "-i",
      `gradients=s=1080x1920:d=${duration}:speed=0.06:seed=${seed}:nb_colors=4`,
    ];
    filter = `hue=H=0.5*t,${subtitles}`;
  }

  const { args: audioArgs, realVoice } = await buildAudio(
    opts.ttsScript,
    tmpDir,
    duration
  );

  const args = [
    "-y",
    ...bgArgs,
    ...audioArgs,
    "-vf",
    filter,
    "-t",
    String(duration),
    "-r",
    "25",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-shortest",
    outFile,
  ];

  try {
    await runFfmpeg(args);
    return { url: outUrl, backgroundSource, realVoice };
  } finally {
    fs.rm(tmpDir, { recursive: true, force: true }, () => {});
  }
}

export interface AudioRenderResult {
  url: string;
  realVoice: boolean;
}

/**
 * Renders a funny AUDIO meme (mp3). With ELEVENLABS_API_KEY the LLM's
 * original voiceover script is spoken by a real TTS voice; without it a
 * placeholder tone is produced so the pipeline stays testable end-to-end.
 */
export async function renderAudioMeme(
  id: string,
  ttsScript: string
): Promise<AudioRenderResult> {
  ensureDir(GENERATED_DIR);
  const outFile = path.join(GENERATED_DIR, `${id}.mp3`);
  const outUrl = `/generated/${id}.mp3`;

  const spoken = await synthesizeSpeech(ttsScript, outFile);
  if (spoken) return { url: outUrl, realVoice: true };

  await runFfmpeg([
    "-y",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:duration=4",
    "-c:a",
    "libmp3lame",
    outFile,
  ]);
  return { url: outUrl, realVoice: false };
}
