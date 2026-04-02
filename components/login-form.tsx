import Link from "next/link";
import { loginAction } from "@/app/(auth)/actions";
import { AuthSubmitButton } from "@/components/auth-submit-button";

export function LoginForm({ error }: { error?: string }) {
  return (
    <form action={loginAction} className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h1 className="text-xl font-semibold">Log in</h1>
      <p className="text-sm text-slate-600">Use your GraceLed account to continue.</p>

      <div className="space-y-2">
        <label htmlFor="email" className="text-sm font-medium text-slate-700">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          className="w-full rounded-md border border-slate-300 px-3 py-2"
          placeholder="you@church.org"
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="password" className="text-sm font-medium text-slate-700">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          className="w-full rounded-md border border-slate-300 px-3 py-2"
          placeholder="••••••••"
        />
      </div>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      <AuthSubmitButton idleLabel="Log in" pendingLabel="Logging in..." />

      <p className="text-sm text-slate-600">
        Need an account? <Link href="/signup">Create one</Link>
      </p>
    </form>
  );
}
