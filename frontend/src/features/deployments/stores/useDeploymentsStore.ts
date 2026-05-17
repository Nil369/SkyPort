import { create } from 'zustand'
import type { Deployment } from '../types'

type State = {
  deployments: Deployment[]
  logs: Record<number, string[]>
  setDeployments: (d: Deployment[]) => void
  appendLog: (id: number, line: string) => void
  clearLogs: (id: number) => void
}

export const useDeploymentsStore = create<State>((set) => ({
  deployments: [],
  logs: {},
  setDeployments: (d) => set({ deployments: d }),
  appendLog: (id, line) =>
    set((s) => ({
      logs: {
        ...s.logs,
        [id]: [...(s.logs[id] || []), line],
      },
    })),
  clearLogs: (id) =>
    set((s) => ({
      logs: {
        ...s.logs,
        [id]: [],
      },
    })),
}))
