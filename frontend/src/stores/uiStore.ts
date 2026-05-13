import { create } from "zustand";

type UIState = {
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (value: boolean) => void;
  toggleSidebar: () => void;
  showReleaseNotes: boolean;
  setShowReleaseNotes: (value: boolean) => void;
  dismissedUpdateVersion: string | null;
  dismissUpdate: (version: string) => void;
  clearNotifications: () => void;
};

export const useUIStore = create<UIState>((set) => ({
  sidebarCollapsed: false,
  setSidebarCollapsed: (value) => set({ sidebarCollapsed: value }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  showReleaseNotes: false,
  setShowReleaseNotes: (value) => set({ showReleaseNotes: value }),
  dismissedUpdateVersion: localStorage.getItem("dismissed_update_version"),
  dismissUpdate: (version) => {
    localStorage.setItem("dismissed_update_version", version);
    set({ dismissedUpdateVersion: version });
  },
  clearNotifications: () => {
    set(() => ({
      dismissedUpdateVersion: "all",
    }));
  },
}));
