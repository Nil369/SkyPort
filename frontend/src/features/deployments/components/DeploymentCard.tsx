import React from 'react'
import type { Deployment } from '../types'

interface DeploymentCardProps {
  deployment: Deployment
  onViewLogs?: (deployment: Deployment) => void
  onDelete?: (id: number) => void
}

export const DeploymentCard: React.FC<DeploymentCardProps> = ({
  deployment,
  onViewLogs,
  onDelete,
}) => {
  return (
    <div className="p-4 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md transition">
      <div className="flex justify-between items-start mb-3">
        <div>
          <div className="text-sm text-slate-600 dark:text-slate-400">Branch: {deployment.branch || '—'}</div>
          <div className="font-semibold text-slate-900 dark:text-white">
            {deployment.commit_sha?.slice(0, 7) || 'no-commit'}
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-slate-600 dark:text-slate-400">Status</div>
          <div className={`font-bold text-sm ${
            deployment.status === 'running'
              ? 'text-green-600 dark:text-green-400'
              : deployment.status === 'failed'
              ? 'text-red-600 dark:text-red-400'
              : 'text-yellow-600 dark:text-yellow-400'
          }`}>
            {deployment.status || 'unknown'}
          </div>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <button
          onClick={() => onViewLogs?.(deployment)}
          className="px-3 py-1 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded transition"
        >
          View Logs
        </button>
        <a
          className="px-3 py-1 text-sm bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-900 dark:text-white rounded transition"
          href={`/#/projects/${deployment.project_id}`}
          target="_blank"
          rel="noreferrer"
        >
          Open
        </a>
        {onDelete && (
          <button
            onClick={() => onDelete(deployment.id)}
            className="px-3 py-1 text-sm bg-red-500 hover:bg-red-600 text-white rounded transition"
          >
            Delete
          </button>
        )}
      </div>
    </div>
  )
}
