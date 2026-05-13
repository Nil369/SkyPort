import { Suspense } from 'react';
import { Helmet } from 'react-helmet-async';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { VPSList } from '@/components/VPSManagement';
import { UpdateNotificationBanner, UpdateVersionDisplay } from '@/components/Updates/UpdateNotification';

/**
 * VPS Management Dashboard
 * 
 * This is the main page component for VPS cluster management.
 * It integrates:
 * - VPS list and management
 * - SSH terminal access
 * - Update notifications
 * - File preview system
 */
export function VPSManagementDashboard() {
  return (
    <>
      <Helmet>
        <title>VPS Management - SkyPort</title>
        <meta name="description" content="Manage VPS servers and access SSH terminals" />
      </Helmet>

      <div className="space-y-6">
        {/* Update Notification Banner */}
        <UpdateNotificationBanner />

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">VPS Cluster Management</h1>
            <p className="text-gray-600 dark:text-gray-400 mt-2">
              Manage and access SSH terminals for your VPS instances
            </p>
          </div>
          <UpdateVersionDisplay />
        </div>

        {/* Main Content */}
        <Tabs defaultValue="servers" className="space-y-4">
          <TabsList>
            <TabsTrigger value="servers">Servers</TabsTrigger>
            <TabsTrigger value="sessions">Active Sessions</TabsTrigger>
            <TabsTrigger value="documentation">Documentation</TabsTrigger>
          </TabsList>

          {/* Servers Tab */}
          <TabsContent value="servers">
            <Suspense fallback={<VPSSkeleton />}>
              <VPSList />
            </Suspense>
          </TabsContent>

          {/* Sessions Tab */}
          <TabsContent value="sessions">
            <ActiveSessionsPanel />
          </TabsContent>

          {/* Documentation Tab */}
          <TabsContent value="documentation">
            <DocumentationPanel />
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}

/**
 * Active Sessions Panel
 * Shows currently active SSH sessions
 */
function ActiveSessionsPanel() {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-lg border border-gray-200 dark:border-slate-700 p-6">
      <h2 className="text-lg font-semibold mb-4">Active SSH Sessions</h2>
      <p className="text-gray-500 dark:text-gray-400">
        SSH sessions are managed automatically and will display here.
        Sessions automatically timeout after 2 hours of inactivity.
      </p>
      {/* Sessions list would go here */}
    </div>
  );
}

/**
 * Documentation Panel
 * Quick reference guide
 */
function DocumentationPanel() {
  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-slate-900 rounded-lg border border-gray-200 dark:border-slate-700 p-6">
        <h2 className="text-lg font-semibold mb-4">Quick Start Guide</h2>
        
        <div className="space-y-4 text-sm">
          <div>
            <h3 className="font-semibold mb-2">Adding a VPS Server</h3>
            <ol className="list-decimal list-inside space-y-1 text-gray-700 dark:text-gray-300">
              <li>Click "Add VPS" button</li>
              <li>Enter server details (name, IP, port, username)</li>
              <li>Choose authentication method (SSH key or password)</li>
              <li>Upload SSH private key or enter password</li>
              <li>Add tags and notes (optional)</li>
              <li>Click "Create VPS"</li>
            </ol>
          </div>

          <div>
            <h3 className="font-semibold mb-2">Accessing SSH Terminal</h3>
            <ol className="list-decimal list-inside space-y-1 text-gray-700 dark:text-gray-300">
              <li>Find the VPS in the list</li>
              <li>Click the menu button (⋮)</li>
              <li>Select "Open Terminal"</li>
              <li>Terminal will open in a dialog</li>
              <li>Type commands and interact normally</li>
              <li>Use toolbar buttons for copy/download/zoom</li>
            </ol>
          </div>

          <div>
            <h3 className="font-semibold mb-2">Testing Connection</h3>
            <ol className="list-decimal list-inside space-y-1 text-gray-700 dark:text-gray-300">
              <li>Select a VPS from the list</li>
              <li>Click menu and select "Test Connection"</li>
              <li>Wait for connection test results</li>
              <li>Status will update to reflect availability</li>
            </ol>
          </div>

          <div>
            <h3 className="font-semibold mb-2">Supported Authentication</h3>
            <ul className="list-disc list-inside space-y-1 text-gray-700 dark:text-gray-300">
              <li>SSH Key: .pem, .ppk, .key formats</li>
              <li>Password: Plain text authentication</li>
              <li>Keys are encrypted with AES-256</li>
              <li>Never exposed to browser or logs</li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold mb-2">Security Notes</h3>
            <ul className="list-disc list-inside space-y-1 text-gray-700 dark:text-gray-300">
              <li>SSH keys are encrypted at rest</li>
              <li>Connections use WebSocket over HTTPS</li>
              <li>Sessions timeout automatically after 2 hours</li>
              <li>All connections are logged for audit purposes</li>
              <li>Multiple simultaneous sessions are supported</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800 p-4">
        <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">Tips</h3>
        <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
          <li>• Use tags to organize servers by environment or function</li>
          <li>• Terminal supports copy/paste and standard keyboard shortcuts</li>
          <li>• Download terminal output for record-keeping</li>
          <li>• Test connection before first terminal session</li>
        </ul>
      </div>
    </div>
  );
}

/**
 * VPS Skeleton Loader
 * Shows loading state for VPS list
 */
function VPSSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

export default VPSManagementDashboard;
