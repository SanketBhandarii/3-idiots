"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { SignIn, Sparkle } from "@phosphor-icons/react";
import { AuthShell } from "@/features/auth/AuthShell";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/primitives";
import { useAuthStore } from "@/stores/auth";
import { API_MODE } from "@/lib/api/config";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/workspaces";
  const { login, status, error, bootstrap } = useAuthStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => void bootstrap(), [bootstrap]);
  useEffect(() => {
    if (status === "authenticated") router.replace(next);
  }, [status, router, next]);

  const submit = async (e?: React.FormEvent, creds?: { email: string; password: string }) => {
    e?.preventDefault();
    const ok = await login(creds ?? { email, password });
    if (ok) router.replace(next);
  };

  return (
    <>
      <h2 className="text-balance text-[1.875rem] font-extrabold leading-tight text-ink">Welcome back</h2>
      <p className="mt-2 text-sm text-muted">Sign in to open your research workspaces.</p>
      <form onSubmit={submit} className="mt-8 space-y-4" noValidate>
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" aria-invalid={!!error} />
        </div>
        <div>
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" aria-invalid={!!error} />
        </div>
        {error && (
          <p role="alert" className="rounded-2xl bg-danger-soft px-4 py-2.5 text-sm font-semibold text-danger">
            {error}
          </p>
        )}
        <Button type="submit" variant="primary" size="lg" className="w-full" loading={status === "loading"}>
          <SignIn size={20} weight="bold" /> Sign in
        </Button>
      </form>
      {API_MODE === "mock" && (
        <div className="mt-6 rounded-[24px] border-2 border-dashed border-purple/40 bg-lavender-soft/60 p-4">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-purple-deep">Demo mode</p>
          <p className="mt-1 text-sm text-ink-soft">
            The backend is simulated in your browser. Use the demo account to explore the seeded “AI in Healthcare” workspace.
          </p>
          <Button
            variant="purple"
            size="sm"
            className="mt-3"
            onClick={() => void submit(undefined, { email: "demo@researchmap.app", password: "demo1234" })}
          >
            <Sparkle size={16} weight="fill" /> Continue with demo account
          </Button>
        </div>
      )}
      <p className="mt-8 text-center text-sm text-muted">
        New here?{" "}
        <Link href={`/register${next !== "/workspaces" ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-bold text-purple-deep underline-offset-4 hover:underline">
          Create an account
        </Link>
      </p>
    </>
  );
}

export default function LoginPage() {
  return (
    <AuthShell>
      <Suspense>
        <LoginForm />
      </Suspense>
    </AuthShell>
  );
}
