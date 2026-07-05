"use client";

import { useMemo, useState } from "react";
import CommentTreeView from "@/components/CommentTreeView";
import {
  CommentAnalysis,
  CommentSectionResult,
  FlatComment,
} from "@/lib/types";

/**
 * Video memes are capped at 10 initially ("currently only for 10") — the
 * user can unlock 10 more on demand whenever they want to go further.
 */
const INITIAL_VIDEO_LIMIT = 10;

interface MemeState {
  status:
    | "idle"
    | "generating"
    | "rendering"
    | "video"
    | "audio"
    | "text"
    | "error";
  caption?: string;
  ttsScript?: string;
  videoPrompt?: string;
  imageContext?: string;
  videoUrl?: string;
  audioUrl?: string;
  backgroundSource?: string;
  realVoice?: boolean;
  source?: string;
  error?: string;
}

type MemeMode = "video" | "audio" | "text";

export default function CommentAnalyzerPage() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");
  const [section, setSection] = useState<CommentSectionResult | null>(null);
  const [analyses, setAnalyses] = useState<Map<number, CommentAnalysis> | null>(
    null
  );
  const [analysisMeta, setAnalysisMeta] = useState<{
    llmCalls: number;
    batches: number;
    usedLLM: boolean;
  } | null>(null);
  const [memes, setMemes] = useState<Map<number, MemeState>>(new Map());
  const [videoLimit, setVideoLimit] = useState(INITIAL_VIDEO_LIMIT);
  const [tab, setTab] = useState<"tree" | "funny">("tree");
  const [lang, setLang] = useState<"en" | "hi">("en");
  const [translations, setTranslations] = useState<Record<
    number,
    string
  > | null>(null);
  const [translating, setTranslating] = useState(false);
  const [translateNote, setTranslateNote] = useState("");

  const funnyRanked = useMemo(() => {
    if (!section || !analyses) return [];
    return section.comments
      .map((c) => ({ c, a: analyses.get(c.index) }))
      .filter((x): x is { c: FlatComment; a: CommentAnalysis } => !!x.a)
      .sort((x, y) => y.a.funnyScore - x.a.funnyScore);
  }, [section, analyses]);

  const galiCount = useMemo(() => {
    if (!analyses) return 0;
    let n = 0;
    analyses.forEach((a) => a.isGali && n++);
    return n;
  }, [analyses]);

  async function runAnalysis(comments: FlatComment[]) {
    setAnalyzing(true);
    try {
      const res = await fetch("/api/analyze-comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comments }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "analysis failed");
      const map = new Map<number, CommentAnalysis>();
      for (const a of json.analyses as CommentAnalysis[]) map.set(a.index, a);
      setAnalyses(map);
      setAnalysisMeta({
        llmCalls: json.llmCalls,
        batches: json.batches,
        usedLLM: json.usedLLM,
      });
    } catch (err: any) {
      setError(err?.message || "analysis failed");
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim() || loading) return;
    setLoading(true);
    setError("");
    setFlash("");
    setSection(null);
    setAnalyses(null);
    setAnalysisMeta(null);
    setMemes(new Map());
    setVideoLimit(INITIAL_VIDEO_LIMIT);
    setTranslations(null);
    setTranslateNote("");
    setLang("en");
    try {
      const res = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "failed to load comments");
      const result = json as CommentSectionResult;
      setSection(result);
      if (result.message) {
        // zero comments — flash it, nothing to analyze
        setFlash(result.message);
      } else {
        setTab("tree");
        await runAnalysis(result.comments);
      }
    } catch (err: any) {
      setError(err?.message || "something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function handleTranslate() {
    if (!section || translating) return;
    // toggle back to English without refetching
    if (lang === "hi") {
      setLang("en");
      return;
    }
    if (translations) {
      setLang("hi");
      return;
    }
    setTranslating(true);
    setTranslateNote("");
    try {
      const res = await fetch("/api/translate-comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comments: section.comments }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "translation failed");
      if (!json.translations) {
        setTranslateNote(json.message || "Translation unavailable.");
        return;
      }
      setTranslations(json.translations);
      setLang("hi");
      setTranslateNote(
        `Translated exactly, ${json.batches} batch${
          json.batches > 1 ? "es" : ""
        } of ≤50 → ${json.llmCalls} LLM call${json.llmCalls > 1 ? "s" : ""}`
      );
    } catch (err: any) {
      setTranslateNote(err?.message || "translation failed");
    } finally {
      setTranslating(false);
    }
  }

  function setMeme(index: number, state: MemeState) {
    setMemes((prev) => {
      const next = new Map(prev);
      next.set(index, state);
      return next;
    });
  }

  async function makeMeme(c: FlatComment, mode: MemeMode) {
    if (!section) return;
    setMeme(c.index, { status: "generating" });
    try {
      // LLM call #2: ORIGINAL funny content — the comment is context only,
      // never copied letter-for-letter into the meme.
      const genRes = await fetch("/api/generate-funny", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          comment: c.text,
          videoTitle: section.video.title,
          thumbnailUrl: section.video.isMock
            ? undefined
            : section.video.thumbnail,
        }),
      });
      const gen = await genRes.json();
      if (!genRes.ok) throw new Error(gen.error || "generation failed");

      if (mode === "text") {
        setMeme(c.index, { status: "text", ...gen });
        return;
      }

      setMeme(c.index, { status: "rendering", ...gen });
      const renderRes = await fetch("/api/render-meme", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: mode,
          id: `analyzer_${section.video.id}_${c.index}_${mode}`,
          caption: gen.caption,
          ttsScript: gen.ttsScript,
          videoPrompt: gen.videoPrompt,
          thumbnailUrl: section.video.thumbnail,
          isMockThumbnail: section.video.isMock,
          colorSeedIndex: c.index,
        }),
      });
      const render = await renderRes.json();
      if (renderRes.ok && render.url) {
        if (mode === "audio") {
          setMeme(c.index, {
            status: "audio",
            ...gen,
            audioUrl: render.url,
            realVoice: render.realVoice,
          });
        } else {
          setMeme(c.index, {
            status: "video",
            ...gen,
            videoUrl: render.url,
            backgroundSource: render.backgroundSource,
            realVoice: render.realVoice,
          });
        }
      } else {
        // rendering unavailable -> degrade to TEXT format meme
        setMeme(c.index, { status: "text", ...gen });
      }
    } catch (err: any) {
      setMeme(c.index, {
        status: "error",
        error: err?.message || "meme generation failed",
      });
    }
  }

  return (
    <main className="max-w-5xl mx-auto px-4 py-10">
      <div className="text-center mb-8">
        <h1 className="text-3xl sm:text-4xl font-extrabold bg-gradient-to-r from-accent to-accent2 bg-clip-text text-transparent">
          YouTube Comment Analyzer
        </h1>
        <p className="text-white/50 mt-2 text-sm">
          Paste any YouTube video or Shorts link — we skip the video and go
          straight to the comment section: full nested tree, LLM funniness +
          gali analysis (50 comments per call), and meme generation.
        </p>
        <a
          href="/memes"
          className="text-accent text-xs underline mt-2 inline-block"
        >
          → topic-search meme generator
        </a>
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2 max-w-2xl mx-auto">
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.youtube.com/watch?v=...  or  youtube.com/shorts/..."
          className="flex-1 bg-white/5 border border-white/15 rounded-xl px-4 py-3 text-sm outline-none focus:border-accent placeholder:text-white/25"
        />
        <button
          type="submit"
          disabled={loading || analyzing}
          className="bg-gradient-to-r from-accent to-accent2 rounded-xl px-6 py-3 text-sm font-semibold disabled:opacity-40"
        >
          {loading ? "Loading..." : "Analyze"}
        </button>
      </form>

      {error && (
        <p className="text-center text-sm text-red-400 mt-6">{error}</p>
      )}

      {flash && (
        <div className="text-center mt-10">
          <p className="inline-block bg-yellow-500/15 text-yellow-300 border border-yellow-500/30 rounded-xl px-6 py-4 text-lg font-semibold animate-pulse">
            {flash}
          </p>
        </div>
      )}

      {section?.mockMode && (
        <p className="text-center text-xs text-yellow-400/80 mt-4">
          Demo mode (no YOUTUBE_API_KEY) — showing a generated mock comment
          section for this link.
        </p>
      )}

      {section && !flash && (
        <div className="mt-8">
          <div className="flex items-center gap-4 bg-white/5 border border-white/10 rounded-xl p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={section.video.thumbnail}
              alt=""
              className="w-24 h-16 object-cover rounded-lg"
            />
            <div className="min-w-0">
              <p className="font-semibold truncate">{section.video.title}</p>
              <p className="text-xs text-white/40">
                {section.video.channelTitle} · {section.totalTopLevel} comments
                · {section.totalWithReplies - section.totalTopLevel} nested
                replies · {section.totalWithReplies} total
              </p>
              {analysisMeta && (
                <p className="text-xs text-accent/80 mt-1">
                  Analyzed in {analysisMeta.batches} batch
                  {analysisMeta.batches > 1 ? "es" : ""} of ≤50 →{" "}
                  {analysisMeta.usedLLM
                    ? `${analysisMeta.llmCalls} Groq LLM call${
                        analysisMeta.llmCalls > 1 ? "s" : ""
                      } (LangChain)`
                    : "heuristic fallback (no GROQ key)"}{" "}
                  · {galiCount} gali/abusive flagged
                </p>
              )}
            </div>
          </div>

          {analyzing && (
            <p className="text-center text-white/50 mt-6 animate-pulse">
              Running LLM analysis in batches of 50 comments...
            </p>
          )}

          {!analyzing && (
            <>
              <div className="flex gap-2 mt-6">
                <button
                  onClick={() => setTab("tree")}
                  className={`px-4 py-2 rounded-lg text-sm ${
                    tab === "tree"
                      ? "bg-accent/20 text-accent border border-accent/40"
                      : "bg-white/5 text-white/50 border border-white/10"
                  }`}
                >
                  Comment Tree ({section.totalWithReplies})
                </button>
                <button
                  onClick={() => setTab("funny")}
                  disabled={!analyses}
                  className={`px-4 py-2 rounded-lg text-sm disabled:opacity-40 ${
                    tab === "funny"
                      ? "bg-accent/20 text-accent border border-accent/40"
                      : "bg-white/5 text-white/50 border border-white/10"
                  }`}
                >
                  Funny Board → Memes
                </button>
              </div>

              {tab === "tree" && (
                <div className="mt-4">
                  <div className="flex flex-wrap items-center gap-3 mb-3">
                    <button
                      onClick={handleTranslate}
                      disabled={translating}
                      className="text-xs bg-white/10 border border-white/20 rounded-lg px-4 py-2 disabled:opacity-40"
                    >
                      {translating
                        ? "Translating exact comments (batches of 50)..."
                        : lang === "hi"
                          ? "🔤 Show English (original)"
                          : "🇮🇳 अनुवाद — translate tree to Hindi"}
                    </button>
                    {lang === "hi" && (
                      <span className="text-xs text-accent/80">
                        Showing exact Hindi translation of every comment
                      </span>
                    )}
                    {translateNote && (
                      <span className="text-xs text-white/40">
                        {translateNote}
                      </span>
                    )}
                  </div>
                  <CommentTreeView
                    comments={section.comments}
                    analyses={analyses}
                    translations={translations}
                    lang={lang}
                  />
                </div>
              )}

              {tab === "funny" && analyses && (
                <div className="mt-4 space-y-3">
                  <p className="text-xs text-white/40">
                    Ranked by LLM funniness. The comment is used as CONTEXT
                    only — the LLM writes original funny content, then renders
                    it as a generative video, funny audio, or text (your
                    choice). Video generation is enabled for the top{" "}
                    {videoLimit} — unlock more on demand below.
                  </p>
                  {funnyRanked.map(({ c, a }, rank) => {
                    const meme = memes.get(c.index);
                    const videoAllowed = rank < videoLimit;
                    return (
                      <div
                        key={c.id}
                        className="bg-white/5 border border-white/10 rounded-xl p-4"
                      >
                        <div className="flex flex-wrap items-center gap-2 text-xs text-white/40">
                          <span className="font-mono text-accent">
                            #{rank + 1}
                          </span>
                          <span className="bg-green-500/20 text-green-300 px-1.5 py-0.5 rounded">
                            😂 {a.funnyScore}/10
                          </span>
                          <span
                            className={`px-1.5 py-0.5 rounded ${
                              a.isGali
                                ? "bg-red-500/20 text-red-300"
                                : "bg-white/10 text-white/40"
                            }`}
                          >
                            🤬 {a.galiScore}/10
                          </span>
                          <span className="italic">{a.reason}</span>
                        </div>
                        <p className="text-sm mt-2">{c.text}</p>

                        <div className="flex flex-wrap gap-2 mt-3">
                          {(!meme ||
                            meme.status === "idle" ||
                            meme.status === "error") && (
                            <>
                              {videoAllowed && (
                                <button
                                  onClick={() => makeMeme(c, "video")}
                                  className="text-xs bg-gradient-to-r from-accent to-accent2 rounded-lg px-3 py-1.5 font-semibold"
                                >
                                  🎬 Generative video
                                </button>
                              )}
                              <button
                                onClick={() => makeMeme(c, "audio")}
                                className="text-xs bg-white/10 rounded-lg px-3 py-1.5"
                              >
                                🎙 Funny audio
                              </button>
                              <button
                                onClick={() => makeMeme(c, "text")}
                                className="text-xs bg-white/10 rounded-lg px-3 py-1.5"
                              >
                                📝 Text meme
                              </button>
                            </>
                          )}
                          {meme?.status === "generating" && (
                            <span className="text-xs text-white/50 animate-pulse">
                              Writing original funny content (comment used as
                              context, LLM call #2)...
                            </span>
                          )}
                          {meme?.status === "rendering" && (
                            <span className="text-xs text-white/50 animate-pulse">
                              Rendering generative video/audio...
                            </span>
                          )}
                        </div>

                        {meme?.status === "error" && (
                          <p className="text-xs text-red-400 mt-2">
                            {meme.error}
                          </p>
                        )}

                        {(meme?.status === "text" ||
                          meme?.status === "video" ||
                          meme?.status === "audio") && (
                          <div className="mt-3 bg-black/30 rounded-lg p-3">
                            <p className="text-sm font-semibold text-accent">
                              {meme.caption}
                            </p>
                            <p className="text-xs text-white/50 mt-1">
                              🎙 {meme.ttsScript}
                            </p>
                            {meme.videoPrompt && (
                              <p className="text-[10px] text-white/35 mt-1">
                                🎥 video prompt: {meme.videoPrompt}
                              </p>
                            )}
                            {meme.imageContext && (
                              <p className="text-[10px] text-white/30 mt-1">
                                🖼 PaliGemma saw: {meme.imageContext}
                              </p>
                            )}
                            <p className="text-[10px] text-white/25 mt-1">
                              source: {meme.source} · original content —
                              comment used as context only
                              {meme.status === "text" &&
                                " · text format (render unavailable/not requested)"}
                              {meme.status === "video" &&
                                meme.backgroundSource &&
                                ` · background: ${meme.backgroundSource}`}
                              {(meme.status === "video" ||
                                meme.status === "audio") &&
                                ` · voice: ${
                                  meme.realVoice
                                    ? "real TTS"
                                    : "placeholder tone (add ELEVENLABS_API_KEY)"
                                }`}
                            </p>
                            {meme.status === "video" && meme.videoUrl && (
                              <video
                                src={meme.videoUrl}
                                controls
                                className="mt-2 w-48 rounded-lg"
                              />
                            )}
                            {meme.status === "audio" && meme.audioUrl && (
                              <audio
                                src={meme.audioUrl}
                                controls
                                className="mt-2 w-full max-w-xs"
                              />
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {funnyRanked.length > videoLimit && (
                    <div className="text-center pt-2">
                      <button
                        onClick={() =>
                          setVideoLimit((v) => v + INITIAL_VIDEO_LIMIT)
                        }
                        className="text-xs bg-white/10 border border-white/20 rounded-lg px-4 py-2"
                      >
                        🔓 Unlock video generation for {INITIAL_VIDEO_LIMIT}{" "}
                        more (on demand)
                      </button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {!section && !loading && !error && (
        <div className="text-center text-white/30 mt-20 text-sm">
          Paste a link above — the video itself is skipped, only its comment
          section is analyzed.
        </div>
      )}
    </main>
  );
}
