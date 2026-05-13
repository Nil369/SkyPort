import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { X, Download, ExternalLink } from 'lucide-react';
import { updateApi } from '@/services/api';
import { Badge } from '@/components/ui/badge';

interface UpdateCheckResult {
  is_update_available: boolean;
  current_version: string;
  latest_version: string;
  latest_release?: {
    tag_name: string;
    name: string;
    body: string;
    html_url: string;
    published_at: string;
  };
  check_time: string;
  error?: string;
}

export function UpdateNotificationBanner() {
  const [isDismissed, setIsDismissed] = useState(false);
  const [isChangelogOpen, setIsChangelogOpen] = useState(false);

  const { data } = useQuery({
    queryKey: ['update-check'],
    queryFn: () => updateApi.checkForUpdates(),
    refetchInterval: 3600000, // Check every hour
  });

  const result = data?.data as UpdateCheckResult | undefined;

  if (isDismissed || !result?.is_update_available) {
    return null;
  }

  return (
    <>
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-4 rounded-lg flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Download className="w-5 h-5" />
          <div>
            <p className="font-semibold">New SkyPort release available!</p>
            <p className="text-sm text-blue-100">
              Version {result.latest_version} is now available (current: {result.current_version})
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setIsChangelogOpen(true)}
          >
            View Changes
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setIsDismissed(true)}
            className="text-white hover:bg-blue-600"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <UpdateChangelogDialog
        result={result}
        open={isChangelogOpen}
        onOpenChange={setIsChangelogOpen}
      />
    </>
  );
}

interface UpdateChangelogDialogProps {
  result: UpdateCheckResult;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function UpdateChangelogDialog({ result, open, onOpenChange }: UpdateChangelogDialogProps) {
  const release = result.latest_release;

  if (!release) return null;

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-96 overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>{release.name}</span>
            <Badge className="bg-green-600 hover:bg-green-700">New</Badge>
          </DialogTitle>
          <DialogDescription>
            Released on {formatDate(release.published_at)}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-auto">
          <div className="prose prose-sm dark:prose-invert max-w-none p-4 bg-slate-50 dark:bg-slate-900 rounded">
            <div className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
              {release.body || 'No release notes available.'}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between border-t pt-4">
          <a
            href={release.html_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
          >
            View on GitHub
            <ExternalLink className="w-4 h-4" />
          </a>

          <Button
            className="gap-2"
            onClick={() => {
              // Redirect to downloads page or GitHub releases
              window.open(release.html_url, '_blank');
            }}
          >
            <Download className="w-4 h-4" />
            Download Release
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function UpdateVersionDisplay() {
  const [currentVersion, setCurrentVersion] = useState<string>('');

  useEffect(() => {
    // Get version from window or environment
    const version = (window as any).__SKYPORT_VERSION__ || 'v0.0.0';
    setCurrentVersion(version);
  }, []);

  return (
    <div className="text-xs text-slate-500 dark:text-slate-400">
      SkyPort {currentVersion}
    </div>
  );
}
