import { redirect } from "next/navigation";
import { SignupForm } from "@/components/signup-form";
import { getSession } from "@/lib/auth";

export default async function SignupPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  const session = await getSession();
  const { error: rawError } = await searchParams;
  const error = typeof rawError === "string" ? rawError : undefined;

  if (session) {
    redirect("/app/projects");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-4">
      <SignupForm error={error} />
    </main>
  );
}
