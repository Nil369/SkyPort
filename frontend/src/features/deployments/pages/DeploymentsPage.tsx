import React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { ScrollText, Info } from 'lucide-react'

import { PageShell } from '@/components/layout/PageShell'
import { PageHeader } from '@/components/layout/PageHeader'

import { platformApi, type Deployment } from '@/features/platform/api'
import { Button } from '@/components/ui/button'
import { parseEnvTextSimple } from '@/lib/envUtils'
import { resolvedStartCommand, withNodeHintsIfApplicable } from '@/lib/runtimeHints'
import { DeploymentLogsModal } from '../components/DeploymentLogsModal'
import { useDeploymentsStore } from '../stores/useDeploymentsStore'

export const DeploymentsPage: React.FC = () => {
  const qc = useQueryClient()
  const [selectedDeployment, setSelectedDeployment] = React.useState<Deployment | null>(null)
  const [projectId, setProjectId] = React.useState('')
  const [strategy, setStrategy] = React.useState<'docker' | 'pm2' | 'native'>('docker')
  const [port, setPort] = React.useState('')
  const [startCmd, setStartCmd] = React.useState('')
  const [workingDir, setWorkingDir] = React.useState('')
  const [envText, setEnvText] = React.useState('')
  const [searchQuery, setSearchQuery] = React.useState('')
  const deployAutofillKey = React.useRef<number | null>(null)

  // Queries
  const projects = useQuery({ queryKey: ['projects'], queryFn: platformApi.listProjects })
  const deployments = useQuery({ queryKey: ['deployments'], queryFn: platformApi.listDeployments })

  const selectedProject = React.useMemo(
    () => projects.data?.find((p) => p.id === Number(projectId)) ?? null,
    [projectId, projects.data]
  )

  const deployRuntime = useQuery({
    queryKey: ['deployment-form-runtime', selectedProject?.path],
    queryFn: () => platformApi.detectProjectRuntime(selectedProject!.path),
    enabled: Boolean(selectedProject?.path),
  })

  const createDeploymentMutation = useMutation({
    mutationFn: platformApi.createDeployment,
    onSuccess: () => {
      toast.success('Deployment created')
      setProjectId('')
      setStrategy('docker')
      setPort('')
      setStartCmd('')
      setWorkingDir('')
      setEnvText('')
      deployAutofillKey.current = null
      qc.invalidateQueries({ queryKey: ['deployments'] })
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error?.message ?? 'Failed to create deployment')
    },
  })

  const deleteDeploymentMutation = useMutation({
    mutationFn: platformApi.deleteDeployment,
    onSuccess: () => {
      toast.success('Deployment deleted')
      qc.invalidateQueries({ queryKey: ['deployments'] })
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error?.message ?? 'Failed to delete deployment')
    },
  })

  // Auto-detect runtime and prefill form
  React.useEffect(() => {
    deployAutofillKey.current = null
  }, [projectId])

  React.useEffect(() => {
    if (!projectId || !selectedProject) return
    if (deployAutofillKey.current === selectedProject.id) return
    if (deployRuntime.isLoading) return

    if (deployRuntime.isError) {
      if (!port) setPort('3000')
      if (!startCmd) setStartCmd('npm start')
      deployAutofillKey.current = selectedProject.id
      return
    }

    if (!deployRuntime.data) return

    const detected = deployRuntime.data
    const hinted = withNodeHintsIfApplicable(detected)
    const runtime = String(hinted.runtime ?? '').toLowerCase()
    const framework = (detected.framework ?? '').toLowerCase()
    const nodeLikeFrameworks = new Set(['next.js', 'nestjs', 'express', 'vite', 'react', 'nuxt'])
    const preferPm2 = runtime === 'node' || nodeLikeFrameworks.has(framework)

    if (preferPm2) {
      setStrategy('pm2')
    }
    if (detected.detected_port) {
      setPort(String(detected.detected_port))
    }
    const start = resolvedStartCommand(detected)
    if (start) {
      setStartCmd(start)
    }
    if (detected.working_directory) {
      setWorkingDir(detected.working_directory)
    }

    deployAutofillKey.current = selectedProject.id
  }, [projectId, selectedProject?.path, deployRuntime.data, deployRuntime.isLoading, deployRuntime.isError])

  const filteredDeployments = React.useMemo(() => {
    if (!searchQuery) return deployments.data ?? []
    const query = searchQuery.toLowerCase()
    return (deployments.data ?? []).filter(
      (d) =>
        String(d.id).includes(query) ||
        (d.status || '').toLowerCase().includes(query) ||
        (d.runtime || '').toLowerCase().includes(query) ||
        (d.strategy || '').toLowerCase().includes(query)
    )
  }, [deployments.data, searchQuery])

  // Pagination (page size 10 to match ProjectsPage)
  const [page, setPage] = React.useState(1)
  const pageSize = 10
  const totalPages = Math.max(1, Math.ceil((filteredDeployments?.length ?? 0) / pageSize))

  React.useEffect(() => {
    if (page > totalPages) setPage(1)
  }, [page, totalPages])

  const visibleDeployments = React.useMemo(() => {
    const items = filteredDeployments ?? []
    const start = (page - 1) * pageSize
    return items.slice(start, start + pageSize)
  }, [filteredDeployments, page])

  const handleCreateDeployment = React.useCallback(async () => {
    if (!projectId) return
    createDeploymentMutation.mutate({
      project_id: Number(projectId),
      strategy,
      port: port ? Number(port) : undefined,
      start_cmd: startCmd.trim() || undefined,
      working_directory: workingDir.trim() || undefined,
      env: parseEnvTextSimple(envText),
      auto_start: true,
    })
  }, [projectId, strategy, port, startCmd, workingDir, envText])

  const handleDeleteDeployment = React.useCallback(
    (id: number) => {
      if (!confirm('Delete this deployment?')) return
      deleteDeploymentMutation.mutate(id)
    },
    []
  )

  // Open logs modal with an initial HTTP fetch (pm2/docker) and then websocket live stream
  const appendLog = useDeploymentsStore((s) => s.appendLog)
  const clearLogs = useDeploymentsStore((s) => s.clearLogs)

  async function openLogsForDeployment(d: Deployment) {
    // clear previous logs for this id
    clearLogs(d.id)
    try {
      // fetch deployment details to get container id or strategy
      const detail = await platformApi.getDeployment(d.id)
      // prefer pm2 logs if strategy is pm2
      if (String(detail.strategy).toLowerCase() === 'pm2') {
        try {
          const procList = await platformApi.listPm2Processes()
          const procs = procList?.processes ?? []
          // try obvious candidates: deployment-<id>, cwd contains deployment path, or name contains id
          let candidateName: string | undefined
          candidateName = procs.find((p) => p.name === `deployment-${d.id}`)?.name
          if (!candidateName && detail.path) {
            candidateName = procs.find((p) => p.cwd && String(p.cwd).includes(String(detail.path)))?.name
          }
          if (!candidateName) {
            candidateName = procs.find((p) => p.name && String(p.name).includes(String(d.id)))?.name
          }
          // fallback to deployment-<id>
          if (!candidateName) candidateName = `deployment-${d.id}`
          const res = await platformApi.pm2Logs(candidateName, 250)
          const lines = (res.log || '').split(/\r?\n/)
          for (const ln of lines) if (ln) appendLog(d.id, ln)
        } catch (e) {
          // ignore pm2 fetch errors; websocket will stream if available
        }
      } else if (String(detail.strategy).toLowerCase() === 'docker') {
        // try container id first, fallback to deployment container name if present
        const nameOrId = (detail as any).container_id || detail.containerID || detail.ContainerID || `deployment-${d.id}`
        try {
          const res = await platformApi.dockerLogs(nameOrId, 250)
          const lines = (res.log || '').split(/\r?\n/)
          for (const ln of lines) if (ln) appendLog(d.id, ln)
        } catch (e) {
          // ignore docker logs fetch error; websocket will stream if available
        }
      }
    } catch (e) {
      // ignore fetch errors; websocket will still stream logs if available
    }
    // open modal (which attaches websocket to stream further logs)
    setSelectedDeployment(d)
  }

  return (
    <PageShell>
      <PageHeader title="Deployments" subtitle="Create and manage deployments" />

      <div className="space-y-6">
        <div>
          <h1 className="sr-only">Deployments</h1>
        </div>

      {/* Info Banner */}
      <div className="p-6 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg">
        <p className="text-sm text-blue-800 dark:text-blue-200 flex items-start gap-2">
          <Info className="h-5 w-5 mt-0.5 text-blue-700 dark:text-blue-200" />
          <span className="font-semibold">Rolling updates</span>
          <span className="ml-1 font-normal">require VPS with ≥2GB RAM to handle Docker containers and concurrent deployments.</span>
        </p>
      </div>

      {/* New Deployment Form */}
      <div className="bg-white dark:bg-slate-900 rounded-lg shadow border border-slate-200 dark:border-slate-700">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700">
          <h2 className="font-semibold text-slate-900 dark:text-white">New deployment</h2>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Project
              </label>
              <select
                value={projectId}
                onChange={(e) => {
                  setProjectId(e.target.value)
                  setPort('')
                  setStartCmd('')
                  setWorkingDir('')
                  setStrategy('docker')
                }}
                disabled={projects.isLoading}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm disabled:opacity-50"
              >
                <option value="">{projects.isLoading ? 'Loading projects...' : 'Select project'}</option>
                {(projects.data ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              {(projects.data?.length ?? 0) === 0 && !projects.isLoading && (
                <p className="text-xs text-red-600 dark:text-red-400 mt-1">No projects found</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Strategy
              </label>
              <select
                value={strategy}
                onChange={(e) => setStrategy(e.target.value as any)}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm"
              >
                <option value="docker">Docker</option>
                <option value="pm2">PM2</option>
                <option value="native">Native</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Port
              </label>
              <input
                type="text"
                placeholder="3000"
                value={port}
                onChange={(e) => setPort(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Start Command
              </label>
              <input
                type="text"
                placeholder="auto-detected"
                value={startCmd}
                onChange={(e) => setStartCmd(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Working Dir
              </label>
              <input
                type="text"
                placeholder="auto-detected"
                value={workingDir}
                onChange={(e) => setWorkingDir(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Environment Variables
            </label>
            <textarea
              value={envText}
              onChange={(e) => setEnvText(e.target.value)}
              placeholder="KEY=VALUE&#10;ANOTHER_KEY=value"
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm font-mono min-h-24"
            />
          </div>
          <div className="text-xs text-slate-600 dark:text-slate-400">
            <div className="font-semibold mb-2">Examples:</div>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                <code className="font-mono">npm run start</code>
              </li>
              <li>
                <code className="font-mono">node server.js</code>
              </li>
              <li>
                <code className="font-mono">docker run -d --name my-app -p 8080:8080 my-image:latest</code>
              </li>
              <li>
                <code className="font-mono">
                  pm2 start src/index.js --name "backend" --env production --max-memory-restart 400M
                </code>
              </li>
            </ul>
          </div>
          <button
            onClick={handleCreateDeployment}
            disabled={!projectId || createDeploymentMutation.isPending || deployRuntime.isLoading}
            className="px-6 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-slate-300 text-white rounded-lg font-medium transition"
          >
            {createDeploymentMutation.isPending ? 'Creating...' : 'New deployment'}
          </button>
        </div>
      </div>

      {/* Deployment List */}
      <div className="bg-white dark:bg-slate-900 rounded-lg shadow border border-slate-200 dark:border-slate-700">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <h2 className="font-semibold text-slate-900 dark:text-white">Deployment list</h2>
          <input
            type="text"
            placeholder="Search deployments..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="px-3 py-1 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm"
          />
        </div>
        <div className="p-6">
          {deployments.isLoading ? (
            <p className="text-slate-500 dark:text-slate-400">Loading...</p>
          ) : filteredDeployments.length === 0 ? (
            <p className="text-slate-500 dark:text-slate-400">No deployments found.</p>
          ) : (
            <div className="space-y-3">
              {visibleDeployments.map((d) => {
                const projName = (projects.data ?? []).find((p) => p.id === d.project_id)?.name || `Project ${d.project_id}`
                return (
                  <div
                    key={d.id}
                    className="flex items-center justify-between p-4 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="font-semibold text-slate-900 dark:text-white">#{d.id} • {projName}</span>
                      <span
                        className={`px-2 py-1 rounded text-xs font-medium ${
                          d.status === 'running'
                            ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                            : d.status === 'failed'
                            ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                            : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
                        }`}
                      >
                        {d.status || 'unknown'}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-slate-600 dark:text-slate-400">
                      <div>
                        <span className="font-medium">Runtime:</span> {d.runtime || '—'}
                      </div>
                      <div>
                        <span className="font-medium">Strategy:</span> {d.strategy || '—'}
                      </div>
                      <div>
                        <span className="font-medium">Port:</span> {d.port || '—'}
                      </div>
                      {d.error && (
                        <div className="col-span-2 md:col-span-4 text-red-600 dark:text-red-400">
                          <span className="font-medium">Error:</span> {d.error}
                        </div>
                      )}
                    </div>
                  </div>
                    <div className="flex gap-2 ml-4">
                    <button
                      onClick={() => openLogsForDeployment(d)}
                      className="flex items-center gap-2 px-3 py-1 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded transition"
                      title="View logs"
                    >
                      <ScrollText className="h-4 w-4" />
                      <span>View logs</span>
                    </button>
                    {d.port && d.status === 'running' && (
                      <a
                        href={`http://localhost:${d.port}`}
                        target="_blank"
                        rel="noreferrer"
                        className="px-3 py-1 text-sm bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-900 dark:text-white rounded transition"
                      >
                        Launch
                      </a>
                    )}
                    <button
                      onClick={() => handleDeleteDeployment(d.id)}
                      className="px-3 py-1 text-sm bg-red-500 hover:bg-red-600 text-white rounded transition"
                    >
                      Delete
                    </button>
                  </div>
                </div>
                )
              })}
            </div>
          )}
        </div>

        {filteredDeployments.length > pageSize ? (
          <div className="flex items-center justify-between border-t border-slate-200 dark:border-slate-700 bg-white/0 px-4 py-3 text-sm">
            <div className="text-slate-600 dark:text-slate-400">
              Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, filteredDeployments.length)} of {filteredDeployments.length} deployments
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((prev) => Math.max(prev - 1, 1))}>
                Previous
              </Button>
              <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((prev) => Math.min(prev + 1, totalPages))}>
                Next
              </Button>
            </div>
          </div>
        ) : null}
      </div>

        {/* Logs Modal */}
        {selectedDeployment && (
          <DeploymentLogsModal
            deployment={selectedDeployment as any}
            isOpen={!!selectedDeployment}
            onClose={() => setSelectedDeployment(null)}
          />
        )}
      </div>
    </PageShell>
  )
}
