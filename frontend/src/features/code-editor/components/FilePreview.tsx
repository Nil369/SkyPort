import * as React from "react";
import { GlobalWorkerOptions } from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import {
  Download,
  FileIcon,
  Loader2,
  Music,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PdfPreviewWithAnnotations } from "./PdfPreviewWithAnnotations";
import { ImagePreviewWithAnnotations } from "./ImagePreviewWithAnnotations";
import { ExcelPreviewAndEditor } from "./ExcelPreviewAndEditor";
import { DocxPreviewAndEditor } from "./DocxPreviewAndEditor";
import { PptxPreviewAndEditor } from "./PptxPreviewAndEditor";

GlobalWorkerOptions.workerSrc = pdfjsWorker;

interface PreviewWrapperProps {
  children: React.ReactNode;
  className?: string;
  loading: boolean;
  error: string | null;
  onDownload: () => void;
}

function PreviewWrapper({
  children,
  className,
  loading,
  error,
  onDownload,
}: PreviewWrapperProps) {
  return (
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
}

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

  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "ico"].includes(ext)) {
    return <ImagePreviewWithAnnotations url={url} path={path} setLoading={setLoading} onDownload={onDownload} />;
  }

  if (ext === "pdf") {
    return (
      <PdfPreviewWithAnnotations
        url={url}
        path={path}
        onDownload={onDownload}
        setLoading={setLoading}
        setError={setError}
      />
    );
  }

  if (ext === "docx") {
    return (
      <DocxPreviewAndEditor
        url={url}
        path={path}
        onDownload={onDownload}
        setLoading={setLoading}
        setError={setError}
      />
    );
  }

  if (["xlsx", "xls", "csv"].includes(ext)) {
    return (
      <ExcelPreviewAndEditor url={url} path={path} setLoading={setLoading} setError={setError} onDownload={onDownload} />
    );
  }

  if (ext === "pptx") {
    return (
      <PreviewWrapper className="overflow-hidden" loading={loading} error={error} onDownload={onDownload}>
        <PptxPreviewAndEditor
          url={url}
          path={path}
          onDownload={onDownload}
          setLoading={setLoading}
          setError={setError}
        />
      </PreviewWrapper>
    );
  }

  if (ext === "ppt") {
    return (
      <PreviewWrapper className="items-center justify-center p-8" loading={loading} error={error} onDownload={onDownload}>
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
      <PreviewWrapper className="items-center justify-center p-12" loading={loading} error={error} onDownload={onDownload}>
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
      <PreviewWrapper loading={loading} error={error} onDownload={onDownload}>
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
    <div className="flex h-full min-h-60 flex-col items-center justify-center gap-3 bg-black p-4">
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

