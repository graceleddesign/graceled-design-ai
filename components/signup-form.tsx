import Link from "next/link";
import { signupAction } from "@/app/(auth)/actions";
import { AuthSubmitButton } from "@/components/auth-submit-button";

export function SignupForm({ error }: { error?: string }) {
  return (
    <form action={signupAction} className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h1 className="text-xl font-semibold">Create your account</h1>
      <p className="text-sm text-slate-600">Set up your first organization workspace.</p>

      <div className="space-y-2">
        <label htmlFor="name" className="text-sm font-medium text-slate-700">
          Full name
        </label>
        <input
          id="name"
          name="name"
          required
          className="w-full rounded-md border border-slate-300 px-3 py-2"
          placeholder="Jane Doe"
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="organizationName" className="text-sm font-medium text-slate-700">
          Organization
        </label>
        <input
          id="organizationName"
          name="organizationName"
          required
          className="w-full rounded-md border border-slate-300 px-3 py-2"
          placeholder="GraceLed Church"
        />
      </div>

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
          placeholder="At least 8 characters"
        />
      </div>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      <AuthSubmitButton idleLabel="Create account" pendingLabel="Creating account..." />

      <p className="text-sm text-slate-600">
        Already have an account? <Link href="/login">Log in</Link>
      </p>
    </form>
  );
}
