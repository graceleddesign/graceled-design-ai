import "./globals.css";
import type { Metadata } from "next";
import { ClientErrorBoundary } from "@/components/ClientErrorBoundary";
import GlobalErrorLogger from "@/components/GlobalErrorLogger";

export const metadata: Metadata = {
  title: "GraceLed Design AI",
  description: "Project setup and preset management for GraceLed Design AI."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <GlobalErrorLogger />
        <ClientErrorBoundary label="root">
          <div className="min-h-screen">{children}</div>
        </ClientErrorBoundary>
      </body>
    </html>
  );
}
