import React, { useEffect } from 'react'
import type { Deployment } from '@/features/platform/api'
import { useDeploymentsStore } from '../stores/useDeploymentsStore'
import { DeploymentTimeline } from './DeploymentTimeline'
import { useDeploymentWebsocket } from '../hooks/useDeploymentWebsocket'
import { Copy } from 'lucide-react'

interface DeploymentLogsModalProps {
  deployment: Deployment
  isOpen: boolean
  onClose: () => void
}

export const DeploymentLogsModal: React.FC<DeploymentLogsModalProps> = ({
  deployment,
  isOpen,
  onClose,
}) => {
  const logs = useDeploymentsStore((s) => s.logs[deployment.id] || [])
  const preRef = React.useRef<HTMLPreElement>(null)

  useDeploymentWebsocket(isOpen ? deployment.id : undefined)

  useEffect(() => {
    if (preRef.current) {
      preRef.current.scrollTop = preRef.current.scrollHeight
    }
  }, [logs])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-4xl max-h-[85vh] bg-white dark:bg-slate-900 rounded-lg shadow-lg overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              Deployment #{deployment.id} Logs
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Status: <span className="font-medium">{deployment.status || 'unknown'}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-900 dark:text-white rounded transition"
          >
            Close
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto grid grid-cols-2 gap-4 p-6">
          {/* Timeline */}
          <div className="border border-slate-200 dark:border-slate-700 rounded p-4 bg-slate-50 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-white mb-4">Deployment Timeline</h3>
            <DeploymentTimeline status={deployment.status} />
          </div>

          {/* Logs */}
          <div className="border border-slate-200 dark:border-slate-700 rounded p-4 bg-slate-900 dark:bg-black">
            <h3 className="font-semibold text-white mb-4">Console Output</h3>
            <pre
              ref={preRef}
              className="text-xs font-mono text-slate-100 dark:text-slate-300 whitespace-pre-wrap max-h-96 overflow-y-auto"
            >
              {logs.length ? logs.join('\n') : 'Waiting for logs...'}
            </pre>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 dark:border-slate-700 px-6 py-3 bg-slate-50 dark:bg-slate-800 flex gap-2 justify-end">
          <button className="px-4 py-2 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded transition">
            Restart
          </button>
          <button className="px-4 py-2 text-sm bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-900 dark:text-white rounded transition flex items-center gap-2" onClick={() => { navigator.clipboard.writeText((logs && logs.join('\n')) || '') }}>
            <Copy className="h-4 w-4" />
            Copy logs
          </button>
        </div>
      </div>
    </div>
  )
}
