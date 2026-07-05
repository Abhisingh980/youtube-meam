"use client";

import { FlatComment, CommentAnalysis } from "@/lib/types";

interface Props {
  comments: FlatComment[];
  analyses: Map<number, CommentAnalysis> | null;
  /** exact Hindi translations keyed by flat comment index */
  translations?: Record<number, string> | null;
  /** which language to display comment text in */
  lang?: "en" | "hi";
}

function ScoreBadge({ a }: { a: CommentAnalysis }) {
  return (
    <span className="ml-2 inline-flex items-center gap-1 text-[10px]">
      <span
        className={`px-1.5 py-0.5 rounded ${
          a.funnyScore >= 6
            ? "bg-green-500/20 text-green-300"
            : "bg-white/10 text-white/50"
        }`}
        title={a.reason}
      >
        😂 {a.funnyScore}/10
      </span>
      <span
        className={`px-1.5 py-0.5 rounded ${
          a.galiScore >= 4
            ? "bg-red-500/20 text-red-300"
            : "bg-white/10 text-white/40"
        }`}
        title={a.reason}
      >
        🤬 {a.galiScore}/10
      </span>
      {a.source === "heuristic" && (
        <span className="text-white/25" title="heuristic fallback (no LLM)">
          ~
        </span>
      )}
    </span>
  );
}

/**
 * Renders the comment section as a TREE: top-level comments at depth 0,
 * nested replies indented beneath them. Each top-level comment shows its
 * thread reference [#start → #end] — the flat-index range its nested
 * thread occupies — exactly as stored by the fetcher.
 */
export default function CommentTreeView({
  comments,
  analyses,
  translations,
  lang = "en",
}: Props) {
  return (
    <div className="space-y-1 text-sm">
      {comments.map((c) => {
        const a = analyses?.get(c.index) || null;
        const isTop = c.depth === 0;
        const hindi = translations?.[c.index];
        const displayText = lang === "hi" && hindi ? hindi : c.text;
        const missingTranslation = lang === "hi" && !hindi;
        return (
          <div
            key={c.id}
            className={`rounded-lg px-3 py-2 ${
              isTop
                ? "bg-white/5 border border-white/10"
                : "ml-8 bg-white/[0.03] border-l-2 border-accent/40"
            }`}
          >
            <div className="flex flex-wrap items-center gap-x-2 text-xs text-white/40">
              <span className="font-mono text-white/30">#{c.index}</span>
              <span className="font-medium text-white/60">{c.author}</span>
              <span>👍 {c.likeCount}</span>
              {isTop && (
                <span
                  className="font-mono text-accent/70"
                  title="flat-index range this thread occupies (start → end)"
                >
                  thread [#{c.threadStart} → #{c.threadEnd}]
                  {c.replyCount > 0 ? ` · ${c.replyCount} replies` : ""}
                </span>
              )}
              {!isTop && (
                <span className="font-mono text-white/25">
                  ↳ reply of #{c.threadStart}
                </span>
              )}
              {a && <ScoreBadge a={a} />}
            </div>
            <p className="text-white/85 mt-1 whitespace-pre-wrap break-words">
              {displayText}
              {missingTranslation && (
                <span
                  className="text-white/25 text-xs ml-1"
                  title="translation unavailable for this comment — showing original"
                >
                  (मूल)
                </span>
              )}
            </p>
          </div>
        );
      })}
    </div>
  );
}
