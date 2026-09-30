"use client";
import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { UserPlus } from "@phosphor-icons/react";
import { AuthShell } from "@/features/auth/AuthShell";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/primitives";
import { useAuthStore } from "@/stores/auth";

function RegisterForm() {
  const router = useRouter();
  const next = useSearchParams().get("next") || "/workspaces";
  const { register, status, error } = useAuthStore();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [touched, setTouched] = useState(false);
  const pwShort = form.password.length > 0 && form.password.length < 8;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (pwShort) return;
    if (await register(form)) router.replace(next);
  };

  return (
    <>
      <h2 className="text-balance text-[1.875rem] font-extrabold leading-tight text-ink">Create your account</h2>
      <p className="mt-2 text-sm text-muted">Free forever. Your research stays yours.</p>
      <form onSubmit={submit} className="mt-8 space-y-4" noValidate>
        <div>
          <Label htmlFor="name">Name</Label>
          <Input id="name" autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ada Lovelace" />
        </div>
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@example.com" />
        </div>
        <div>
          <Label htmlFor="password" hint="At least 8 characters">Password</Label>
          <Input id="password" type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} aria-invalid={touched && pwShort} />
        </div>
        {error && (
          <p role="alert" className="rounded-2xl bg-danger-soft px-4 py-2.5 text-sm font-semibold text-danger">
            {error}
          </p>
        )}
        <Button type="submit" variant="primary" size="lg" className="w-full" loading={status === "loading"}>
          <UserPlus size={20} weight="bold" /> Create account
        </Button>
      </form>
      <p className="mt-8 text-center text-sm text-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-bold text-purple-deep underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
    </>
  );
}

export default function RegisterPage() {
  return (
    <AuthShell>
      <Suspense>
        <RegisterForm />
      </Suspense>
    </AuthShell>
  );
}
