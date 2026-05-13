import { useQuery } from "@tanstack/react-query";
import { Info, Download } from "lucide-react";

import { platformApi } from "@/features/platform/api";
import { Button } from "@/components/ui/button";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription
} from "@/components/ui/dialog";

import { useUIStore } from "@/stores/uiStore";

export function UpdateNotification() {
  const { showReleaseNotes, setShowReleaseNotes } = useUIStore();

  const { data: update } = useQuery({
    queryKey: ["update-check"],
    queryFn: platformApi.checkUpdates,
    refetchInterval: 1000 * 60 * 60, // Check every hour
    staleTime: 1000 * 60 * 30, // 30 mins
  });

  if (!update?.IsUpdateAvailable) return null;

  return (
    <>
      <Dialog open={showReleaseNotes} onOpenChange={setShowReleaseNotes}>
        <DialogContent className="max-w-[95vw] md:max-w-3xl lg:max-w-5xl h-[85vh] md:h-auto gap-0 p-0 overflow-hidden bg-background border-border/60 flex flex-col">
          <div className="bg-muted/30 p-6 border-b border-border/40">
            <DialogHeader>
              <div className="flex items-center gap-3 mb-2">
                 <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Info className="h-5 w-5" />
                 </div>
                 <div>
                    <DialogTitle className="text-xl">Release Notes</DialogTitle>
                    <DialogDescription className="text-xs">
                      Upgrade from <span className="font-mono">{update.CurrentVersion}</span> to <span className="font-mono text-primary font-bold">{update.LatestVersion}</span>
                    </DialogDescription>
                 </div>
              </div>
            </DialogHeader>
          </div>

          <div className="max-h-[60vh] overflow-y-auto p-6 scrollbar-thin">
            {update.LatestRelease?.body ? (
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <div dangerouslySetInnerHTML={{ 
                  __html: formatMarkdown(update.LatestRelease.body) 
                }} />
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground italic">
                <Info className="h-8 w-8 mb-2 opacity-20" />
                No release notes provided for this version.
              </div>
            )}
          </div>

          <div className="p-6 bg-muted/20 border-t border-border/40 flex flex-col gap-6">
            <div className="flex flex-wrap items-center gap-6 text-sm text-muted-foreground">
               <div className="flex items-center gap-2">
                 <span className="font-semibold uppercase tracking-wider text-[10px]">Current Version</span>
                 <span className="font-mono bg-muted px-2 py-1 rounded text-xs border border-border/40">{update.CurrentVersion}</span>
               </div>
               <div className="flex items-center gap-2">
                 <span className="font-semibold uppercase tracking-wider text-[10px]">Latest Available</span>
                 <span className="font-mono bg-primary/10 text-primary px-2 py-1 rounded text-xs font-bold border border-primary/20">{update.LatestVersion}</span>
               </div>
            </div>
            
            <div className="flex flex-col sm:flex-row gap-3 sm:justify-end">
              <Button 
                variant="outline" 
                className="w-full sm:w-auto h-11 px-8 order-2 sm:order-1 cursor-pointer" 
                onClick={() => setShowReleaseNotes(false)}
              >
                Dismiss
              </Button>
              <Button 
                className="w-full sm:w-auto h-11 px-8 gap-2 shadow-lg shadow-primary/20 order-1 sm:order-2 cursor-pointer" 
                onClick={() => window.open(update.LatestRelease?.html_url, "_blank")}
              >
                <Download className="h-4 w-4" />
                Download Release
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Enhanced markdown-to-html helper for release notes
function formatMarkdown(text: string): string {
  if (!text) return "";
  
  return text
    .replace(/^# (.*$)/gim, '<h1 class="text-3xl font-extrabold mb-6 mt-8 pb-2 border-b border-border/50">$1</h1>')
    .replace(/^## (.*$)/gim, '<h2 class="text-2xl font-bold mb-4 mt-8 pb-1 border-b border-border/30">$1</h2>')
    .replace(/^### (.*$)/gim, '<h3 class="text-xl font-bold mb-3 mt-6">$1</h3>')
    .replace(/^\* (.*$)/gim, '<li class="ml-6 list-disc mb-2 text-muted-foreground">$1</li>')
    .replace(/^- (.*$)/gim, '<li class="ml-6 list-disc mb-2 text-muted-foreground">$1</li>')
    .replace(/\*\*(.*)\*\*/gim, '<strong class="text-foreground font-semibold">$1</strong>')
    .replace(/\*(.*)\*/gim, '<em class="text-muted-foreground">$1</em>')
    .replace(/\[(.*?)\]\((.*?)\)/gim, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-primary hover:underline font-medium inline-flex items-center gap-1">$1 <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg></a>')
    .replace(/`(.*?)`/gim, '<code class="bg-muted px-1.5 py-0.5 rounded text-primary font-mono text-[0.85em] border border-border/50">$1</code>')
    .replace(/```([\s\S]*?)```/gim, '<pre class="bg-muted/50 p-4 rounded-lg my-4 overflow-x-auto border border-border/40 font-mono text-xs text-muted-foreground">$1</pre>')
    .replace(/\n/g, "<br />");
}
