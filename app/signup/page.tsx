import { redirect } from "next/navigation";
import { SignupForm } from "@/components/signup-form";
import { getSession } from "@/lib/auth";

export default async function SignupPage() {
  const session = await getSession();

  if (session) {
    redirect("/app/projects");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-4">
      <SignupForm />
    </main>
  );
}
