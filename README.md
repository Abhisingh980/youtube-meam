# YouTube Meme Generator

Search YouTube for a topic, find the funniest comments, and generate short
vertical "video memes" (background + burned-in caption + voiceover) — all
built on Next.js 14 (App Router, TypeScript, Tailwind).

## Quick start

```bash
npm install
npm run dev
```

Open http://localhost:3000. **No API keys are required** — the app runs in
full demo/mock mode out of the box and still renders real, playable mp4
files.

## Adding real API keys

Copy `.env.example` to `.env` and fill in any subset of:

- `YOUTUBE_API_KEY` — enables real YouTube Data API v3 search + comments.
- `GROQ_API_KEY` (or comma-separated `GROQ_API_KEYS` for multiple keys,
  round-robin rotated) — enables real Groq-generated
  (`llama-3.3-70b-versatile`) captions, falls back to a template
  generator on any API error.

Audio is always a synthesized sine-wave tone via ffmpeg (no TTS provider
is integrated). Any key that's missing degrades that one piece of the
pipeline to its mock equivalent — the rest of the app is unaffected.

## Architecture

```
app/
  page.tsx                    client UI: search bar, grid, pagination
  api/search/route.ts         GET  ?query=&type=video|short&page=1-10
  api/generate-caption/route.ts POST { comment, videoTitle } -> caption
  api/render/route.ts         POST { caption, thumbnailUrl, ttsScript } -> mp4 url
components/
  SearchBar.tsx, MemeGrid.tsx, MemeCard.tsx, Pagination.tsx
lib/
  types.ts                    shared TS types
  youtube.ts                  real YouTube Data API v3 client
  mock.ts                     deterministic mock video/comment generator
  humorScore.ts                dependency-free heuristic humor scorer
  claude.ts                   Anthropic SDK caption generation + fallback
  captionFallback.ts          template-based caption generator
  tts.ts                      optional ElevenLabs TTS hook
  render.ts                   ffmpeg-static pipeline: image/color bg + subtitles + audio -> mp4
  cache.ts                    simple file cache (data/cache/) per query+type
```

### Pipeline per query

1. `/api/search` fetches (or mocks) up to 100 videos/shorts for the query,
   fetches (or mocks) each video's top comments, scores every comment with
   `lib/humorScore.ts` (a lightweight heuristic — NOT a real ML/BERT model:
   it rewards laugh tokens like "lmao"/"💀", meme slang, emoji density,
   caps/exclamation usage, a length sweet-spot, and like count), and picks
   the funniest comment per video. Results are paginated 10-per-page (10
   pages = 100 total) and cached to `data/cache/` for 6 hours per
   `query+type` so repeat page loads don't re-hit YouTube quota.
2. Each meme card independently calls `/api/generate-caption` with the
   chosen comment + video title. This calls Claude (`claude-sonnet-5`) to
   produce a punchy <=20-word caption and a short TTS script; on any error
   (missing key, bad response, rate limit, deprecated-model rejection) it
   falls back to `lib/captionFallback.ts`'s deterministic template
   generator.
3. Each card then calls `/api/render`, which uses `ffmpeg-static` (no
   system ffmpeg install required) to:
   - Build a background: a real thumbnail is downloaded and used as a
     still image; a mock thumbnail (an inline SVG data URI) instead uses
     an ffmpeg `color` source, since the bundled ffmpeg has no SVG
     decoder.
   - Burn in the caption using the `subtitles` (libass) filter with a
     generated `.srt` file. **Note:** ffmpeg-static's binary does not
     include the `drawtext` filter, so captions are burned in via
     libass subtitles instead — same visual result, no native
     dependency needed.
   - Mux in audio: if `ELEVENLABS_API_KEY` is set, real speech is
     synthesized via the ElevenLabs REST API; otherwise ffmpeg's own
     `sine` source generates a placeholder tone so every output mp4
     always has a valid audio stream.
   - Output is a 1080x1920, 6-second h264/aac mp4 saved to
     `public/generated/<id>.mp4` and served statically.
   - If rendering fails for any reason, the UI falls back to a static
     "image meme" (thumbnail + caption overlay) for that card instead of
     blocking the rest of the grid.

## Verified end-to-end

- `npm run build` completes with no TypeScript errors.
- `GET /api/search?query=funny+cats&type=video&page=1` returns 10 populated
  mock jobs in demo mode.
- `POST /api/render` with a mock (SVG data URI) thumbnail and with a real
  `https://i.ytimg.com/...` thumbnail both produced valid mp4 files in
  `public/generated/`, confirmed via `ffmpeg -i` to contain one h264 video
  stream (1080x1920) and one aac audio stream, 6.00s duration.

## Known limitations / gaps

- **YouTube quota**: `search.list` + `commentThreads.list` calls consume
  YouTube Data API v3 quota fast at 100 results/query; the file cache in
  `data/cache/` (6h TTL) mitigates repeat lookups but a fresh query still
  costs real quota when `YOUTUBE_API_KEY` is set.
- **TTS without a key**: without `ELEVENLABS_API_KEY` (or a future
  `OPENAI_API_KEY` TTS branch — the env var is read but no OpenAI TTS
  call is implemented yet, only ElevenLabs), audio is a synthesized tone,
  not real speech.
- **Humor scoring is a heuristic**, not a trained model — it's tuned for
  common English meme phrasing and emoji, and can misrank comments in
  other languages or unusual dialects.
- **No persistence/auth/database** — by design (MVP scope). Cache is
  file-based and unauthenticated; generated mp4s accumulate in
  `public/generated/` and are not automatically cleaned up.
- **Video duration is fixed at 6 seconds** for every meme, regardless of
  caption length; very long captions may get visually cramped by libass's
  auto-wrap.
