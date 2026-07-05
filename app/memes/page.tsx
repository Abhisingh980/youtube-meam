"use client";

import { useState } from "react";
import SearchBar from "@/components/SearchBar";
import MemeGrid from "@/components/MemeGrid";
import Pagination from "@/components/Pagination";
import { ContentType, MemeJob } from "@/lib/types";

export default function MemeSearchPage() {
  const [query, setQuery] = useState("");
  const [type, setType] = useState<ContentType>("video");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(10);
  const [jobs, setJobs] = useState<MemeJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [mockMode, setMockMode] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  async function runSearch(q: string, t: ContentType, p: number) {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `/api/search?query=${encodeURIComponent(q)}&type=${t}&page=${p}`
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "search failed");
      setJobs(json.jobs);
      setTotalPages(json.totalPages);
      setMockMode(json.mockMode);
      setHasSearched(true);
    } catch (err: any) {
      setError(err?.message || "something went wrong");
      setJobs([]);
    } finally {
      setLoading(false);
    }
  }

  function handleSearch(q: string, t: ContentType) {
    setQuery(q);
    setType(t);
    setPage(1);
    runSearch(q, t, 1);
  }

  function handlePageChange(p: number) {
    setPage(p);
    runSearch(query, type, p);
  }

  return (
    <main className="max-w-7xl mx-auto px-4 py-10">
      <div className="text-center mb-8">
        <h1 className="text-3xl sm:text-4xl font-extrabold bg-gradient-to-r from-accent to-accent2 bg-clip-text text-transparent">
          YouTube Meme Generator
        </h1>
        <p className="text-white/50 mt-2 text-sm">
          Search a topic, we find the funniest comments and turn them into
          video memes.
        </p>
        <a href="/" className="text-accent text-xs underline mt-2 inline-block">
          ← back to Comment Analyzer
        </a>
      </div>

      <SearchBar onSearch={handleSearch} loading={loading} />

      {mockMode && hasSearched && (
        <p className="text-center text-xs text-yellow-400/80 mt-4">
          Running in demo mode (no YOUTUBE_API_KEY / GROQ_API_KEY set) —
          showing generated mock videos, comments, and captions.
        </p>
      )}

      {error && (
        <p className="text-center text-sm text-red-400 mt-6">{error}</p>
      )}

      {loading && (
        <p className="text-center text-white/50 mt-10">
          Fetching top results for "{query}"...
        </p>
      )}

      {!loading && hasSearched && !error && (
        <div className="mt-10">
          <MemeGrid jobs={jobs} />
          <Pagination
            page={page}
            totalPages={totalPages}
            onChange={handlePageChange}
            disabled={loading}
          />
        </div>
      )}

      {!hasSearched && !loading && (
        <div className="text-center text-white/30 mt-20 text-sm">
          Enter a query above to get started.
        </div>
      )}
    </main>
  );
}
