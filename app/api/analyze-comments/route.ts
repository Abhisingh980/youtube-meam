import { NextRequest, NextResponse } from "next/server";
import { analyzeAllComments, BATCH_SIZE } from "@/lib/analyzeComments";
import { FlatComment } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST { comments: FlatComment[] }
 *
 * LLM call #1 of the pipeline: the whole comment section is divided into
 * batches of 50 comments and each batch is analyzed with a SINGLE Groq LLM
 * call (via LangChain) for funniness + gali (abusive language) scores.
 * Falls back to heuristic scoring per batch if the LLM is unavailable.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const comments = (body?.comments || []) as FlatComment[];
    if (!Array.isArray(comments) || comments.length === 0) {
      return NextResponse.json(
        { error: "comments array is required" },
        { status: 400 }
      );
    }
    if (comments.length > 1000) {
      return NextResponse.json(
        { error: "too many comments (max 1000)" },
        { status: 400 }
      );
    }

    const { analyses, llmCalls, usedLLM } = await analyzeAllComments(comments);

    return NextResponse.json({
      analyses,
      llmCalls,
      usedLLM,
      batchSize: BATCH_SIZE,
      batches: Math.ceil(comments.length / BATCH_SIZE),
    });
  } catch (err: any) {
    console.error("analyze-comments route error", err);
    return NextResponse.json(
      { error: err?.message || "Analysis failed." },
      { status: 500 }
    );
  }
}
