import { createBrowserRouter } from "react-router";

import { AuthLayout } from "@/layouts/AuthLayout";
import { AppShellLayout } from "@/layouts/AppShellLayout";
import { BootstrapRoute } from "@/routes/BootstrapRoute";

import { LoginPage } from "@/features/auth/pages/LoginPage";
import { RegisterPage } from "@/features/auth/pages/RegisterPage";
import { SetupWizardPage } from "@/features/auth/pages/SetupWizardPage";
import { ProtectedRoute } from "@/features/auth/components/ProtectedRoute";

import { OverviewPage } from "@/features/dashboard/pages/OverviewPage";
import { ProjectsPage } from "@/features/projects/pages/ProjectsPage";
import { DeploymentsPage } from "@/features/deployments/pages/DeploymentsPage";
import { TerminalPage } from "@/features/terminal/pages/TerminalPage";
import { FilesystemPage } from "@/features/filesystem/pages/FilesystemPage";
import { CodeEditorPage } from "@/features/code-editor/pages/CodeEditorPage";
import { DockerPage } from "@/features/docker/pages/DockerPage";
import { ProcessManagerPage } from "@/features/process-manager/pages/ProcessManagerPage";
import { MetricsPage } from "@/features/metrics/pages/MetricsPage";
import { DomainsPage } from "@/features/domains/pages/DomainsPage";
import { SettingsPage } from "@/features/settings/pages/SettingsPage";
import { PermissionGate } from "@/features/auth/components/PermissionGate";
import { UsersPage } from "@/features/users/pages/UsersPage";
import { AdminPage } from "@/features/admin/pages/AdminPage";
import { ProfilePage } from "@/features/users/pages/ProfilePage";
import { MarketplacePage } from "@/features/marketplace/pages/MarketplacePage";
import { GitHubPage } from "@/features/github/pages/GitHubPage";
import { ServersPage } from "@/features/cluster/pages/ServersPage";
import { PERMS } from "@/lib/permissions";

import { RouteErrorBoundary } from "@/routes/RouteErrorBoundary";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <BootstrapRoute />,
    errorElement: <RouteErrorBoundary />,
  },
  {
    element: <AuthLayout />,
    errorElement: <RouteErrorBoundary />,
    children: [
      { path: "/login", element: <LoginPage /> },
      { path: "/register", element: <RegisterPage /> },
      { path: "/setup", element: <SetupWizardPage /> },
    ],
  },
  {
    element: (
      <ProtectedRoute>
        <AppShellLayout />
      </ProtectedRoute>
    ),
    errorElement: <RouteErrorBoundary />,
    children: [
      { path: "/overview", element: <OverviewPage /> },
      { path: "/projects", element: <ProjectsPage /> },
      { path: "/deployments", element: <DeploymentsPage /> },
      { path: "/terminal", element: <TerminalPage /> },
      { path: "/files", element: <FilesystemPage /> },
      { path: "/code-editor", element: <CodeEditorPage /> },
      { path: "/docker", element: <DockerPage /> },
      { path: "/process-manager", element: <ProcessManagerPage /> },
      { path: "/metrics", element: <MetricsPage /> },
      { path: "/domains", element: <DomainsPage /> },
      { path: "/settings", element: <SettingsPage /> },
      { path: "/profile", element: <ProfilePage /> },
      { path: "/marketplace", element: <MarketplacePage /> },
      { path: "/github", element: <GitHubPage /> },
      {
        path: "/team",
        element: (
          <PermissionGate need={PERMS.usersManage}>
            <UsersPage />
          </PermissionGate>
        ),
      },
      {
        path: "/admin",
        element: (
          <PermissionGate need={PERMS.usersManage}>
            <AdminPage />
          </PermissionGate>
        ),
      },
      {
        path: "/servers",
        element: (
          <PermissionGate need={PERMS.serversManage}>
            <ServersPage />
          </PermissionGate>
        ),
      },
    ],
  },
  {
    path: "*",
    element: <RouteErrorBoundary notFound />,
  },
]);
