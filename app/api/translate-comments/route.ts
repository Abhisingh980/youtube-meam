import { NextRequest, NextResponse } from "next/server";
import {
  translateAllComments,
  hasGroqKey,
  TRANSLATE_BATCH_SIZE,
} from "@/lib/translateComments";
import { FlatComment } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST { comments: FlatComment[] }
 *
 * Translates the EXACT text of every comment in the tree from English to
 * Hindi via Groq (LangChain), batched 50 comments per LLM call. This is a
 * faithful translation of the actual comments — unlike meme generation,
 * nothing is rewritten.
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

    if (!hasGroqKey()) {
      return NextResponse.json({
        translations: null,
        llmCalls: 0,
        message:
          "Hindi translation needs a GROQ_API_KEY (free at console.groq.com) — translation is never mocked, since it must be exact.",
      });
    }

    const { translations, llmCalls } = await translateAllComments(comments);
    return NextResponse.json({
      translations,
      llmCalls,
      batchSize: TRANSLATE_BATCH_SIZE,
      batches: Math.ceil(comments.length / TRANSLATE_BATCH_SIZE),
    });
  } catch (err: any) {
    console.error("translate-comments route error", err);
    return NextResponse.json(
      { error: err?.message || "Translation failed." },
      { status: 500 }
    );
  }
}
