"use client";
import { create } from "zustand";
import type { LoginRequest, RegisterRequest, User } from "@/types/api";
import { authApi } from "@/lib/api/auth";
import { ApiError, friendlyError } from "@/lib/api/errors";

type AuthStatus = "idle" | "loading" | "authenticated" | "unauthenticated" | "error";

interface AuthState {
  user: User | null;
  status: AuthStatus;
  error: string | null;
  bootstrap: () => Promise<void>;
  login: (body: LoginRequest) => Promise<boolean>;
  register: (body: RegisterRequest) => Promise<boolean>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  status: "idle",
  error: null,
  bootstrap: async () => {
    if (get().status === "loading" || get().status === "authenticated") return;
    set({ status: "loading", error: null });
    try {
      const user = await authApi.me();
      set({ user, status: "authenticated" });
    } catch (e) {
      if (e instanceof ApiError && e.code === "unauthorized") set({ user: null, status: "unauthenticated" });
      else set({ status: "error", error: friendlyError(e).message });
    }
  },
  login: async (body) => {
    set({ status: "loading", error: null });
    try {
      const { user } = await authApi.login(body);
      set({ user, status: "authenticated" });
      return true;
    } catch (e) {
      set({ status: "unauthenticated", error: e instanceof ApiError ? e.message : friendlyError(e).message });
      return false;
    }
  },
  register: async (body) => {
    set({ status: "loading", error: null });
    try {
      const { user } = await authApi.register(body);
      set({ user, status: "authenticated" });
      return true;
    } catch (e) {
      set({ status: "unauthenticated", error: e instanceof ApiError ? e.message : friendlyError(e).message });
      return false;
    }
  },
  logout: async () => {
    try {
      await authApi.logout();
    } finally {
      set({ user: null, status: "unauthenticated", error: null });
    }
  },
}));
