import { create } from 'zustand';

export interface EditorTab {
  id: string;
  filePath: string;
  fileName: string;
  language: string;
  isDirty: boolean;
  content: string;
}

interface EditorTabState {
  tabs: EditorTab[];
  activeTabId: string | null;

  addTab: (tab: EditorTab) => void;
  closeTab: (tabId: string) => void;
  closeAllTabs: () => void;
  closeOtherTabs: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  updateTab: (tabId: string, updates: Partial<EditorTab>) => void;
  getActiveTab: () => EditorTab | undefined;
  getTabByPath: (filePath: string) => EditorTab | undefined;
}

export const useEditorTabStore = create<EditorTabState>((set, get) => ({
  tabs: [],
  activeTabId: null,

  addTab: (tab) =>
    set((state) => {
      const existing = state.tabs.find(t => t.filePath === tab.filePath);
      if (existing) {
        return { activeTabId: existing.id };
      }
      return {
        tabs: [...state.tabs, tab],
        activeTabId: tab.id,
      };
    }),

  closeTab: (tabId) =>
    set((state) => {
      const filteredTabs = state.tabs.filter(t => t.id !== tabId);
      const nextActiveId =
        state.activeTabId === tabId
          ? filteredTabs[filteredTabs.length - 1]?.id ?? null
          : state.activeTabId;
      return {
        tabs: filteredTabs,
        activeTabId: nextActiveId,
      };
    }),

  closeAllTabs: () =>
    set(() => ({
      tabs: [],
      activeTabId: null,
    })),

  closeOtherTabs: (tabId) =>
    set((state) => ({
      tabs: state.tabs.filter(t => t.id === tabId),
      activeTabId: tabId,
    })),

  setActiveTab: (tabId) =>
    set((state) => ({
      activeTabId: state.tabs.some(t => t.id === tabId) ? tabId : state.activeTabId,
    })),

  updateTab: (tabId, updates) =>
    set((state) => ({
      tabs: state.tabs.map(t => (t.id === tabId ? { ...t, ...updates } : t)),
    })),

  getActiveTab: () => {
    const state = get();
    return state.tabs.find(t => t.id === state.activeTabId);
  },

  getTabByPath: (filePath) => {
    const state = get();
    return state.tabs.find(t => t.filePath === filePath);
  },
}));
