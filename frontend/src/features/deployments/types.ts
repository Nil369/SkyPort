export type Deployment = {
  id: number
  project_id: number
  commit_sha?: string
  branch?: string
  image_tag?: string
  status?: string
  health_status?: string
  started_at?: string | null
  finished_at?: string | null
  log_path?: string
  port?: number
  runtime?: string
  strategy?: string
  error?: string
  auto_start?: boolean
  working_directory?: string
  start_cmd?: string
  env?: Record<string, string>
}
