"use client";

import { useFormStatus } from "react-dom";
import type { MouseEvent } from "react";

type DeleteProjectButtonProps = {
  projectTitle: string;
};

export function DeleteProjectButton({ projectTitle }: DeleteProjectButtonProps) {
  const { pending } = useFormStatus();

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (pending) {
      return;
    }

    const confirmed = window.confirm(`Delete "${projectTitle}" and all related generations, assets, and final files? This cannot be undone.`);
    if (!confirmed) {
      event.preventDefault();
    }
  };

  return (
    <button
      type="submit"
      onClick={handleClick}
      disabled={pending}
      className="inline-flex rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Deleting..." : "Delete"}
    </button>
  );
}
