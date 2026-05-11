import { create } from "zustand";

import type { User } from "@/features/auth/types";

const STORAGE_KEY = "skyport.auth";

type AuthStatus = "hydrating" | "unauthenticated" | "authenticated";

type AuthState = {
  status: AuthStatus;
  accessToken: string | null;
  user: User | null;
  hydrate: () => void;
  setSession: (input: { accessToken: string; user: User }) => void;
  setUser: (user: User) => void;
  logoutLocal: () => void;
};

function readStored(): { accessToken: string; user: User } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { accessToken: string; user: User };
    if (!parsed?.accessToken) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeStored(value: { accessToken: string; user: User } | null) {
  try {
    if (!value) {
      localStorage.removeItem(STORAGE_KEY);
      return;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // ignore storage failures (private mode, etc.)
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  status: "hydrating",
  accessToken: null,
  user: null,

  hydrate: () => {
    const stored = readStored();
    if (stored) {
      set({ status: "authenticated", accessToken: stored.accessToken, user: stored.user });
    } else {
      set({ status: "unauthenticated", accessToken: null, user: null });
    }
  },

  setSession: ({ accessToken, user }) => {
    writeStored({ accessToken, user });
    set({ status: "authenticated", accessToken, user });
  },

  setUser: (user) => {
    const accessToken = get().accessToken;
    if (accessToken) writeStored({ accessToken, user });
    set({ user });
  },

  logoutLocal: () => {
    writeStored(null);
    set({ status: "unauthenticated", accessToken: null, user: null });
  },
}));
