import type { Deployment } from './types'

const apiBase = '/api/v1'

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('token') || ''
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export async function fetchDeployments(): Promise<Deployment[]> {
  const res = await fetch(`${apiBase}/deployments`, { headers: { ...authHeaders() } })
  if (!res.ok) throw new Error('failed to fetch deployments')
  return res.json()
}

export async function getDeployment(id: number): Promise<Deployment> {
  const res = await fetch(`${apiBase}/deployments/${id}`, { headers: { ...authHeaders() } })
  if (!res.ok) throw new Error('failed to fetch deployment')
  return res.json()
}

export async function createDeployment(data: {
  project_id: number
  strategy: 'docker' | 'pm2' | 'native'
  port?: number
  start_cmd?: string
  working_directory?: string
  env?: Record<string, string>
  auto_start?: boolean
}): Promise<Deployment> {
  const res = await fetch(`${apiBase}/deployments`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  })
  if (!res.ok) throw new Error('failed to create deployment')
  return res.json()
}

export async function deleteDeployment(id: number): Promise<void> {
  const res = await fetch(`${apiBase}/deployments/${id}`, {
    method: 'DELETE',
    headers: { ...authHeaders() }
  })
  if (!res.ok) throw new Error('failed to delete deployment')
}
