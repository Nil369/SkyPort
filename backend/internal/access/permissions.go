package access

// Permission keys used across HTTP handlers and websocket guards.
const (
	PermDeploymentsCreate  = "deployments.create"
	PermDeploymentsDelete  = "deployments.delete"
	PermDeploymentsRestart = "deployments.restart"

	PermDockerManage = "docker.manage"

	// PermPm2Manage covers native host PM2 discovery, process control, logs, and /ws/pm2.
	PermPm2Manage = "pm2.manage"

	PermTerminalAccess = "terminal.access"
	PermMetricsView    = "metrics.view"

	PermFilesystemRead  = "filesystem.read"
	PermFilesystemWrite = "filesystem.write"

	PermUsersManage    = "users.manage"
	PermSettingsManage = "settings.manage"

	PermMarketplaceInstall = "marketplace.install"
	PermServersManage      = "servers.manage"
)

// RoleName constants align with database seed values.
const (
	RoleOwner     = "owner"
	RoleAdmin     = "admin"
	RoleDeveloper = "developer"
	RoleViewer    = "viewer"
)
