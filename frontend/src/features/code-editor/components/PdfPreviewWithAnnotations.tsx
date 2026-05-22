import React, { useRef, useState, useEffect, useCallback } from 'react';
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { useAnnotationStore } from '@/stores/annotationStore';
import { Button } from '@/components/ui/button';
import {
  ZoomIn,
  ZoomOut,
  Highlighter,
  Type,
  Square,
  Trash2,
  Download,
  MousePointer,
  Pen,
  Search,
  FileText,
  X,
  Layers,
  Maximize2,
  Minimize2,
  Save,
  Eraser
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { cn } from '@/lib/utils';
import { platformApi } from '@/features/platform/api';
import toast from 'react-hot-toast';

GlobalWorkerOptions.workerSrc = pdfjsWorker;

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
  onDownload,
  setLoading,
  setError,
}: PdfPreviewWithAnnotationsProps) {
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const annotationCanvasRef = useRef<HTMLCanvasElement>(null);
  
  const [zoom, setZoom] = useState(100);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  
  // Interactive state
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [activeDrawPath, setActiveDrawPath] = useState<Array<[number, number]>>([]);
  const [dragStartPos, setDragStartPos] = useState<{ x: number; y: number } | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(null);
  const [resizeHandle, setResizeHandle] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const pdfContainerRef = useRef<HTMLDivElement>(null);
  const renderTaskRef = useRef<any>(null);
  
  // Sidebar state
  const [showSidebar, setShowSidebar] = useState(true);
  const [sidebarSearch, setSidebarSearch] = useState("");

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      pdfContainerRef.current?.requestFullscreen?.();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.();
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const handleFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handleFsChange);
    return () => document.removeEventListener("fullscreenchange", handleFsChange);
  }, []);

  const {
    currentTool,
    currentColor,
    addAnnotation,
    getAnnotations,
    removeAnnotation,
    updateAnnotation,
    clearAnnotations
  } = useAnnotationStore();

  const fileAnnotations = getAnnotations(path);
  const pageAnnotations = fileAnnotations?.annotations.filter(a => a.page === currentPage) ?? [];
  const allAnnotations = fileAnnotations?.annotations ?? [];

  // Load saved annotations from server on path change
  useEffect(() => {
    const loadSavedAnnotations = async () => {
      try {
        const annotPath = `${path}.annotations.json`;
        const res = await platformApi.readFile(annotPath);
        if (res && res.content) {
          const parsed = JSON.parse(res.content);
          if (parsed && Array.isArray(parsed.annotations)) {
            clearAnnotations(path);
            parsed.annotations.forEach((ann: any) => {
              addAnnotation(path, 'pdf', ann);
            });
            toast.success("Annotations loaded from server");
          }
        }
      } catch (err) {
        console.log("No saved annotations file found on server or error reading it.");
      }
    };
    loadSavedAnnotations();
  }, [path]);

  const handleSaveAnnotations = async () => {
    try {
      const annotPath = `${path}.annotations.json`;
      const dataString = JSON.stringify({
        filePath: path,
        fileType: 'pdf',
        annotations: allAnnotations
      }, null, 2);
      const base64 = btoa(unescape(encodeURIComponent(dataString)));
      await platformApi.writeFile(annotPath, base64, 'base64');
      toast.success("Annotations saved to server");
    } catch (err) {
      console.error(err);
      toast.error("Failed to save annotations to server");
    }
  };

  // Load PDF Document
  useEffect(() => {
    let cancelled = false;
    setSelectedId(null);
    setIsDrawing(false);

    (async () => {
      try {
        setLoading(true);
        const loadingTask = getDocument({ url, withCredentials: false });
        const doc = await loadingTask.promise;
        
        if (cancelled) {
          await doc.destroy().catch(() => {});
          return;
        }
        
        setPdfDoc(doc);
        setTotalPages(doc.numPages);
        setCurrentPage(1);
        setLoading(false);
      } catch (e) {
        if (!cancelled) {
          console.error(e);
          setError('Failed to load PDF file.');
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [url, setLoading, setError]);

  // Render current PDF page
  useEffect(() => {
    let cancelled = false;
    const renderPage = async () => {
      if (!pdfDoc || !canvasContainerRef.current) return;

      // Cancel previous active render task
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch (e) {
          // ignore
        }
        renderTaskRef.current = null;
      }

      try {
        const page = await pdfDoc.getPage(currentPage);
        if (cancelled) return;

        const pdfScale = zoom / 100;
        const viewport = page.getViewport({ scale: pdfScale });

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.className = 'mx-auto block max-w-full shadow-lg border border-white/5';

        setScale(pdfScale);
        
        canvasContainerRef.current.innerHTML = '';
        canvasContainerRef.current.appendChild(canvas);

        const renderTask = page.render({ canvasContext: ctx, viewport });
        renderTaskRef.current = renderTask;

        await renderTask.promise;
        renderTaskRef.current = null;
        
        if (!cancelled) {
          redrawAnnotations();
        }
      } catch (e: any) {
        if (e && (e.name === 'HeadingStatus' || e.name === 'RenderingCancelledException' || e.message?.includes('cancelled'))) {
          // Normal cancellation
          return;
        }
        console.error('Error rendering page:', e);
      }
    };

    renderPage();
    return () => {
      cancelled = true;
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch (e) {}
      }
    };
  }, [pdfDoc, currentPage, zoom]);

  // Redraw annotations on Canvas overlay
  const redrawAnnotations = useCallback(() => {
    if (!annotationCanvasRef.current || !canvasContainerRef.current) return;

    const pdfCanvas = canvasContainerRef.current.querySelector('canvas') as HTMLCanvasElement;
    if (!pdfCanvas) return;

    const annotCtx = annotationCanvasRef.current.getContext('2d');
    if (!annotCtx) return;

    // Match overlay canvas size to rendered PDF canvas
    annotationCanvasRef.current.width = pdfCanvas.width;
    annotationCanvasRef.current.height = pdfCanvas.height;

    // Clear previous drawing frame
    annotCtx.clearRect(0, 0, annotationCanvasRef.current.width, annotationCanvasRef.current.height);

    // Draw saved annotations
    pageAnnotations.forEach(ann => {
      const x = ann.x * scale;
      const y = ann.y * scale;
      const w = ann.width * scale;
      const h = ann.height * scale;

      annotCtx.save();

      if (ann.type === 'highlight') {
        annotCtx.fillStyle = ann.color + '45'; // Transparent highlighter fill
        annotCtx.fillRect(x, y, w, h);
      } else if (ann.type === 'rectangle') {
        annotCtx.strokeStyle = ann.color;
        annotCtx.lineWidth = 2.5;
        annotCtx.strokeRect(x, y, w, h);
      } else if (ann.type === 'text') {
        annotCtx.fillStyle = ann.color;
        annotCtx.font = 'bold 12px Inter, sans-serif';
        annotCtx.fillText(ann.text || '[note]', x, y - 5);
        
        annotCtx.strokeStyle = ann.color + '25';
        annotCtx.lineWidth = 1;
        annotCtx.strokeRect(x, y - 16, Math.max(80, w), Math.max(20, h));
      } else if (ann.type === 'draw' && ann.path && ann.path.length > 0) {
        annotCtx.strokeStyle = ann.color;
        annotCtx.lineWidth = 3;
        annotCtx.lineCap = 'round';
        annotCtx.lineJoin = 'round';
        annotCtx.beginPath();
        annotCtx.moveTo(ann.path[0][0] * scale, ann.path[0][1] * scale);
        for (let i = 1; i < ann.path.length; i++) {
          annotCtx.lineTo(ann.path[i][0] * scale, ann.path[i][1] * scale);
        }
        annotCtx.stroke();
      }

      // Draw selection active outline and handles in Cursor Mode
      if (selectedId === ann.id && currentTool === 'cursor') {
        // Dashed bounding box
        annotCtx.strokeStyle = '#3b82f6';
        annotCtx.lineWidth = 1.5;
        annotCtx.setLineDash([5, 5]);
        annotCtx.strokeRect(x - 2, y - 2, w + 4, h + 4);
        annotCtx.setLineDash([]);

        // Handle squares on corners
        annotCtx.fillStyle = '#ffffff';
        annotCtx.strokeStyle = '#3b82f6';
        annotCtx.lineWidth = 1.5;
        const handleSize = 6;
        
        // 4 corners: nw, ne, se, sw
        const corners = [
          [x - 2, y - 2],
          [x + w + 2, y - 2],
          [x + w + 2, y + h + 2],
          [x - 2, y + h + 2]
        ];
        
        corners.forEach(([cx, cy]) => {
          annotCtx.fillRect(cx - handleSize / 2, cy - handleSize / 2, handleSize, handleSize);
          annotCtx.strokeRect(cx - handleSize / 2, cy - handleSize / 2, handleSize, handleSize);
        });
      }

      annotCtx.restore();
    });

    // Draw active drawing ink line preview
    if (isDrawing && currentTool === 'draw' && activeDrawPath.length > 0) {
      annotCtx.save();
      annotCtx.strokeStyle = currentColor;
      annotCtx.lineWidth = 3;
      annotCtx.lineCap = 'round';
      annotCtx.lineJoin = 'round';
      annotCtx.beginPath();
      annotCtx.moveTo(activeDrawPath[0][0] * scale, activeDrawPath[0][1] * scale);
      for (let i = 1; i < activeDrawPath.length; i++) {
        annotCtx.lineTo(activeDrawPath[i][0] * scale, activeDrawPath[i][1] * scale);
      }
      annotCtx.stroke();
      annotCtx.restore();
    }
  }, [pageAnnotations, selectedId, currentTool, scale, isDrawing, activeDrawPath, currentColor]);

  useEffect(() => {
    redrawAnnotations();
  }, [redrawAnnotations]);

  // Check which annotation is hit by click coordinates (x, y)
  const findAnnotationAt = (x: number, y: number): any | null => {
    for (let i = pageAnnotations.length - 1; i >= 0; i--) {
      const ann = pageAnnotations[i];
      const annX = ann.x * scale;
      const annY = ann.y * scale;
      const annW = ann.width * scale;
      const annH = ann.height * scale;

      if (ann.type === 'draw' && ann.path) {
        // Check distance to pen points
        for (const pt of ann.path) {
          const px = pt[0] * scale;
          const py = pt[1] * scale;
          if (Math.hypot(px - x, py - y) < 12) return ann;
        }
      } else {
        if (x >= annX && x <= annX + annW && y >= annY && y <= annY + annH) {
          return ann;
        }
      }
    }
    return null;
  };

  // Get resize handle under mouse coordinates
  const getHandleAt = (x: number, y: number, ann: any): string | null => {
    const handleSize = 8;
    const ax = ann.x * scale;
    const ay = ann.y * scale;
    const aw = ann.width * scale;
    const ah = ann.height * scale;

    const corners = {
      nw: [ax, ay],
      ne: [ax + aw, ay],
      se: [ax + aw, ay + ah],
      sw: [ax, ay + ah]
    };

    for (const [handle, pos] of Object.entries(corners)) {
      if (Math.hypot(pos[0] - x, pos[1] - y) <= handleSize + 4) {
        return handle;
      }
    }
    return null;
  };

  // Double click text box to edit
  const handleCanvasDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (currentTool !== 'cursor') return;

    const canvas = annotationCanvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const y = (e.clientY - rect.top) * (canvas.height / rect.height);

    const hit = findAnnotationAt(x, y);
    if (hit && hit.type === 'text') {
      const input = prompt("Edit note text:", hit.text);
      if (input !== null && input.trim() !== "") {
        updateAnnotation(path, { ...hit, text: input });
      }
    }
  };

  // Mouse Actions for Annotation Editing & Creation
  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = annotationCanvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const y = (e.clientY - rect.top) * (canvas.height / rect.height);

    if (currentTool === 'eraser') {
      setIsDrawing(true);
      const hit = findAnnotationAt(x, y);
      if (hit) {
        removeAnnotation(path, hit.id);
      }
      return;
    }

    if (currentTool === 'cursor') {
      // 1. Check selected annotation handle hits
      if (selectedId) {
        const ann = pageAnnotations.find(a => a.id === selectedId);
        if (ann) {
          const handle = getHandleAt(x, y, ann);
          if (handle) {
            setResizeHandle(handle);
            setDragStartPos({ x, y });
            return;
          }
        }
      }

      // 2. Check general shape hit to drag/move
      const hit = findAnnotationAt(x, y);
      if (hit) {
        setSelectedId(hit.id);
        setDragStartPos({ x, y });
        setDragOffset({
          x: x - hit.x * scale,
          y: y - hit.y * scale
        });
      } else {
        setSelectedId(null);
      }
      return;
    }

    // Creating new annotations
    if (currentTool === 'draw') {
      setIsDrawing(true);
      setActiveDrawPath([[x / scale, y / scale]]);
    } else {
      setDragStartPos({ x, y });
      setIsDrawing(true);
    }
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = annotationCanvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const y = (e.clientY - rect.top) * (canvas.height / rect.height);

    // Hover Cursor changes
    if (currentTool === 'cursor' && !dragStartPos) {
      if (selectedId) {
        const ann = pageAnnotations.find(a => a.id === selectedId);
        if (ann) {
          const handle = getHandleAt(x, y, ann);
          if (handle) {
            canvas.style.cursor = (handle === 'nw' || handle === 'se') ? 'nwse-resize' : 'nesw-resize';
            return;
          }
        }
      }
      const hit = findAnnotationAt(x, y);
      canvas.style.cursor = hit ? 'move' : 'default';
      return;
    }

    if (currentTool === 'eraser' && isDrawing) {
      const hit = findAnnotationAt(x, y);
      if (hit) {
        removeAnnotation(path, hit.id);
      }
      return;
    }

    if (!dragStartPos && !isDrawing) return;

    // Resizing shape
    if (resizeHandle && selectedId && dragStartPos) {
      const ann = pageAnnotations.find(a => a.id === selectedId);
      if (!ann) return;

      const minSize = 8;
      const mx = x / scale;
      const my = y / scale;

      let nextX = ann.x;
      let nextY = ann.y;
      let nextW = ann.width;
      let nextH = ann.height;

      if (resizeHandle === 'se') {
        nextW = Math.max(minSize, mx - ann.x);
        nextH = Math.max(minSize, my - ann.y);
      } else if (resizeHandle === 'sw') {
        const right = ann.x + ann.width;
        nextX = Math.min(right - minSize, mx);
        nextW = right - nextX;
        nextH = Math.max(minSize, my - ann.y);
      } else if (resizeHandle === 'ne') {
        const bottom = ann.y + ann.height;
        nextY = Math.min(bottom - minSize, my);
        nextH = bottom - nextY;
        nextW = Math.max(minSize, mx - ann.x);
      } else if (resizeHandle === 'nw') {
        const right = ann.x + ann.width;
        const bottom = ann.y + ann.height;
        nextX = Math.min(right - minSize, mx);
        nextW = right - nextX;
        nextY = Math.min(bottom - minSize, my);
        nextH = bottom - nextY;
      }

      updateAnnotation(path, {
        ...ann,
        x: nextX,
        y: nextY,
        width: nextW,
        height: nextH
      });
      return;
    }

    // Dragging / Moving shape
    if (dragStartPos && dragOffset && selectedId) {
      const ann = pageAnnotations.find(a => a.id === selectedId);
      if (!ann) return;

      const nx = (x - dragOffset.x) / scale;
      const ny = (y - dragOffset.y) / scale;

      updateAnnotation(path, {
        ...ann,
        x: nx,
        y: ny
      });
      return;
    }

    // Pen tool path updates
    if (currentTool === 'draw' && isDrawing) {
      setActiveDrawPath(prev => [...prev, [x / scale, y / scale]]);
      redrawAnnotations();
    }
  };

  const handleCanvasMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = annotationCanvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const y = (e.clientY - rect.top) * (canvas.height / rect.height);

    if (currentTool === 'cursor') {
      setDragStartPos(null);
      setDragOffset(null);
      setResizeHandle(null);
      return;
    }

    if (currentTool === 'eraser') {
      setIsDrawing(false);
      setDragStartPos(null);
      return;
    }

    if (!isDrawing) return;

    if (currentTool === 'draw') {
      if (activeDrawPath.length > 1) {
        addAnnotation(path, 'pdf', {
          id: uuidv4(),
          type: 'draw',
          page: currentPage,
          x: Math.min(...activeDrawPath.map(p => p[0])),
          y: Math.min(...activeDrawPath.map(p => p[1])),
          width: Math.max(...activeDrawPath.map(p => p[0])) - Math.min(...activeDrawPath.map(p => p[0])),
          height: Math.max(...activeDrawPath.map(p => p[1])) - Math.min(...activeDrawPath.map(p => p[1])),
          color: currentColor,
          path: activeDrawPath,
          timestamp: Date.now(),
        });
      }
      setIsDrawing(false);
      setActiveDrawPath([]);
      return;
    }

    // Box-based shapes
    if (dragStartPos) {
      const startX = dragStartPos.x / scale;
      const startY = dragStartPos.y / scale;
      const endX = x / scale;
      const endY = y / scale;

      const w = Math.abs(endX - startX);
      const h = Math.abs(endY - startY);

      if (w > 4 && h > 4) {
        let textVal = undefined;
        if (currentTool === 'text') {
          const input = prompt("Enter note text:", "Note");
          if (input === null || input.trim() === "") {
            setIsDrawing(false);
            setDragStartPos(null);
            return;
          }
          textVal = input;
        }

        const newId = uuidv4();
        addAnnotation(path, 'pdf', {
          id: newId,
          type: currentTool as any,
          page: currentPage,
          x: Math.min(startX, endX),
          y: Math.min(startY, endY),
          width: w,
          height: h,
          color: currentColor,
          text: textVal,
          timestamp: Date.now(),
        });

        setSelectedId(newId);
      }
    }

    setIsDrawing(false);
    setDragStartPos(null);
  };

  // Search/Filter annotations list
  const filteredAnnotations = allAnnotations.filter(ann => {
    if (!sidebarSearch.trim()) return true;
    const query = sidebarSearch.toLowerCase();
    const typeMatch = ann.type.toLowerCase().includes(query);
    const textMatch = ann.text && ann.text.toLowerCase().includes(query);
    return typeMatch || textMatch;
  });

  return (
    <div ref={pdfContainerRef} className={cn("flex h-full flex-col bg-zinc-950 text-zinc-100 font-sans select-none", isFullscreen && "fixed inset-0 z-50")}>
      {/* Top Main Toolbar */}
      <div className="border-b border-white/10 bg-zinc-900 px-4 py-2.5 flex flex-wrap items-center justify-between gap-4 shrink-0 shadow-md">
        {/* Title Details */}
        <div className="flex items-center gap-3">
          <div className="bg-red-600 text-white font-extrabold text-xs h-7 w-7 flex items-center justify-center rounded shadow select-none">
            PDF
          </div>
          <div>
            <span className="font-bold text-sm tracking-wide block">PDF Annotator Studio</span>
            <span className="text-[10px] text-zinc-400 font-mono truncate block max-w-[280px]">
              {path.split("/").pop()}
            </span>
          </div>
        </div>

        {/* Action Tool Set */}
        <div className="flex items-center gap-1.5 bg-white/5 rounded-lg p-1 border border-white/10">
          <Button
            size="sm"
            variant="ghost"
            className={cn(
              "h-8 px-2.5 text-zinc-400 hover:text-white hover:bg-white/10 flex items-center gap-1.5",
              currentTool === 'cursor' && 'bg-blue-600/90 text-white hover:bg-blue-600'
            )}
            onClick={() => useAnnotationStore.setState({ currentTool: 'cursor' })}
            title="Cursor / Edit shapes (Press Backspace to delete selected)"
          >
            <MousePointer className="h-4 w-4" />
            <span className="text-xs font-semibold">Select</span>
          </Button>

          <div className="w-px h-5 bg-white/10 mx-1" />

          <Button
            size="sm"
            variant="ghost"
            className={cn(
              "h-8 w-8 p-0 transition-all",
              currentTool === 'draw' ? "text-white" : "text-zinc-400 hover:text-white hover:bg-white/10"
            )}
            style={currentTool === 'draw' ? { backgroundColor: currentColor } : {}}
            onClick={() => useAnnotationStore.setState({ currentTool: 'draw' })}
            title="Pen Drawing"
          >
            <Pen className="h-4 w-4" />
          </Button>

          <Button
            size="sm"
            variant="ghost"
            className={cn(
              "h-8 w-8 p-0 transition-all",
              currentTool === 'highlight' ? "text-white" : "text-zinc-400 hover:text-white hover:bg-white/10"
            )}
            style={currentTool === 'highlight' ? { backgroundColor: currentColor + '40', color: currentColor, border: `1px solid ${currentColor}` } : {}}
            onClick={() => useAnnotationStore.setState({ currentTool: 'highlight' })}
            title="Highlighter"
          >
            <Highlighter className="h-4 w-4" />
          </Button>

          <Button
            size="sm"
            variant="ghost"
            className={cn(
              "h-8 w-8 p-0 transition-all",
              currentTool === 'text' ? "text-white" : "text-zinc-400 hover:text-white hover:bg-white/10"
            )}
            style={currentTool === 'text' ? { backgroundColor: currentColor } : {}}
            onClick={() => useAnnotationStore.setState({ currentTool: 'text' })}
            title="Add Text note"
          >
            <Type className="h-4 w-4" />
          </Button>

          <Button
            size="sm"
            variant="ghost"
            className={cn(
              "h-8 w-8 p-0 transition-all",
              currentTool === 'rectangle' ? "text-white" : "text-zinc-400 hover:text-white hover:bg-white/10"
            )}
            style={currentTool === 'rectangle' ? { backgroundColor: currentColor + '20', color: currentColor, border: `1px solid ${currentColor}` } : {}}
            onClick={() => useAnnotationStore.setState({ currentTool: 'rectangle' })}
            title="Draw Rectangle"
          >
            <Square className="h-4 w-4" />
          </Button>

          <Button
            size="sm"
            variant="ghost"
            className={cn(
              "h-8 w-8 p-0 transition-all",
              currentTool === 'eraser' ? "bg-red-600 text-white" : "text-zinc-400 hover:text-white hover:bg-white/10"
            )}
            onClick={() => useAnnotationStore.setState({ currentTool: 'eraser' })}
            title="Eraser tool"
          >
            <Eraser className="h-4 w-4" />
          </Button>
        </div>

        {/* Color picker */}
        <div className="flex items-center gap-2 bg-white/5 rounded-lg px-3 py-1 border border-white/10">
          <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Color</label>
          <input
            type="color"
            value={currentColor}
            onChange={(e) => useAnnotationStore.setState({ currentColor: e.target.value })}
            className="h-7 w-8 cursor-pointer rounded border border-white/10 bg-transparent"
          />
        </div>

        {/* Zoom & Navigation Actions */}
        <div className="flex items-center gap-3">
          {/* Zoom controls */}
          <div className="flex items-center gap-1.5 bg-white/5 rounded-lg p-1 border border-white/10 text-xs">
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-zinc-400 hover:text-white hover:bg-white/10"
              onClick={() => setZoom(Math.max(50, zoom - 10))}
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </Button>
            <span className="min-w-10 text-center font-mono font-bold text-zinc-300">{zoom}%</span>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-zinc-400 hover:text-white hover:bg-white/10"
              onClick={() => setZoom(Math.min(200, zoom + 10))}
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </Button>
          </div>

          <div className="h-6 border-r border-white/10" />

          {/* Page nav */}
          <div className="flex items-center gap-1 bg-white/5 rounded-lg p-1 border border-white/10 text-xs">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-zinc-400 hover:text-white hover:bg-white/10"
              onClick={() => {
                setCurrentPage(Math.max(1, currentPage - 1));
                setSelectedId(null);
              }}
              disabled={currentPage === 1}
            >
              ←
            </Button>
            <span className="min-w-12 text-center font-mono font-bold text-zinc-300">
              {currentPage} / {totalPages}
            </span>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-zinc-400 hover:text-white hover:bg-white/10"
              onClick={() => {
                setCurrentPage(Math.min(totalPages, currentPage + 1));
                setSelectedId(null);
              }}
              disabled={currentPage === totalPages}
            >
              →
            </Button>
          </div>

          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 text-zinc-400 hover:text-white hover:bg-white/10"
            onClick={onDownload}
            title="Download original file"
          >
            <Download className="h-4 w-4" />
          </Button>

          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 text-zinc-400 hover:text-white hover:bg-white/10"
            onClick={handleSaveAnnotations}
            title="Export annotations as JSON"
            disabled={allAnnotations.length === 0}
          >
            <Save className="h-4 w-4" />
          </Button>

          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 text-zinc-400 hover:text-white hover:bg-white/10"
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>

          <Button
            size="icon"
            variant="ghost"
            className={cn("h-8 w-8 text-zinc-400 hover:text-white hover:bg-white/10", showSidebar && "bg-white/10 text-white")}
            onClick={() => setShowSidebar(!showSidebar)}
            title="Toggle annotations list panel"
          >
            <Layers className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Main Viewport Workspace: PDF + Sidebar */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* PDF Canvas Workspace Area */}
        <div className="flex-1 overflow-auto bg-zinc-900/50 p-6 flex justify-center items-start min-w-0 scrollbar-thin">
          <div className="relative shadow-2xl rounded-lg border border-white/5 bg-white select-none">
            <div ref={canvasContainerRef} className="z-0" />
            <canvas
              ref={annotationCanvasRef}
              onMouseDown={handleCanvasMouseDown}
              onMouseMove={handleCanvasMouseMove}
              onMouseUp={handleCanvasMouseUp}
              onDoubleClick={handleCanvasDoubleClick}
              className="absolute inset-0 z-10 block"
            />
          </div>
        </div>

        {/* Collapsible glassmorphic sidebar panel */}
        {showSidebar && (
          <div className="w-76 border-l border-white/10 bg-zinc-900/90 backdrop-blur-md flex flex-col shrink-0 min-h-0 select-none">
            <div className="p-4 border-b border-white/10 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-red-500" />
                <span className="font-bold text-xs uppercase tracking-wider text-zinc-300">
                  Annotations ({allAnnotations.length})
                </span>
              </div>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6 text-zinc-500 hover:text-white"
                onClick={() => setShowSidebar(false)}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>

            {/* Sidebar Search */}
            <div className="p-3 border-b border-white/5 shrink-0">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-zinc-500" />
                <input
                  type="text"
                  placeholder="Search notes..."
                  value={sidebarSearch}
                  onChange={(e) => setSidebarSearch(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-md pl-8 pr-3 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-red-500/50"
                />
              </div>
            </div>

            {/* Scrollable annotations list */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2.5 scrollbar-thin">
              {filteredAnnotations.length === 0 ? (
                <div className="text-center text-xs text-zinc-600 py-8 italic">
                  {allAnnotations.length === 0 ? "No annotations added yet" : "No matching notes found"}
                </div>
              ) : (
                filteredAnnotations.map(ann => (
                  <div
                    key={ann.id}
                    onClick={() => {
                      if (ann.page) setCurrentPage(ann.page);
                      setSelectedId(ann.id);
                      useAnnotationStore.setState({ currentTool: 'cursor' });
                    }}
                    className={cn(
                      "group rounded-lg p-3 bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/10 transition-all cursor-pointer flex flex-col gap-2",
                      selectedId === ann.id && "bg-white/10 border-blue-500/40 ring-1 ring-blue-500/25"
                    )}
                  >
                    <div className="flex items-center justify-between text-[10px]">
                      <div className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-zinc-400">
                        <div className="h-2 w-2 rounded-full border border-white/10" style={{ backgroundColor: ann.color }} />
                        <span>{ann.type}</span>
                      </div>
                      <span className="font-mono text-zinc-500 font-semibold bg-black/40 px-1.5 py-0.5 rounded text-[9px]">
                        Page {ann.page ?? 1}
                      </span>
                    </div>

                    {ann.text && (
                      <p className="text-xs text-zinc-200 leading-relaxed font-mono px-2 py-1 bg-black/25 rounded border border-white/5 break-words">
                        {ann.text}
                      </p>
                    )}

                    <div className="flex items-center justify-between border-t border-white/5 pt-2 text-[9px] text-zinc-500 mt-1 opacity-60 group-hover:opacity-100 transition-opacity">
                      <span>{new Date(ann.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                        {ann.type === 'text' && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-5 px-1.5 text-zinc-400 hover:text-white hover:bg-white/5"
                            onClick={() => {
                              const newText = prompt("Edit text note:", ann.text);
                              if (newText !== null && newText.trim() !== "") {
                                updateAnnotation(path, { ...ann, text: newText });
                              }
                            }}
                          >
                            Edit
                          </Button>
                        )}
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-5 w-5 text-zinc-500 hover:text-red-400"
                          onClick={() => {
                            removeAnnotation(path, ann.id);
                            if (selectedId === ann.id) setSelectedId(null);
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Clear All Footer */}
            {allAnnotations.length > 0 && (
              <div className="p-3 border-t border-white/10 bg-zinc-950/20 shrink-0">
                <Button
                  size="sm"
                  variant="destructive"
                  className="w-full h-8 text-xs font-semibold"
                  onClick={() => {
                    if (confirm("Delete all annotations in this file?")) {
                      clearAnnotations(path);
                      setSelectedId(null);
                    }
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                  Clear All Annotations
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
