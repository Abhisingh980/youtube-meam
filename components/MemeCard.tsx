"use client";

import { useEffect, useRef, useState } from "react";
import { MemeJob } from "@/lib/types";

interface Props {
  job: MemeJob;
}

type Stage = "captioning" | "rendering" | "done" | "error";

export default function MemeCard({ job }: Props) {
  const [stage, setStage] = useState<Stage>("captioning");
  const [caption, setCaption] = useState<string>("");
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    (async () => {
      try {
        const capRes = await fetch("/api/generate-caption", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            comment: job.comment.text,
            videoTitle: job.video.title,
          }),
        });
        const capJson = await capRes.json();
        if (!capRes.ok) throw new Error(capJson.error || "caption failed");
        setCaption(capJson.caption);
        setStage("rendering");

        const renderRes = await fetch("/api/render", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: `meme_${job.video.id}_${job.index}`,
            caption: capJson.caption,
            ttsScript: capJson.ttsScript,
            thumbnailUrl: job.video.thumbnail,
            isMockThumbnail: job.video.isMock,
            colorSeedIndex: job.index,
          }),
        });
        const renderJson = await renderRes.json();
        if (!renderRes.ok || !renderJson.url) {
          throw new Error(renderJson.error || "render failed");
        }
        setVideoUrl(renderJson.url);
        setStage("done");
      } catch (err: any) {
        console.error(err);
        setErrorMsg(err?.message || "something went wrong");
        setStage("error");
      }
    })();
  }, [job]);

  return (
    <div className="rounded-xl overflow-hidden bg-panel border border-white/10 flex flex-col">
      {/* Video is a bonus once it's ready; the funny comment-thread text
          is the primary content and is always shown regardless of
          whether rendering succeeds. */}
      <div className="relative aspect-[9/16] bg-black">
        {stage === "done" && videoUrl ? (
          <video
            src={videoUrl}
            controls
            loop
            muted
            playsInline
            className="w-full h-full object-cover"
          />
        ) : (
          <img
            src={job.video.thumbnail}
            alt={job.video.title}
            className="w-full h-full object-cover opacity-50"
          />
        )}

        {/* Comment-thread tree overlay: original comment -> AI reply */}
        <div className="absolute inset-0 flex flex-col justify-end gap-2 p-3 bg-gradient-to-t from-black/90 via-black/40 to-transparent pointer-events-none">
          <div className="rounded-lg bg-white/10 backdrop-blur-sm px-3 py-2 text-xs text-white/90">
            <span className="text-white/40 mr-1">💬 Viewer</span>
            {job.comment.text}
          </div>
          <div className="flex items-center gap-1 pl-3 text-white/30 text-[10px]">
            <span>└─ reply</span>
          </div>
          <div className="rounded-lg bg-gradient-to-r from-accent/30 to-accent2/30 border border-white/10 px-3 py-2 text-xs font-semibold text-white ml-3">
            {stage === "captioning" ? (
              <span className="text-white/50 font-normal">writing a funny reply...</span>
            ) : (
              caption || job.comment.text
            )}
          </div>
        </div>

        {stage === "rendering" && (
          <div className="absolute top-2 right-2 text-[10px] px-2 py-1 rounded-full bg-black/60 text-white/70">
            rendering video...
          </div>
        )}
        {stage === "error" && (
          <div className="absolute top-2 right-2 text-[10px] px-2 py-1 rounded-full bg-black/60 text-red-300">
            video unavailable — text meme shown
          </div>
        )}
      </div>
      <div className="p-3 flex flex-col gap-1 flex-1">
        <a
          href={job.video.url}
          target="_blank"
          rel="noreferrer"
          className="text-sm font-semibold text-white hover:text-accent line-clamp-2"
        >
          {job.video.title}
        </a>
        <p className="text-xs text-white/50">{job.video.channelTitle}</p>
      </div>
    </div>
  );
}
