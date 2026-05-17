import React, { useState } from 'react'

interface Project {
  id: number
  name: string
}

interface DeploymentSettingsProps {
  project: Project
  onRollout?: (projectId: number) => void
}

export const DeploymentSettings: React.FC<DeploymentSettingsProps> = ({ project, onRollout }) => {
  const [copied, setCopied] = useState(false)

  const webhookUrl = `${window.location.origin}/api/v1/webhooks/github/${project.id}`
  const webhookSecret = localStorage.getItem(`webhook_secret_${project.id}`) || 'YOUR_GITHUB_WEBHOOK_SECRET'

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="space-y-6">
      {/* Rollout Section */}
      <div className="bg-white dark:bg-slate-900 rounded-lg shadow border border-slate-200 dark:border-slate-700 p-6">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Rollout & Restart</h3>
        <div className="space-y-3">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Trigger a deployment rollout or restart active deployments for this project.
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => onRollout?.(project.id)}
              className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition"
            >
              Rollout Deployment
            </button>
            <button
              onClick={() => onRollout?.(project.id)}
              className="px-4 py-2 bg-slate-500 hover:bg-slate-600 text-white rounded-lg font-medium transition"
            >
              Restart Service
            </button>
          </div>
          <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded text-sm text-yellow-800 dark:text-yellow-200">
            ⚠️ <span className="font-semibold">Requires ≥2GB RAM:</span> Rolling updates need sufficient VPS resources to run Docker containers.
          </div>
        </div>
      </div>

      {/* GitHub Webhook Section */}
      <div className="bg-white dark:bg-slate-900 rounded-lg shadow border border-slate-200 dark:border-slate-700 p-6">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">GitHub Webhook</h3>
        <div className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Configure automatic deployments on GitHub push events. Add this URL to your GitHub repository.
          </p>

          {/* Webhook URL */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Webhook URL</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={webhookUrl}
                readOnly
                className="flex-1 px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-sm font-mono"
              />
              <button
                onClick={() => copyToClipboard(webhookUrl)}
                className="px-3 py-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-900 dark:text-white rounded-lg font-medium transition"
              >
                {copied ? '✓ Copied' : 'Copy'}
              </button>
            </div>
          </div>

          {/* Webhook Secret */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Webhook Secret</label>
            <input
              type="text"
              value={webhookSecret}
              readOnly
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-sm font-mono"
            />
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
              Set this as your GitHub webhook secret for security.
            </p>
          </div>

          {/* Setup Instructions */}
          <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded text-sm">
            <div className="font-semibold text-blue-900 dark:text-blue-200 mb-2">Setup Instructions:</div>
            <ol className="list-decimal list-inside space-y-1 text-blue-800 dark:text-blue-300">
              <li>Go to your GitHub repository → Settings → Webhooks</li>
              <li>Click "Add webhook"</li>
              <li>Paste the Webhook URL above</li>
              <li>Paste the Webhook Secret</li>
              <li>Select "Push events" and save</li>
            </ol>
          </div>
        </div>
      </div>

      {/* Public URL Section */}
      <div className="bg-white dark:bg-slate-900 rounded-lg shadow border border-slate-200 dark:border-slate-700 p-6">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Public URL</h3>
        <div className="space-y-3">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            For local development, use <code className="font-mono bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded">ngrok</code> to expose your local port publicly.
          </p>
          <div className="p-3 bg-slate-100 dark:bg-slate-800 rounded font-mono text-sm">
            <div className="text-slate-600 dark:text-slate-400">ngrok http 3001</div>
            <div className="text-slate-600 dark:text-slate-400">Then use: https://xxxxx.ngrok.io/api/v1/webhooks/github/{project.id}</div>
          </div>
        </div>
      </div>
    </div>
  )
}
