import { create } from 'zustand';
import type { VPSServer } from '@/components/VPSManagement';

interface VPSStore {
  // UI State
  selectedVPS: VPSServer | null;
  isTerminalOpen: boolean;
  searchTerm: string;
  filterTags: string[];
  sortBy: 'name' | 'ip' | 'status' | 'created';
  sortOrder: 'asc' | 'desc';

  // Terminal State
  activeTerminalSessions: Map<string, WebSocket>;
  terminalBuffer: Map<string, string>;

  // Actions
  setSelectedVPS: (vps: VPSServer | null) => void;
  setIsTerminalOpen: (open: boolean) => void;
  setSearchTerm: (term: string) => void;
  setFilterTags: (tags: string[]) => void;
  setSortBy: (sortBy: 'name' | 'ip' | 'status' | 'created') => void;
  setSortOrder: (order: 'asc' | 'desc') => void;

  // Terminal Actions
  addTerminalSession: (vpsId: string, ws: WebSocket) => void;
  removeTerminalSession: (vpsId: string) => void;
  setTerminalBuffer: (vpsId: string, content: string) => void;
  appendTerminalBuffer: (vpsId: string, content: string) => void;
  clearTerminalBuffer: (vpsId: string) => void;
}

export const useVPSStore = create<VPSStore>((set) => ({
  selectedVPS: null,
  isTerminalOpen: false,
  searchTerm: '',
  filterTags: [],
  sortBy: 'name',
  sortOrder: 'asc',
  activeTerminalSessions: new Map(),
  terminalBuffer: new Map(),

  setSelectedVPS: (vps) => set({ selectedVPS: vps }),
  setIsTerminalOpen: (open) => set({ isTerminalOpen: open }),
  setSearchTerm: (term) => set({ searchTerm: term }),
  setFilterTags: (tags) => set({ filterTags: tags }),
  setSortBy: (sortBy) => set({ sortBy }),
  setSortOrder: (order) => set({ sortOrder: order }),

  addTerminalSession: (vpsId, ws) =>
    set((state) => ({
      activeTerminalSessions: new Map(state.activeTerminalSessions).set(vpsId, ws),
    })),

  removeTerminalSession: (vpsId) =>
    set((state) => {
      const sessions = new Map(state.activeTerminalSessions);
      sessions.delete(vpsId);
      return { activeTerminalSessions: sessions };
    }),

  setTerminalBuffer: (vpsId, content) =>
    set((state) => ({
      terminalBuffer: new Map(state.terminalBuffer).set(vpsId, content),
    })),

  appendTerminalBuffer: (vpsId, content) =>
    set((state) => ({
      terminalBuffer: new Map(state.terminalBuffer).set(
        vpsId,
        (state.terminalBuffer.get(vpsId) || '') + content
      ),
    })),

  clearTerminalBuffer: (vpsId) =>
    set((state) => {
      const buffer = new Map(state.terminalBuffer);
      buffer.delete(vpsId);
      return { terminalBuffer: buffer };
    }),
}));
