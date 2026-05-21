import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface DeleteDomainDialogProps {
  isOpen: boolean;
  domain?: string;
  isDeleting?: boolean;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}

export function DeleteDomainDialog({
  isOpen,
  domain,
  isDeleting = false,
  onConfirm,
  onCancel,
}: DeleteDomainDialogProps) {
  const [confirming, setConfirming] = useState(false);

  const handleConfirm = async () => {
    setConfirming(true);
    try {
      await onConfirm();
    } finally {
      setConfirming(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <AlertTriangle className="h-5 w-5 text-red-500" />
            <DialogTitle>Delete Domain Mapping?</DialogTitle>
          </div>
          <DialogDescription>
            This action cannot be undone. The domain mapping for{" "}
            <strong>{domain}</strong> will be permanently removed.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg bg-red-500/10 border border-red-200 p-3 my-4">
          <p className="text-sm text-red-700">
            ⚠️ After deletion, traffic to <strong>{domain}</strong> will no
            longer be routed through Caddy. The Caddyfile will be automatically
            updated.
          </p>
        </div>

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={confirming || isDeleting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleConfirm}
            disabled={confirming || isDeleting}
          >
            {confirming || isDeleting ? "Deleting..." : "Delete Mapping"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
