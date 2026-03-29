"use client";

import { useState } from "react";
import { type GenerationLifecycleState } from "@/lib/generation-state";

type GenerationPreviewPaneProps = {
  label: string;
  imageUrl: string;
  executionState?: GenerationLifecycleState;
  aspectClass: string;
  tintClass: string;
  width: number;
  height: number;
  className?: string;
  imageClassName?: string;
  showLabel?: boolean;
  labelClassName?: string;
};

export function GenerationPreviewPane({
  label,
  imageUrl,
  executionState,
  aspectClass,
  tintClass,
  width,
  height,
  className,
  imageClassName,
  showLabel = true,
  labelClassName
}: GenerationPreviewPaneProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const isInProgress = executionState === "GENERATION_IN_PROGRESS";
  const showPlaceholder = isInProgress || !imageUrl || failedUrl === imageUrl;

  return (
    <div className={`relative overflow-hidden rounded-md border border-slate-200 bg-gradient-to-br ${tintClass} ${aspectClass} ${className ?? ""}`}>
      {showLabel ? (
        <span
          className={`absolute left-2 top-2 rounded bg-white/80 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-700 ${
            labelClassName ?? ""
          }`}
        >
          {label}
        </span>
      ) : null}
      {showPlaceholder ? (
        <>
          {isInProgress ? <div className="absolute inset-0 animate-pulse bg-white/35" aria-hidden="true" /> : null}
          <span className="absolute bottom-2 left-2 rounded bg-white/80 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
            {isInProgress ? "Generation in progress" : "Preview unavailable"}
          </span>
        </>
      ) : (
        <img
          src={imageUrl}
          alt={`Preview ${label}`}
          loading="lazy"
          decoding="async"
          width={width}
          height={height}
          className={imageClassName ?? "h-full w-full object-cover"}
          onError={() => setFailedUrl(imageUrl)}
        />
      )}
    </div>
  );
}
