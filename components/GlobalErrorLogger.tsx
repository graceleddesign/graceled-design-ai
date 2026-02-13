"use client";

import { useEffect } from "react";

const REJECTION_DEDUPE_WINDOW_MS = 2000;
let lastUnhandledRejectionMessage = "";
let lastUnhandledRejectionAt = 0;

function toSafeRejectionMessage(reason: unknown): string {
  if (typeof reason === "string") {
    return reason;
  }

  if (reason instanceof Error) {
    return reason.message || String(reason);
  }

  if (reason && typeof reason === "object") {
    try {
      return JSON.stringify(reason);
    } catch {
      return String(reason);
    }
  }

  return String(reason);
}

export default function GlobalErrorLogger() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      console.error("[window.onerror]", {
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        error: event.error,
      });
    };

    const onRejection = (event: PromiseRejectionEvent) => {
      try {
        const reason = event.reason;
        if (reason == null) {
          event.preventDefault();
          return;
        }

        const message = toSafeRejectionMessage(reason);
        const now = Date.now();
        const isDuplicate =
          message === lastUnhandledRejectionMessage &&
          now - lastUnhandledRejectionAt < REJECTION_DEDUPE_WINDOW_MS;

        if (isDuplicate) {
          return;
        }

        lastUnhandledRejectionMessage = message;
        lastUnhandledRejectionAt = now;

        if (process.env.NODE_ENV === "development") {
          console.warn("[unhandledrejection]", { message, reason });
        }

        const sentry = (
          window as typeof window & {
            Sentry?: {
              captureException?: (error: unknown) => void;
              captureMessage?: (message: string) => void;
            };
          }
        ).Sentry;

        if (sentry?.captureException || sentry?.captureMessage) {
          if (reason instanceof Error && sentry.captureException) {
            sentry.captureException(reason);
          } else if (sentry.captureMessage) {
            sentry.captureMessage(message);
          }
        }
      } catch (error) {
        if (process.env.NODE_ENV === "development") {
          console.warn("[unhandledrejection]", {
            message: "Unhandled promise rejection (failed to process reason)",
            error,
          });
        }
      }
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);

    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
