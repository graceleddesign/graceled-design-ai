import Link from "next/link";
import { Settings } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { logoutAction } from "@/app/app/actions";

export default async function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">GraceLed Design AI</p>
            <p className="font-semibold">{session.organizationName}</p>
          </div>

          <nav className="flex items-center gap-4 text-sm">
            <Link href="/app/projects">Projects</Link>
            <Link
              href="/app/settings"
              aria-label="Settings"
              className="inline-flex items-center gap-1 rounded-md px-1 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2"
            >
              <Settings aria-hidden="true" className="h-4 w-4" />
              <span className="hidden md:inline">Settings</span>
            </Link>
            <form action={logoutAction}>
              <button type="submit" className="rounded-md border border-slate-300 px-3 py-1.5 text-slate-700">
                Log out
              </button>
            </form>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
