/** Permission keys issued by the SkyPort API (see internal/access). */
export const PERMS = {
  deploymentsCreate: "deployments.create",
  deploymentsDelete: "deployments.delete",
  deploymentsRestart: "deployments.restart",
  dockerManage: "docker.manage",
  terminalAccess: "terminal.access",
  metricsView: "metrics.view",
  filesystemRead: "filesystem.read",
  filesystemWrite: "filesystem.write",
  usersManage: "users.manage",
  settingsManage: "settings.manage",
  marketplaceInstall: "marketplace.install",
  serversManage: "servers.manage",
} as const;

export type PermissionKey = (typeof PERMS)[keyof typeof PERMS];

export function can(permissions: string[] | undefined | null, key: string): boolean {
  if (!permissions?.length) return false;
  return permissions.includes(key);
}

export function canAny(permissions: string[] | undefined | null, keys: string[]): boolean {
  return keys.some((k) => can(permissions, k));
}
