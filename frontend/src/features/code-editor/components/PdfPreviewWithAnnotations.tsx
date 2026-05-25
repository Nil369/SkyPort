import {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  PDFViewer,
} from "@embedpdf/react-pdf-viewer";

import { Button } from "@/components/ui/button";

import {
  Maximize2,
  Minimize2,
} from "lucide-react";

import { useTheme } from "@/components/theme-provider";

interface PdfPreviewWithAnnotationsProps {
  url: string;
  path: string;
  onDownload: () => void;
  setLoading: (v: boolean) => void;
  setError: (v: string | null) => void;
}

export function PdfPreviewWithAnnotations({
  url,
  path,
  setLoading,
  setError,
}: PdfPreviewWithAnnotationsProps) {
  const containerRef =
    useRef<HTMLDivElement>(null);

  const { effectiveTheme } =
    useTheme();

  const [fileSrc, setFileSrc] =
    useState("");

  const [isFullscreen, setIsFullscreen] =
    useState(false);

  /**
   * LOAD PDF
   */
  useEffect(() => {
    let mounted = true;

    let objectUrl = "";

    const loadPdf = async () => {
      try {
        setLoading(true);

        const response = await fetch(url);

        if (!response.ok) {
          throw new Error(
            "Failed to load PDF"
          );
        }

        const blob =
          await response.blob();

        objectUrl =
          URL.createObjectURL(blob);

        if (!mounted) return;

        setFileSrc(objectUrl);

        setLoading(false);
      } catch (err) {
        console.error(err);

        setError("Failed to load PDF");

        setLoading(false);
      }
    };

    loadPdf();

    return () => {
      mounted = false;

      if (objectUrl) {
        URL.revokeObjectURL(
          objectUrl
        );
      }
    };
  }, [
    url,
    setError,
    setLoading,
  ]);

  /**
   * FULLSCREEN
   */
  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await containerRef.current?.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (err) {
      console.error(err);
    }
  };

  /**
   * FULLSCREEN LISTENER
   */
  useEffect(() => {
    const listener = () => {
      setIsFullscreen(
        !!document.fullscreenElement
      );
    };

    document.addEventListener(
      "fullscreenchange",
      listener
    );

    return () => {
      document.removeEventListener(
        "fullscreenchange",
        listener
      );
    };
  }, []);

  /**
   * LOADING
   */
  if (!fileSrc) {
    return (
      <div className="flex h-full items-center justify-center bg-zinc-950 text-sm text-zinc-400">
        Loading PDF...
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="flex h-full flex-col overflow-hidden bg-zinc-950"
    >
      {/* TOPBAR */}
      <div className="flex shrink-0 items-center justify-between border-b border-white/10 bg-zinc-900 px-4 py-2">
        {/* LEFT */}
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded bg-red-600 text-xs font-bold text-white">
            PDF
          </div>

          <div>
            <div className="text-sm font-semibold text-white">
              PDF Studio
            </div>

            <div className="max-w-[320px] truncate text-[10px] text-zinc-400">
              {path
                .split("/")
                .pop()}
            </div>
          </div>
        </div>

        {/* RIGHT */}
        <div className="flex items-center gap-2">
          <Button
            size="icon"
            variant="ghost"
            onClick={
              toggleFullscreen
            }
            className="text-zinc-400 hover:text-white"
          >
            {isFullscreen ? (
              <Minimize2 className="h-4 w-4" />
            ) : (
              <Maximize2 className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      {/* VIEWER */}
      <div className="min-h-0 flex-1 overflow-hidden bg-[#0f172a]">
        <PDFViewer
          key={effectiveTheme}
          config={{
            src: fileSrc,

            theme: {
              preference:
                effectiveTheme,
            },
          }}
          style={{
            width: "100%",
            height: "100%",
          }}
        />
      </div>
    </div>
  );
}