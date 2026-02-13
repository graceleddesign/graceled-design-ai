"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signupAction, type AuthActionState } from "@/app/(auth)/actions";

const initialState: AuthActionState = {};

export function SignupForm() {
  const [state, action, pending] = useActionState(signupAction, initialState);

  return (
    <form action={action} className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
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

      {state.error ? <p className="text-sm text-red-700">{state.error}</p> : null}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-pine px-4 py-2 font-medium text-white disabled:opacity-60"
      >
        {pending ? "Creating account..." : "Create account"}
      </button>

      <p className="text-sm text-slate-600">
        Already have an account? <Link href="/login">Log in</Link>
      </p>
    </form>
  );
}
