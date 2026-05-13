import { useState, Suspense, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Download, Maximize2, ZoomIn, ZoomOut } from 'lucide-react';

interface FilePreviewProps {
  file?: File;
  url?: string;
  filename?: string;
  mimeType?: string;
}

export default function FilePreview({ file, url, filename, mimeType }: FilePreviewProps) {
  const [zoom, setZoom] = useState(100);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Detect MIME type from filename or use provided
  const getMimeType = useMemo(() => {
    if (mimeType) return mimeType;
    if (!filename) return 'application/octet-stream';

    const ext = filename.toLowerCase().split('.').pop() || '';
    const mimeMap: Record<string, string> = {
      // Documents
      pdf: 'application/pdf',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      doc: 'application/msword',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      xls: 'application/vnd.ms-excel',
      pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      ppt: 'application/vnd.ms-powerpoint',

      // Images
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      webp: 'image/webp',
      svg: 'image/svg+xml',
      ico: 'image/x-icon',
      bmp: 'image/bmp',
      tiff: 'image/tiff',

      // Audio
      mp3: 'audio/mpeg',
      wav: 'audio/wav',
      ogg: 'audio/ogg',
      m4a: 'audio/mp4',
      flac: 'audio/flac',

      // Video
      mp4: 'video/mp4',
      webm: 'video/webm',
      mkv: 'video/x-matroska',
      avi: 'video/x-msvideo',
      mov: 'video/quicktime',
      flv: 'video/x-flv',

      // Code & Text
      js: 'application/javascript',
      ts: 'text/typescript',
      jsx: 'application/jsx',
      tsx: 'application/tsx',
      json: 'application/json',
      py: 'text/x-python',
      go: 'text/x-go',
      java: 'text/x-java',
      cpp: 'text/x-c++src',
      c: 'text/x-c',
      cs: 'text/x-csharp',
      php: 'text/x-php',
      rb: 'text/x-ruby',
      sh: 'text/x-sh',
      yaml: 'text/yaml',
      yml: 'text/yaml',
      xml: 'text/xml',
      html: 'text/html',
      css: 'text/css',
      md: 'text/markdown',
      txt: 'text/plain',
      rst: 'text/x-rst',
      csv: 'text/csv',
    };

    return mimeMap[ext] || 'application/octet-stream';
  }, [mimeType, filename]);

  const fileContent = useMemo(async () => {
    if (!file) return null;
    return await file.text().catch(() => null);
  }, [file]);

  // Determine preview type
  const isImage = getMimeType.startsWith('image/');
  const isAudio = getMimeType.startsWith('audio/');
  const isVideo = getMimeType.startsWith('video/');
  const isCode = getMimeType.includes('javascript') || getMimeType.includes('typescript') ||
                 getMimeType.includes('python') || getMimeType.includes('go') ||
                 getMimeType.includes('java') || getMimeType.includes('x-c') ||
                 getMimeType.includes('php') || getMimeType.includes('ruby') ||
                 getMimeType.includes('sh') || getMimeType.includes('yaml');
  const isMarkdown = getMimeType === 'text/markdown';
  const isText = getMimeType.startsWith('text/') || isCode || isMarkdown;
  const isPDF = getMimeType === 'application/pdf';
  const isDocument = getMimeType.includes('word') || getMimeType.includes('excel') || 
                    getMimeType.includes('powerpoint');

  const getFileSource = () => url || (file ? URL.createObjectURL(file) : null);
  const fileSource = getFileSource();

  const containerClass = isFullscreen 
    ? 'fixed inset-0 bg-black z-50 flex flex-col'
    : 'border rounded-lg bg-muted overflow-hidden max-h-96';

  const contentClass = isFullscreen
    ? 'flex-1 overflow-auto'
    : 'relative overflow-auto max-h-96';

  return (
    <div className={containerClass}>
      {/* Header */}
      <div className="flex items-center justify-between bg-background border-b p-3 shrink-0">
        <div className="text-sm font-medium truncate">
          {filename || 'File Preview'}
        </div>
        <div className="flex items-center gap-2">
          {isImage && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setZoom(z => Math.max(50, z - 10))}
              >
                <ZoomOut className="w-4 h-4" />
              </Button>
              <span className="text-xs text-muted-foreground w-12 text-center">{zoom}%</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setZoom(z => Math.min(200, z + 10))}
              >
                <ZoomIn className="w-4 h-4" />
              </Button>
            </>
          )}
          {fileSource && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const a = document.createElement('a');
                a.href = fileSource;
                a.download = filename || 'download';
                a.click();
              }}
            >
              <Download className="w-4 h-4" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsFullscreen(!isFullscreen)}
          >
            <Maximize2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className={contentClass}>
        {isImage && fileSource && (
          <div className="flex items-center justify-center p-4 bg-black/50">
            <img
              src={fileSource}
              alt={filename}
              style={{
                maxWidth: '100%',
                maxHeight: '100%',
                transform: `scale(${zoom / 100})`,
                transformOrigin: 'center',
              }}
              className="object-contain"
            />
          </div>
        )}

        {isAudio && fileSource && (
          <div className="flex items-center justify-center p-8">
            <audio
              controls
              className="w-full max-w-md"
              src={fileSource}
            />
          </div>
        )}

        {isVideo && fileSource && (
          <div className="flex items-center justify-center bg-black">
            <video
              controls
              className="w-full h-full max-h-96"
              src={fileSource}
            />
          </div>
        )}

        {isPDF && fileSource && (
          <div className="flex items-center justify-center p-4">
            <iframe
              src={`${fileSource}#toolbar=0`}
              className="w-full h-96"
              title={filename}
            />
          </div>
        )}

        {isDocument && (
          <div className="flex items-center justify-center p-8 text-center">
            <div>
              <p className="text-muted-foreground mb-4">
                Document preview not available in browser
              </p>
              {fileSource && (
                <a href={fileSource} download={filename} className="text-blue-500 hover:underline">
                  Download {filename}
                </a>
              )}
            </div>
          </div>
        )}

        {isText && fileContent && (
          <Suspense fallback={<div className="p-4">Loading code editor...</div>}>
            <div className="text-xs font-mono overflow-auto max-h-96 bg-muted p-4">
              <pre className="whitespace-pre-wrap break-words">{fileContent}</pre>
            </div>
          </Suspense>
        )}

        {!isImage && !isAudio && !isVideo && !isPDF && !isDocument && !isText && (
          <div className="flex items-center justify-center p-8 text-center">
            <div>
              <p className="text-muted-foreground mb-4">
                Preview not available for this file type
              </p>
              <p className="text-xs text-muted-foreground">
                MIME Type: {getMimeType}
              </p>
              {fileSource && (
                <a href={fileSource} download={filename} className="text-blue-500 hover:underline mt-4 block">
                  Download {filename}
                </a>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
