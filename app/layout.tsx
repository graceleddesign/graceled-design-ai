import "./globals.css";
import type { Metadata } from "next";
import { ClientErrorBoundary } from "@/components/ClientErrorBoundary";
import GlobalErrorLogger from "@/components/GlobalErrorLogger";
import { FONT_ASSETS, getFontFaceCSS } from "@/src/design/fonts/font-assets";

const LOCAL_FONT_FACE_CSS = getFontFaceCSS(FONT_ASSETS);

export const metadata: Metadata = {
  title: "GraceLed Design AI",
  description: "Project setup and preset management for GraceLed Design AI."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <style id="local-font-assets" dangerouslySetInnerHTML={{ __html: LOCAL_FONT_FACE_CSS }} />
      </head>
      <body>
        <GlobalErrorLogger />
        <ClientErrorBoundary label="root">
          <div className="min-h-screen">{children}</div>
        </ClientErrorBoundary>
      </body>
    </html>
  );
}
