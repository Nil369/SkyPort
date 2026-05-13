import * as React from "react";
import * as mammoth from "mammoth";
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import {
  loadPresentation,
  renderSlideToElement,
  type LoadedPresentation,
  isPPTXError,
} from "pptx-viewer";
import {
  Download,
  FileIcon,
  Loader2,
  Maximize2,
  Minimize2,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Info,
  Music,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

GlobalWorkerOptions.workerSrc = pdfjsWorker;

type PreviewProps = {
  url: string;
  path: string;
  onDownload: () => void;
};

export function FilePreview({ url, path, onDownload }: PreviewProps) {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setLoading(true);
    setError(null);
  }, [url, ext]);

  const PreviewWrapper = ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => (
    <div className={cn("relative flex h-full w-full flex-col overflow-auto bg-background", className)}>
      {loading && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="text-sm text-muted-foreground">Loading preview...</span>
          </div>
        </div>
      )}
      {error && !loading && (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-3 bg-background/90 p-6 text-center">
          <p className="text-sm text-destructive">{error}</p>
          <Button size="sm" variant="outline" onClick={onDownload}>
            <Download className="mr-2 h-4 w-4" />
            Download file
          </Button>
        </div>
      )}
      {children}
    </div>
  );

  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "ico"].includes(ext)) {
    return <ImagePreview url={url} path={path} setLoading={setLoading} onDownload={onDownload} />;
  }

  if (ext === "pdf") {
    return (
      <PreviewWrapper>
        <PdfJsPreview url={url} setLoading={setLoading} setError={setError} />
      </PreviewWrapper>
    );
  }

  if (ext === "docx") {
    return <DocxPreview url={url} setLoading={setLoading} setError={setError} />;
  }

  if (ext === "pptx") {
    return (
      <PreviewWrapper>
        <PptxPreview url={url} setLoading={setLoading} setError={setError} onDownload={onDownload} />
      </PreviewWrapper>
    );
  }

  if (ext === "ppt") {
    return (
      <PreviewWrapper className="items-center justify-center p-8">
        <div className="flex max-w-md flex-col items-center gap-4 text-center">
          <div className="rounded-full bg-orange-500/10 p-4">
            <FileIcon className="h-12 w-12 text-orange-500" />
          </div>
          <div>
            <h3 className="text-lg font-medium">Legacy .ppt format</h3>
            <p className="text-sm text-muted-foreground">
              Binary PowerPoint (.ppt) cannot be previewed in the browser. Convert to .pptx or download the file.
            </p>
          </div>
          <Button onClick={onDownload}>
            <Download className="mr-2 h-4 w-4" />
            Download
          </Button>
        </div>
      </PreviewWrapper>
    );
  }

  if (["mp3", "wav", "ogg"].includes(ext)) {
    return (
      <PreviewWrapper className="items-center justify-center p-12">
        <div className="w-full max-w-md space-y-6 text-center">
          <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-primary/10">
            <Music className="h-12 w-12 text-primary" />
          </div>
          <div className="space-y-1">
            <h3 className="truncate px-4 text-xl font-semibold">{path.split("/").pop()}</h3>
            <p className="text-sm uppercase text-muted-foreground">{ext} Audio File</p>
          </div>
          <audio
            controls
            className="w-full"
            onCanPlay={() => setLoading(false)}
            onError={() => {
              setError("Could not load audio preview.");
              setLoading(false);
            }}
            autoPlay={false}
          >
            <source src={url} type={ext === "mp3" ? "audio/mpeg" : `audio/${ext}`} />
            Your browser does not support the audio element.
          </audio>
          <Button variant="outline" onClick={onDownload}>
            <Download className="mr-2 h-4 w-4" />
            Download Audio
          </Button>
        </div>
      </PreviewWrapper>
    );
  }

  if (["mp4", "webm", "ogv", "mov", "mkv"].includes(ext)) {
    return (
      <PreviewWrapper>
        <NativeVideoPreview url={url} ext={ext} setLoading={setLoading} setError={setError} />
      </PreviewWrapper>
    );
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="rounded-full bg-muted p-4">
        <FileIcon className="h-12 w-12 text-muted-foreground" />
      </div>
      <div>
        <h3 className="text-lg font-medium">No Preview Available</h3>
        <p className="text-sm text-muted-foreground">
          We don&apos;t support previews for <b>.{ext}</b> files yet.
        </p>
      </div>
      <Button onClick={onDownload}>
        <Download className="mr-2 h-4 w-4" />
        Download File
      </Button>
    </div>
  );
}

function ImagePreview({
  url,
  path,
  setLoading,
  onDownload,
}: {
  url: string;
  path: string;
  setLoading: (v: boolean) => void;
  onDownload: () => void;
}) {
  const [zoom, setZoom] = React.useState(1);
  const [rotation, setRotation] = React.useState(0);
  const [isFullscreen, setIsFullscreen] = React.useState(false);
  const [showMetadata, setShowMetadata] = React.useState(false);

  const containerRef = React.useRef<HTMLDivElement>(null);

  const handleZoomIn = () => setZoom((prev) => Math.min(prev + 0.25, 5));
  const handleZoomOut = () => setZoom((prev) => Math.max(prev - 0.25, 0.25));
  const handleReset = () => {
    setZoom(1);
    setRotation(0);
  };
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  return (
    <div ref={containerRef} className="relative flex h-full w-full flex-col overflow-hidden bg-zinc-950">
      <div className="absolute left-1/2 top-4 z-10 flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/10 bg-black/60 p-1.5 opacity-0 shadow-2xl backdrop-blur-md transition-opacity hover:opacity-100">
        <Button variant="ghost" size="icon" className="h-8 w-8 text-white hover:bg-white/20" onClick={handleZoomOut}>
          <ZoomOut className="h-4 w-4" />
        </Button>
        <div className="min-w-10 text-center text-[11px] font-medium text-white/70">{Math.round(zoom * 100)}%</div>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-white hover:bg-white/20" onClick={handleZoomIn}>
          <ZoomIn className="h-4 w-4" />
        </Button>
        <div className="mx-1 h-4 w-px bg-white/10" />
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-white hover:bg-white/20"
          onClick={() => setRotation((r) => (r + 90) % 360)}
        >
          <RotateCw className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-white hover:bg-white/20" onClick={handleReset}>
          <Maximize2 className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-white hover:bg-white/20" onClick={toggleFullscreen}>
          {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </Button>
        <div className="mx-1 h-4 w-px bg-white/10" />
        <Button
          variant="ghost"
          size="icon"
          className={cn("h-8 w-8 text-white hover:bg-white/20", showMetadata && "bg-white/20")}
          onClick={() => setShowMetadata(!showMetadata)}
        >
          <Info className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-white hover:bg-white/20" onClick={onDownload}>
          <Download className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex flex-1 items-center justify-center overflow-auto p-8">
        <img
          src={url}
          alt={path}
          onLoad={() => setLoading(false)}
          onError={() => setLoading(false)}
          className="max-h-full max-w-full object-contain transition-transform duration-200"
          style={{
            transform: `scale(${zoom}) rotate(${rotation}deg)`,
            imageRendering: zoom > 1 ? "pixelated" : "auto",
          }}
        />
      </div>

      {showMetadata && (
        <Card className="absolute bottom-4 right-4 z-20 w-64 space-y-2 border-white/10 bg-black/80 p-4 text-xs text-white backdrop-blur-md">
          <h4 className="mb-2 border-b border-white/10 pb-2 font-semibold">File Info</h4>
          <div className="flex justify-between">
            <span className="text-white/60">Name:</span>{" "}
            <span className="ml-2 truncate">{path.split("/").pop()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-white/60">Type:</span> <span>{path.split(".").pop()?.toUpperCase()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-white/60">Path:</span>{" "}
            <span className="ml-2 truncate text-[10px]">{path}</span>
          </div>
        </Card>
      )}
    </div>
  );
}

function PdfJsPreview({
  url,
  setLoading,
  setError,
}: {
  url: string;
  setLoading: (v: boolean) => void;
  setError: (v: string | null) => void;
}) {
  const hostRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const el = hostRef.current;
    if (!el) return;

    let cancelled = false;
    let pdfDoc: PDFDocumentProxy | undefined;

    (async () => {
      try {
        el.innerHTML = "";
        await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
        const loadingTask = getDocument({
          url,
          withCredentials: false,
        });
        pdfDoc = await loadingTask.promise;
        if (cancelled) {
          await pdfDoc.destroy().catch(() => {});
          return;
        }

        const numPages = pdfDoc.numPages;
        const pad = 16;
        const cw = el.clientWidth > 0 ? el.clientWidth - pad : 720;
        for (let i = 1; i <= numPages; i++) {
          if (cancelled) break;
          const page = await pdfDoc.getPage(i);
          const base = page.getViewport({ scale: 1 });
          const scale = Math.max(0.75, cw / base.width);
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("Canvas not supported");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.className = "mx-auto mb-4 block max-w-full shadow-md";
          el.appendChild(canvas);
          await page.render({ canvasContext: ctx, viewport }).promise;
        }
        setLoading(false);
      } catch (e) {
        if (!cancelled) {
          console.error(e);
          setError("Could not render PDF. Try downloading the file.");
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      el.innerHTML = "";
      pdfDoc?.destroy().catch(() => {});
    };
  }, [url, setLoading, setError]);

  return <div ref={hostRef} className="flex min-h-0 flex-1 flex-col overflow-auto p-4" />;
}

function PptxPreview({
  url,
  setLoading,
  setError,
  onDownload,
}: {
  url: string;
  setLoading: (v: boolean) => void;
  setError: (v: string | null) => void;
  onDownload: () => void;
}) {
  const slideHostRef = React.useRef<HTMLDivElement>(null);
  const presentationRef = React.useRef<LoadedPresentation | null>(null);
  const [slideIndex, setSlideIndex] = React.useState(0);
  const [slideCount, setSlideCount] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    presentationRef.current?.cleanup();
    presentationRef.current = null;
    setSlideIndex(0);
    setSlideCount(0);

    (async () => {
      try {
        const pres = await loadPresentation(url);
        if (cancelled) {
          pres.cleanup();
          return;
        }
        if (!pres.slides?.length) {
          setError("This presentation has no slides to display.");
          setLoading(false);
          pres.cleanup();
          return;
        }
        presentationRef.current = pres;
        setSlideCount(pres.slides.length);
        setLoading(false);
      } catch (e) {
        if (cancelled) return;
        console.error(e);
        const msg = isPPTXError(e) ? e.message : "Could not load PowerPoint preview.";
        setError(msg);
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      presentationRef.current?.cleanup();
      presentationRef.current = null;
    };
  }, [url, setLoading, setError]);

  React.useEffect(() => {
    const host = slideHostRef.current;
    const pres = presentationRef.current;
    if (!pres || !host || slideCount === 0) return;
    host.innerHTML = "";
    const w = Math.min(1100, host.clientWidth || 800);
    try {
      renderSlideToElement(pres, slideIndex, host, { width: w });
    } catch (e) {
      console.error(e);
      setError("Failed to render slide.");
    }
  }, [slideIndex, slideCount, setError]);

  return (
    <div className="flex h-full min-h-[280px] flex-col">
      <div className="flex items-center justify-center gap-2 border-b border-border/60 py-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={slideIndex <= 0}
          onClick={() => setSlideIndex((i) => Math.max(0, i - 1))}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="min-w-[8rem] text-center text-sm text-muted-foreground">
          Slide {slideCount ? slideIndex + 1 : 0} / {slideCount}
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={slideIndex >= slideCount - 1}
          onClick={() => setSlideIndex((i) => Math.min(slideCount - 1, i + 1))}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button type="button" size="sm" variant="ghost" className="ml-2" onClick={onDownload}>
          <Download className="h-4 w-4" />
        </Button>
      </div>
      <div ref={slideHostRef} className="flex flex-1 items-start justify-center overflow-auto bg-muted/30 p-4" />
    </div>
  );
}

function DocxPreview({
  url,
  setLoading,
  setError,
}: {
  url: string;
  setLoading: (v: boolean) => void;
  setError: (v: string | null) => void;
}) {
  const [content, setContent] = React.useState<string>("");

  React.useEffect(() => {
    fetch(url)
      .then((res) => res.arrayBuffer())
      .then((buffer) => mammoth.convertToHtml({ arrayBuffer: buffer }))
      .then((result) => {
        setContent(result.value);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setError("Failed to convert Word document.");
        setLoading(false);
      });
  }, [url, setLoading, setError]);

  return (
    <div className="h-full overflow-auto bg-white p-12 text-black prose max-w-none dark:prose-invert">
      <div dangerouslySetInnerHTML={{ __html: content }} />
    </div>
  );
}

function NativeVideoPreview({
  url,
  ext,
  setLoading,
  setError,
}: {
  url: string;
  ext: string;
  setLoading: (v: boolean) => void;
  setError: (v: string | null) => void;
}) {
  const warn =
    ext === "mkv"
      ? " Many browsers cannot decode Matroska (.mkv) in HTML video; if playback fails, download the file."
      : "";

  return (
    <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-3 bg-black p-4">
      {ext === "mkv" && (
        <p className="max-w-xl text-center text-xs text-amber-200/90">
          MKV support depends on your browser and codecs.{warn}
        </p>
      )}
      <video
        key={url}
        src={url}
        controls
        playsInline
        preload="metadata"
        className="max-h-[min(70vh,720px)] w-full max-w-5xl rounded-md bg-black"
        onLoadedData={() => setLoading(false)}
        onCanPlay={() => setLoading(false)}
        onError={() => {
          setError(
            ext === "mkv"
              ? "This browser cannot play this MKV file. Download it or use an MP4/WebM export."
              : "Video playback failed. Download the file or try a different format."
          );
          setLoading(false);
        }}
      />
    </div>
  );
}
