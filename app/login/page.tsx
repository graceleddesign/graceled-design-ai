import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { getSession } from "@/lib/auth";

export default async function LoginPage() {
  const session = await getSession();

  if (session) {
    redirect("/app/projects");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-4">
      <LoginForm />
    </main>
  );
}
