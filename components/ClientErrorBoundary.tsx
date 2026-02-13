"use client";

import React from "react";

type Props = {
  children: React.ReactNode;
  label?: string;
};

type State = {
  hasError: boolean;
  error?: unknown;
};

export class ClientErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: unknown): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: unknown, info: unknown) {
    // This is the whole point: surface something concrete in the console.
    console.error(
      "[ClientErrorBoundary]",
      this.props.label ?? "app",
      error,
      info
    );
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div style={{ padding: 16, fontFamily: "system-ui" }}>
        <h2 style={{ fontSize: 18, fontWeight: 600 }}>
          Something crashed on the client.
        </h2>
        <p style={{ marginTop: 8, opacity: 0.8 }}>
          Open DevTools Console for details. (We logged the real error + stack.)
        </p>
        <pre style={{ marginTop: 12, whiteSpace: "pre-wrap", opacity: 0.9 }}>
          {String((this.state as any)?.error ?? "")}
        </pre>
      </div>
    );
  }
}
