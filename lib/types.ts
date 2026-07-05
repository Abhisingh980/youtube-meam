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
