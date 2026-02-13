"use client";

import { useEffect, useState } from "react";

type GenerationPreviewPaneProps = {
  label: string;
  placeholderAsset: string;
  imageUrl: string;
  aspectClass: string;
  tintClass: string;
};

export function GenerationPreviewPane({
  label,
  placeholderAsset,
  imageUrl,
  aspectClass,
  tintClass
}: GenerationPreviewPaneProps) {
  const [showPlaceholder, setShowPlaceholder] = useState(!imageUrl);

  useEffect(() => {
    setShowPlaceholder(!imageUrl);
  }, [imageUrl]);

  return (
    <div className={`relative overflow-hidden rounded-md border border-slate-200 bg-gradient-to-br ${tintClass} ${aspectClass}`}>
      <span className="absolute left-2 top-2 rounded bg-white/80 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-700">
        {label}
      </span>
      {showPlaceholder ? (
        <span className="absolute bottom-2 right-2 max-w-[85%] truncate text-[10px] text-slate-600">{placeholderAsset || "stub"}</span>
      ) : (
        <img
          src={imageUrl}
          alt={`Preview ${label}`}
          className="h-full w-full object-contain"
          onError={() => setShowPlaceholder(true)}
        />
      )}
    </div>
  );
}
