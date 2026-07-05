"use client";

import { MemeJob } from "@/lib/types";
import MemeCard from "./MemeCard";

interface Props {
  jobs: MemeJob[];
}

export default function MemeGrid({ jobs }: Props) {
  if (!jobs.length) return null;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
      {jobs.map((job) => (
        <MemeCard key={`${job.video.id}_${job.index}`} job={job} />
      ))}
    </div>
  );
}
