"use client";

import { useState } from "react";
import { ContentType } from "@/lib/types";

interface Props {
  onSearch: (query: string, type: ContentType) => void;
  loading: boolean;
}

export default function SearchBar({ onSearch, loading }: Props) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState<ContentType>("video");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    onSearch(query.trim(), type);
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-col sm:flex-row gap-3 w-full max-w-2xl mx-auto"
    >
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Paste a YouTube video/short link, or search a topic..."
        className="flex-1 rounded-lg bg-panel border border-white/10 px-4 py-3 text-white placeholder-white/40 outline-none focus:border-accent transition-colors"
      />
      <div className="flex rounded-lg bg-panel border border-white/10 overflow-hidden">
        {(["video", "short"] as ContentType[]).map((t) => (
          <button
            type="button"
            key={t}
            onClick={() => setType(t)}
            className={`px-4 py-3 text-sm font-medium transition-colors ${
              type === t
                ? "bg-gradient-to-r from-accent to-accent2 text-white"
                : "text-white/60 hover:text-white"
            }`}
          >
            {t === "video" ? "Video" : "Short"}
          </button>
        ))}
      </div>
      <button
        type="submit"
        disabled={loading || !query.trim()}
        className="rounded-lg px-6 py-3 font-semibold bg-gradient-to-r from-accent to-accent2 disabled:opacity-40 hover:opacity-90 transition-opacity"
      >
        {loading ? "Searching..." : "Generate"}
      </button>
    </form>
  );
}
