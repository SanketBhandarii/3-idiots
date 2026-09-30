"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth";
import { LoadingBlock } from "@/components/ui/states";

export default function Home() {
  const router = useRouter();
  const { status, bootstrap } = useAuthStore();
  useEffect(() => void bootstrap(), [bootstrap]);
  useEffect(() => {
    if (status === "authenticated") router.replace("/workspaces");
    if (status === "unauthenticated" || status === "error") router.replace("/login");
  }, [status, router]);
  return <LoadingBlock label="Opening…" className="min-h-dvh" />;
}
