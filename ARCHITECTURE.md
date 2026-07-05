# Architecture

## What this app does

User types a topic and picks "video" or "short". The app finds the top
matching YouTube results, pulls their funniest comments, turns each into a
meme caption via an LLM, and renders a short vertical mp4 (background +
burned-in caption + tone track) for each one. Results are shown as a
paginated grid — 10 memes per page, 10 pages, 100 total.

## End-to-end flow

```
 ┌─────────────┐   1. search query + type        ┌──────────────────────┐
 │   Browser   │ ───────────────────────────────▶ │ GET /api/search       │
 │  (page.tsx) │                                  │ (app/api/search)      │
 └─────────────┘                                  └──────────┬────────────┘
        ▲                                                     │
        │                                          2. fetch videos/shorts
        │                                                     ▼
        │                                     ┌───────────────────────────┐
        │                                     │ YOUTUBE_API_KEY set?       │
        │                                     │  yes → lib/youtube.ts     │
        │                                     │        search.list +      │
        │                                     │        commentThreads.list│
        │                                     │  no  → lib/mock.ts        │
        │                                     │        fake videos +      │
        │                                     │        fake comments      │
        │                                     └──────────────┬────────────┘
        │                                                     │
        │                                       3. score every comment
        │                                                     ▼
        │                                     ┌───────────────────────────┐
        │                                     │ lib/humorScore.ts          │
        │                                     │ heuristic scorer (laugh    │
        │                                     │ tokens, meme slang, emoji, │
        │                                     │ caps/!!, length, likes)    │
        │                                     │ → pick funniest comment    │
        │                                     │   per video                │
        │                                     └──────────────┬────────────┘
        │                                                     │
        │                             4. cache page result (data/cache/,
        │                                keyed by query+type, 6h TTL)
        │                                                     │
        │  5. 10 "meme jobs" (video + comment) for this page   │
        └─────────────────────────────────────────────────────┘

 ┌──────────────────────────────────────────────────────────────────────┐
 │ For EACH of the 10 MemeCard components on the page, IN PARALLEL:      │
 │ (components/MemeCard.tsx fires its own fetches independently on mount)│
 └──────────────────────────────────────────────────────────────────────┘

 ┌─────────────┐  6. POST { comment, videoTitle }  ┌───────────────────────┐
 │  MemeCard   │ ─────────────────────────────────▶│ /api/generate-caption │
 └─────────────┘                                   └──────────┬────────────┘
        ▲                                                     │
        │                                       7. generate caption + tts script
        │                                                     ▼
        │                                     ┌───────────────────────────┐
        │                                     │ GROQ_API_KEY(S) set?       │
        │                                     │  yes → lib/groq.ts         │
        │                                     │   POST api.groq.com/       │
        │                                     │   openai/v1/chat/          │
        │                                     │   completions              │
        │                                     │   model: llama-3.3-        │
        │                                     │   70b-versatile             │
        │                                     │   round-robins across keys, │
        │                                     │   retries next key on      │
        │                                     │   401/429/error             │
        │                                     │  no/fail → captionFallback │
        │                                     │   .ts template generator    │
        │                                     └──────────────┬────────────┘
        │                                                     │
        │           8. { caption, ttsScript, source }          │
        └─────────────────────────────────────────────────────┘

 ┌─────────────┐  9. POST { caption, thumbnailUrl, │ ┌───────────────────────┐
 │  MemeCard   │     ttsScript, ... }              ▶│ /api/render           │
 └─────────────┘                                    └──────────┬────────────┘
        ▲                                                      │
        │                                      10. render mp4 with ffmpeg
        │                                                      ▼
        │                                    ┌────────────────────────────┐
        │                                    │ lib/render.ts               │
        │                                    │  - download thumbnail (or   │
        │                                    │    synth color bg for mock) │
        │                                    │  - write .srt from caption   │
        │                                    │  - burn captions in via      │
        │                                    │    "subtitles" (libass)      │
        │                                    │    filter                    │
        │                                    │  - sine-wave tone as audio   │
        │                                    │    track (no TTS provider)   │
        │                                    │  - encode 1080x1920 mp4      │
        │                                    │    (libx264 + aac) via       │
        │                                    │    ffmpeg-static binary      │
        │                                    │  - save to                   │
        │                                    │    public/generated/*.mp4    │
        │                                    └──────────────┬─────────────┘
        │                                                    │
        │              11. { url: "/generated/<id>.mp4" }      │
        └──────────────────────────────────────────────────────┘

 12. MemeCard renders the <video> player pointing at that url.
 13. Page's pagination control (1-10) re-triggers /api/search for the next
     page's 10 jobs (served from cache if already fetched this session).
```

## Why generation is parallel

Each `MemeCard` is an independent React component that starts its own
caption → render fetch chain the moment it mounts (`useEffect` with a
`started` guard so React strict-mode double-invoke doesn't double-fire).
Since a page renders 10 `MemeCard`s at once, all 10 caption requests (and
then all 10 render requests) go out concurrently — no explicit
`Promise.all` orchestration needed, the browser just does one fetch per
card in parallel.

On the Groq side, `lib/groq.ts` keeps a round-robin index over however
many keys are in `GROQ_API_KEYS` (comma-separated) so those 10 concurrent
requests spread themselves across your key pool instead of hammering one
key into a rate limit; if a given key 401s/429s or errors, that same
request retries the next key in the pool before giving up and falling
back to the template caption generator.

## Key files

| File | Responsibility |
|---|---|
| `app/page.tsx` | Client UI shell: search bar, mock-mode banner, grid, pagination |
| `components/SearchBar.tsx` | Query input + video/short toggle |
| `components/MemeGrid.tsx` / `MemeCard.tsx` | Renders 10 cards/page; each card owns its own caption→render fetch chain |
| `components/Pagination.tsx` | Page 1-10 selector |
| `app/api/search/route.ts` | Orchestrates YouTube fetch (or mock) + humor scoring + caching, returns 10 jobs for a page |
| `app/api/generate-caption/route.ts` | Thin route wrapper around `lib/groq.ts` |
| `app/api/render/route.ts` | Thin route wrapper around `lib/render.ts` |
| `lib/youtube.ts` | Real YouTube Data API v3 client (search.list, commentThreads.list) |
| `lib/mock.ts` | Deterministic fake videos/comments/thumbnails for demo mode |
| `lib/humorScore.ts` | Dependency-free heuristic comment scorer |
| `lib/groq.ts` | Groq chat-completions client, multi-key round-robin, retry-on-failure |
| `lib/captionFallback.ts` | Deterministic template caption generator (used when no Groq key, or Groq call fails) |
| `lib/render.ts` | ffmpeg pipeline: background + burned-in subtitles + tone audio → mp4 |
| `lib/cache.ts` | File-based cache (`data/cache/`) keyed by query+type, 6h TTL |

## Environment keys (only two, both optional)

- `YOUTUBE_API_KEY` — real YouTube search/comments; omitted → `lib/mock.ts`.
- `GROQ_API_KEY` or `GROQ_API_KEYS` (comma-separated) — real
  `llama-3.3-70b-versatile` captions via Groq; omitted/failed →
  `lib/captionFallback.ts` template captions.

No other provider keys exist in this app. There is no TTS provider
integration — audio is always a synthesized tone via ffmpeg.
