import { useState, useEffect } from 'react';
import { FileCode, FileText, FileImage, FileVideo, FileAudio, File, Download, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import toast from 'react-hot-toast';

interface FilePreviewProps {
  fileUrl: string;
  fileName: string;
  fileType?: string;
}

const MIME_TYPES: Record<string, FileKind> = {
  // Text
  'text/plain': 'text',
  'text/html': 'code',
  'text/css': 'code',
  'text/javascript': 'code',
  'application/json': 'code',
  'application/yaml': 'code',
  'text/x-python': 'code',
  'text/x-java': 'code',
  'text/x-go': 'code',
  'application/x-sh': 'code',
  'text/markdown': 'text',
  'text/x-sql': 'code',

  // Images
  'image/jpeg': 'image',
  'image/png': 'image',
  'image/gif': 'image',
  'image/webp': 'image',
  'image/svg+xml': 'image',
  'image/x-icon': 'image',

  // Video
  'video/mp4': 'video',
  'video/webm': 'video',
  'video/x-matroska': 'video',
  'video/quicktime': 'video',

  // Audio
  'audio/mpeg': 'audio',
  'audio/wav': 'audio',
  'audio/ogg': 'audio',
  'audio/flac': 'audio',

  // Documents
  'application/pdf': 'pdf',
  'application/msword': 'document',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'document',
  'application/vnd.ms-excel': 'document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'document',
  'application/vnd.ms-powerpoint': 'document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'document',
};

type FileKind = 'text' | 'code' | 'image' | 'video' | 'audio' | 'pdf' | 'document' | 'unknown';

function getMimeType(fileName: string, fileType?: string): FileKind {
  if (fileType && fileType in MIME_TYPES) {
    return MIME_TYPES[fileType] as FileKind;
  }

  const ext = fileName.split('.').pop()?.toLowerCase() || '';

  const extensionMap: { [key: string]: FileKind } = {
    // Code
    'js': 'code',
    'ts': 'code',
    'jsx': 'code',
    'tsx': 'code',
    'json': 'code',
    'yaml': 'code',
    'yml': 'code',
    'py': 'code',
    'java': 'code',
    'go': 'code',
    'rs': 'code',
    'rb': 'code',
    'php': 'code',
    'cs': 'code',
    'sh': 'code',
    'bash': 'code',
    'sql': 'code',
    'html': 'code',
    'css': 'code',
    'scss': 'code',
    'less': 'code',
    'vue': 'code',
    'kotlin': 'code',

    // Text
    'txt': 'text',
    'md': 'text',
    'markdown': 'text',
    'rst': 'text',

    // Images
    'jpg': 'image',
    'jpeg': 'image',
    'png': 'image',
    'gif': 'image',
    'webp': 'image',
    'svg': 'image',
    'ico': 'image',
    'bmp': 'image',

    // Video
    'mp4': 'video',
    'webm': 'video',
    'mkv': 'video',
    'mov': 'video',
    'avi': 'video',
    'flv': 'video',

    // Audio
    'mp3': 'audio',
    'wav': 'audio',
    'ogg': 'audio',
    'flac': 'audio',
    'aac': 'audio',

    // Documents
    'pdf': 'pdf',
    'doc': 'document',
    'docx': 'document',
    'xls': 'document',
    'xlsx': 'document',
    'ppt': 'document',
    'pptx': 'document',
  };

  return extensionMap[ext] || 'unknown';
}

function getFileIcon(kind: FileKind) {
  switch (kind) {
    case 'code':
      return <FileCode className="w-6 h-6" />;
    case 'image':
      return <FileImage className="w-6 h-6" />;
    case 'video':
      return <FileVideo className="w-6 h-6" />;
    case 'audio':
      return <FileAudio className="w-6 h-6" />;
    case 'text':
      return <FileText className="w-6 h-6" />;
    default:
      return <File className="w-6 h-6" />;
  }
}

function CodePreview({ content }: { content: string }) {
  return (
    <pre className="p-4 bg-slate-900 rounded overflow-auto max-h-96 text-sm font-mono text-slate-100">
      <code>{content}</code>
    </pre>
  );
}

function ImagePreview({ url }: { url: string }) {
  return (
    <div className="flex items-center justify-center max-h-96 bg-slate-900 rounded overflow-auto">
      <img src={url} alt="Preview" className="max-w-full max-h-full object-contain" />
    </div>
  );
}

function AudioPreview({ url }: { url: string }) {
  return (
    <div className="p-4 bg-slate-900 rounded">
      <audio controls className="w-full">
        <source src={url} />
        Your browser does not support the audio element.
      </audio>
    </div>
  );
}

function VideoPreview({ url }: { url: string }) {
  return (
    <div className="bg-slate-900 rounded overflow-hidden max-h-96">
      <video controls className="w-full h-full">
        <source src={url} />
        Your browser does not support the video element.
      </video>
    </div>
  );
}

export function FilePreview({ fileUrl, fileName, fileType }: FilePreviewProps) {
  const [content, setContent] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const kind = getMimeType(fileName, fileType);

  useEffect(() => {
    if (kind === 'code' || kind === 'text') {
      setIsLoading(true);
      fetch(fileUrl)
        .then((res) => res.text())
        .then((text) => {
          setContent(text);
          setIsLoading(false);
        })
        .catch((err) => {
          setError(`Failed to load file: ${err.message}`);
          setIsLoading(false);
        });
    } else {
      setIsLoading(false);
    }
  }, [fileUrl, kind]);

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = fileUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Download started');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {getFileIcon(kind)}
          <div>
            <p className="font-medium">{fileName}</p>
            <p className="text-sm text-slate-500">{kind}</p>
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={handleDownload}>
          <Download className="w-4 h-4 mr-2" />
          Download
        </Button>
      </div>

      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg flex items-start gap-2 text-red-600 dark:text-red-400">
          <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <>
          {kind === 'code' && content && <CodePreview content={content} />}
          {kind === 'text' && content && <CodePreview content={content} />}
          {kind === 'image' && <ImagePreview url={fileUrl} />}
          {kind === 'audio' && <AudioPreview url={fileUrl} />}
          {kind === 'video' && <VideoPreview url={fileUrl} />}
          {kind === 'unknown' && (
            <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg text-yellow-600 dark:text-yellow-400">
              Preview not available for this file type. Please download to view.
            </div>
          )}
        </>
      )}
    </div>
  );
}
