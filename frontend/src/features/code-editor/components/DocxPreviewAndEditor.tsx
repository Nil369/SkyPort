import { useRef, useState, useEffect } from 'react';
import { DocxEditor, type DocxEditorRef } from '@eigenpal/docx-editor-react';
import '@eigenpal/docx-editor-react/styles.css';
import { Button } from '@/components/ui/button';
import { Save, Download, Printer, Loader, Maximize2, Minimize2 } from 'lucide-react';
import { siGoogledocs } from 'simple-icons';
import toast from 'react-hot-toast';
import { platformApi } from '@/features/platform/api';

interface DocxPreviewAndEditorProps {
  url: string;
  path: string;
  onDownload: () => void;
  setLoading: (v: boolean) => void;
  setError: (v: string | null) => void;
}

export function DocxPreviewAndEditor({ url, path, setLoading, setError }: DocxPreviewAndEditorProps) {
  const editorRef = useRef<DocxEditorRef>(null);
  const [documentBuffer, setDocumentBuffer] = useState<ArrayBuffer | undefined>(undefined);
  const [isSaving, setIsSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Fetch the DOCX file from server on mount
  useEffect(() => {
    let cancelled = false;

    const loadDocument = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch file as ArrayBuffer
        const fetchUrl = url + (url.includes('?') ? '&' : '?') + 'cb=' + Date.now();
        const response = await fetch(fetchUrl);
        
        if (!response.ok) {
          throw new Error(`Failed to fetch file: ${response.statusText}`);
        }

        const buffer = await response.arrayBuffer();
        if (!cancelled) {
          setDocumentBuffer(buffer);
        }
      } catch (err: any) {
        if (!cancelled) {
          const message = err?.message || 'Failed to load Word document';
          setError(message);
          toast.error(message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadDocument();
    return () => { cancelled = true; };
  }, [url, setLoading, setError]);

  // Handle save
  const handleSave = async () => {
    if (!editorRef.current) {
      toast.error('Editor not ready');
      return;
    }

    try {
      setIsSaving(true);
      
      // Get the edited document as ArrayBuffer
      const buffer = await editorRef.current.save();
      if (!buffer) {
        throw new Error('Failed to get document buffer');
      }
      
      // Convert to base64 for transmission
      const bytes = new Uint8Array(buffer);
      const chunkSize = 0x8000;
      const chunks: string[] = [];
      for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.subarray(i, i + chunkSize);
        chunks.push(String.fromCharCode(...chunk));
      }
      const base64data = btoa(chunks.join(''));

      // Save to server
      await platformApi.writeFile(path, base64data, 'base64');
      
      setIsDirty(false);
      toast.success('Document saved successfully');
    } catch (err: any) {
      const message = err?.response?.data?.error?.message ?? 'Failed to save document';
      toast.error(message);
      console.error('Save failed:', err);
    } finally {
      setIsSaving(false);
    }
  };

  // Handle download
  const handleDownload = async () => {
    if (!editorRef.current) return;

    try {
      const buffer = await editorRef.current.save();
      if (!buffer) {
        throw new Error('Failed to get document buffer');
      }
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = path.split('/').pop() || 'document.docx';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      toast.error('Failed to download document');
    }
  };

  // Handle print
  const handlePrint = () => {
    editorRef.current?.print();
  };

  // If document is still loading, show the loading state
  if (documentBuffer === undefined) {
    return (
      <div className="flex items-center justify-center bg-gray-100 dark:bg-slate-800 h-full w-full">
        <div className="text-center">
          <Loader className="w-12 h-12 animate-spin mx-auto mb-4 text-blue-600" />
          <p className="text-gray-600 dark:text-gray-400">Loading document...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col bg-white dark:bg-slate-900 ${isFullscreen ? 'fixed inset-0 z-50' : 'h-full w-full'}`}>
      {/* Header with Docx Studio branding - MS Word blue */}
      <div className="bg-[#185ABD] border-b border-[#0d408c] px-5 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-8 w-8 items-center justify-center rounded bg-white/15 text-white">
            <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden="true">
              <title>{siGoogledocs.title}</title>
              <path d={siGoogledocs.path} />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-white">Docx Studio</h1>
          <div className="ml-3 min-w-0 truncate text-sm text-blue-100 dark:text-blue-200">
            {path.split('/').pop()}
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap justify-end">
          {isDirty && (
            <div className="flex items-center gap-2 rounded-md border border-white/20 bg-white/10 px-3 py-1 text-white shadow-sm backdrop-blur-sm">
              <div className="w-2 h-2 rounded-full bg-amber-300 animate-pulse" />
              <span className="text-xs font-medium">Unsaved changes</span>
            </div>
          )}
          <Button
            onClick={handleSave}
            disabled={isSaving}
            size="sm"
            className="gap-2 border border-white/20 bg-white text-[#185ABD] font-semibold px-4 py-2 rounded-md shadow-sm transition-all hover:bg-blue-50 hover:shadow-md"
          >
            <Save className="w-4 h-4" />
            {isSaving ? 'Saving...' : 'Save'}
          </Button>

          <Button
            onClick={handleDownload}
            size="sm"
            className="gap-2 border border-white/20 bg-[#16A34A] text-white font-semibold px-4 py-2 rounded-md shadow-sm transition-all hover:bg-[#15803D] hover:shadow-md"
          >
            <Download className="w-4 h-4" />
            Download
          </Button>

          <Button
            onClick={handlePrint}
            size="sm"
            className="gap-2 border border-white/20 bg-[#7C3AED] text-white font-semibold px-4 py-2 rounded-md shadow-sm transition-all hover:bg-[#6D28D9] hover:shadow-md"
          >
            <Printer className="w-4 h-4" />
            Print
          </Button>

          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="rounded-md p-1.5 text-white transition hover:bg-white/10"
            title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          >
            {isFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Editor Container - Takes remaining space */}
      <div className="flex-1 overflow-hidden bg-white dark:bg-slate-800">
        <DocxEditor
          ref={editorRef}
          documentBuffer={documentBuffer}
          author="SkyPort User"
          showToolbar={true}
          onChange={() => {
            setIsDirty(true);
          }}
          onError={(error) => {
            console.error('Editor error:', error);
            toast.error('An error occurred in the editor');
          }}
        />
      </div>
    </div>
  );
}