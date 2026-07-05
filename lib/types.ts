export type ContentType = "video" | "short";

export interface VideoInfo {
  id: string;
  title: string;
  channelTitle: string;
  thumbnail: string;
  url: string;
  isMock: boolean;
}

export interface CommentInfo {
  id: string;
  text: string;
  author: string;
  likeCount: number;
  humorScore: number;
}

export interface MemeJob {
  index: number; // 0-99 global rank
  video: VideoInfo;
  comment: CommentInfo;
}

export interface CaptionResult {
  caption: string;
  ttsScript: string;
  source: "groq" | "template";
}

export interface RenderResult {
  url: string;
  mock: boolean;
  error?: string;
}

// ---------------------------------------------------------------------------
// Comment Analyzer types (paste-a-link -> full comment tree -> LLM analysis)
// ---------------------------------------------------------------------------

/**
 * One comment in the flattened comment-section list. Nested replies are
 * tracked by reference: every top-level comment stores threadStart /
 * threadEnd — the flat-array index range [threadStart, threadEnd] that its
 * whole thread (itself + all nested replies) occupies — so the tree can be
 * reconstructed from the flat list at any time.
 */
export interface FlatComment {
  /** index of this comment in the flat list (0-based) */
  index: number;
  id: string;
  parentId: string | null; // null = top-level comment
  depth: number; // 0 = top-level, 1 = reply
  text: string;
  author: string;
  likeCount: number;
  publishedAt: string;
  /** flat index where this comment's thread starts (== index for replies) */
  threadStart: number;
  /** flat index where this comment's thread ends (inclusive) */
  threadEnd: number;
  replyCount: number;
}

/** Per-comment LLM verdict: funniness + gali (abuse/profanity) scoring. */
export interface CommentAnalysis {
  index: number;
  funnyScore: number; // 0-10
  galiScore: number; // 0-10 (abusive / profane / gali language)
  isFunny: boolean;
  isGali: boolean;
  reason: string;
  source: "llm" | "heuristic";
}

export interface AnalyzedComment extends FlatComment {
  analysis: CommentAnalysis;
}

export interface CommentSectionResult {
  video: VideoInfo;
  comments: FlatComment[];
  totalTopLevel: number;
  totalWithReplies: number;
  mockMode: boolean;
  /** set when the video has zero comments — UI flashes this */
  message?: string;
}

export interface FunnyGeneration {
  /** ORIGINAL funny content written by the LLM — the source comment is
   * used only as context/inspiration, never copied letter-for-letter. */
  caption: string;
  ttsScript: string;
  /** generative-AI scene prompt derived from the comment — fed to the
   * video generator (real text-to-video API if configured, otherwise the
   * procedural animated ffmpeg renderer). */
  videoPrompt: string;
  source: "groq" | "template";
  /** optional NVIDIA PaliGemma description of the video thumbnail */
  imageContext?: string;
}
