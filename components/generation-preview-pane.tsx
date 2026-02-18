"use client";

import { useEffect, useState } from "react";

type GenerationPreviewPaneProps = {
  label: string;
  imageUrl: string;
  aspectClass: string;
  tintClass: string;
  width: number;
  height: number;
};

export function GenerationPreviewPane({
  label,
  imageUrl,
  aspectClass,
  tintClass,
  width,
  height
}: GenerationPreviewPaneProps) {
  const [showPlaceholder, setShowPlaceholder] = useState(!imageUrl);
  const [showGuides, setShowGuides] = useState(false);

  useEffect(() => {
    setShowPlaceholder(!imageUrl);
  }, [imageUrl]);

  return (
    <div className={`relative overflow-hidden rounded-md border border-slate-200 bg-gradient-to-br ${tintClass} ${aspectClass}`}>
      <span className="absolute left-2 top-2 rounded bg-white/80 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-700">
        {label}
      </span>
      <button
        type="button"
        onClick={() => setShowGuides((previous) => !previous)}
        className="absolute right-2 top-2 z-10 rounded bg-white/85 px-1.5 py-0.5 text-[10px] font-medium text-slate-700 hover:bg-white"
      >
        {showGuides ? "Hide guides" : "Show guides"}
      </button>
      {showPlaceholder ? (
        <span className="absolute bottom-2 left-2 rounded bg-white/80 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">Preview unavailable</span>
      ) : (
        <img
          src={imageUrl}
          alt={`Preview ${label}`}
          loading="lazy"
          decoding="async"
          width={width}
          height={height}
          className="h-full w-full object-contain"
          onError={() => setShowPlaceholder(true)}
        />
      )}
      {showGuides ? (
        <div className="pointer-events-none absolute inset-0 z-[1]">
          <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-cyan-500/70" />
          <div className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-cyan-500/70" />
          <div className="absolute left-1/3 top-0 h-full w-px bg-cyan-400/50" />
          <div className="absolute left-2/3 top-0 h-full w-px bg-cyan-400/50" />
          <div className="absolute left-0 top-1/3 h-px w-full bg-cyan-400/50" />
          <div className="absolute left-0 top-2/3 h-px w-full bg-cyan-400/50" />
          <div className="absolute border border-emerald-500/70" style={{ inset: "8%" }} />
          <div
            className="absolute border border-amber-500/80"
            style={{
              left: "8%",
              top: "8%",
              width: "61.8%",
              height: "61.8%"
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
