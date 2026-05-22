import React, { useRef, useState, useEffect, useCallback } from 'react';
import { useAnnotationStore, type Annotation } from '@/stores/annotationStore';
import { Button } from '@/components/ui/button';
import {
  ZoomIn, ZoomOut, Maximize2, Minimize2, Highlighter, Type, Square,
  Trash2, Download, MousePointer, Pen, Search, FileText, X, Layers, Save, Eraser
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { cn } from '@/lib/utils';
import { platformApi } from '@/features/platform/api';
import toast from 'react-hot-toast';

interface ImagePreviewWithAnnotationsProps {
  url: string;
  path: string;
  setLoading: (v: boolean) => void;
  onDownload: () => void;
}

export function ImagePreviewWithAnnotations({
  url, path, setLoading, onDownload,
}: ImagePreviewWithAnnotationsProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [zoom, setZoom] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);

  // Interactive state
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [activeDrawPath, setActiveDrawPath] = useState<Array<[number, number]>>([]);
  const [dragStartPos, setDragStartPos] = useState<{ x: number; y: number } | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(null);
  const [resizeHandle, setResizeHandle] = useState<string | null>(null);

  // Sidebar
  const [showSidebar, setShowSidebar] = useState(false);
  const [sidebarSearch, setSidebarSearch] = useState('');

  const { currentTool, currentColor, addAnnotation, getAnnotations, removeAnnotation, updateAnnotation, clearAnnotations } = useAnnotationStore();
  const fileAnnotations = getAnnotations(path);
  const allAnnotations = fileAnnotations?.annotations ?? [];

  useEffect(() => {
    setZoom(1);
    setIsFullscreen(false);
    setIsDrawing(false);
    setSelectedId(null);
    setImgLoaded(false);
  }, [url]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen?.();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.();
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const h = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', h);
    return () => document.removeEventListener('fullscreenchange', h);
  }, []);

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
              addAnnotation(path, 'image', ann);
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
        fileType: 'image',
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

  // Canvas coordinate helpers
  const getCanvasCoords = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height),
    };
  };

  const findAnnotationAt = (x: number, y: number): Annotation | null => {
    for (let i = allAnnotations.length - 1; i >= 0; i--) {
      const ann = allAnnotations[i];
      if (ann.type === 'draw' && ann.path) {
        for (const pt of ann.path) {
          if (Math.hypot(pt[0] * zoom - x, pt[1] * zoom - y) < 12) return ann;
        }
      } else {
        const ax = ann.x * zoom, ay = ann.y * zoom, aw = ann.width * zoom, ah = ann.height * zoom;
        if (x >= ax && x <= ax + aw && y >= ay && y <= ay + ah) return ann;
      }
    }
    return null;
  };

  const getHandleAt = (x: number, y: number, ann: Annotation): string | null => {
    const hs = 8;
    const ax = ann.x * zoom, ay = ann.y * zoom, aw = ann.width * zoom, ah = ann.height * zoom;
    const corners: Record<string, number[]> = { nw: [ax, ay], ne: [ax + aw, ay], se: [ax + aw, ay + ah], sw: [ax, ay + ah] };
    for (const [h, pos] of Object.entries(corners)) {
      if (Math.hypot(pos[0] - x, pos[1] - y) <= hs + 4) return h;
    }
    return null;
  };

  // Redraw
  const redrawAnnotations = useCallback(() => {
    if (!canvasRef.current || !imgRef.current || !imgLoaded) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;
    canvasRef.current.width = imgRef.current.naturalWidth * zoom;
    canvasRef.current.height = imgRef.current.naturalHeight * zoom;
    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);

    allAnnotations.forEach(ann => {
      const x = ann.x * zoom, y = ann.y * zoom, w = ann.width * zoom, h = ann.height * zoom;
      ctx.save();
      if (ann.type === 'highlight') { ctx.fillStyle = ann.color + '45'; ctx.fillRect(x, y, w, h); }
      else if (ann.type === 'rectangle') { ctx.strokeStyle = ann.color; ctx.lineWidth = 2.5; ctx.strokeRect(x, y, w, h); }
      else if (ann.type === 'text') {
        ctx.fillStyle = ann.color; ctx.font = 'bold 14px Inter, sans-serif';
        ctx.fillText(ann.text || '[note]', x, y - 5);
        ctx.strokeStyle = ann.color + '25'; ctx.lineWidth = 1;
        ctx.strokeRect(x, y - 18, Math.max(80, w), Math.max(22, h));
      } else if (ann.type === 'draw' && ann.path && ann.path.length > 0) {
        ctx.strokeStyle = ann.color; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.beginPath(); ctx.moveTo(ann.path[0][0] * zoom, ann.path[0][1] * zoom);
        for (let i = 1; i < ann.path.length; i++) ctx.lineTo(ann.path[i][0] * zoom, ann.path[i][1] * zoom);
        ctx.stroke();
      }
      if (selectedId === ann.id && currentTool === 'cursor') {
        ctx.strokeStyle = '#3b82f6'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 5]);
        ctx.strokeRect(x - 2, y - 2, w + 4, h + 4); ctx.setLineDash([]);
        ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#3b82f6'; ctx.lineWidth = 1.5;
        const sz = 6;
        [[x - 2, y - 2], [x + w + 2, y - 2], [x + w + 2, y + h + 2], [x - 2, y + h + 2]].forEach(([cx, cy]) => {
          ctx.fillRect(cx - sz / 2, cy - sz / 2, sz, sz); ctx.strokeRect(cx - sz / 2, cy - sz / 2, sz, sz);
        });
      }
      ctx.restore();
    });

    if (isDrawing && currentTool === 'draw' && activeDrawPath.length > 0) {
      ctx.save(); ctx.strokeStyle = currentColor; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(activeDrawPath[0][0] * zoom, activeDrawPath[0][1] * zoom);
      for (let i = 1; i < activeDrawPath.length; i++) ctx.lineTo(activeDrawPath[i][0] * zoom, activeDrawPath[i][1] * zoom);
      ctx.stroke(); ctx.restore();
    }
  }, [allAnnotations, selectedId, currentTool, zoom, isDrawing, activeDrawPath, currentColor, imgLoaded]);

  useEffect(() => { redrawAnnotations(); }, [redrawAnnotations]);

  // Mouse handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { x, y } = getCanvasCoords(e);
    if (currentTool === 'eraser') {
      setIsDrawing(true);
      const hit = findAnnotationAt(x, y);
      if (hit) removeAnnotation(path, hit.id);
      return;
    }
    if (currentTool === 'cursor') {
      if (selectedId) {
        const ann = allAnnotations.find(a => a.id === selectedId);
        if (ann) { const h = getHandleAt(x, y, ann); if (h) { setResizeHandle(h); setDragStartPos({ x, y }); return; } }
      }
      const hit = findAnnotationAt(x, y);
      if (hit) { setSelectedId(hit.id); setDragStartPos({ x, y }); setDragOffset({ x: x - hit.x * zoom, y: y - hit.y * zoom }); }
      else setSelectedId(null);
      return;
    }
    if (currentTool === 'draw') { setIsDrawing(true); setActiveDrawPath([[x / zoom, y / zoom]]); }
    else { setDragStartPos({ x, y }); setIsDrawing(true); }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current; if (!canvas) return;
    const { x, y } = getCanvasCoords(e);
    if (currentTool === 'cursor' && !dragStartPos) {
      if (selectedId) { const ann = allAnnotations.find(a => a.id === selectedId); if (ann) { const h = getHandleAt(x, y, ann); if (h) { canvas.style.cursor = (h === 'nw' || h === 'se') ? 'nwse-resize' : 'nesw-resize'; return; } } }
      canvas.style.cursor = findAnnotationAt(x, y) ? 'move' : 'default'; return;
    }
    if (currentTool === 'eraser' && isDrawing) {
      const hit = findAnnotationAt(x, y);
      if (hit) removeAnnotation(path, hit.id);
      return;
    }
    if (!dragStartPos && !isDrawing) return;
    if (resizeHandle && selectedId && dragStartPos) {
      const ann = allAnnotations.find(a => a.id === selectedId); if (!ann) return;
      const ms = 8, mx = x / zoom, my = y / zoom;
      let nx = ann.x, ny = ann.y, nw = ann.width, nh = ann.height;
      if (resizeHandle === 'se') { nw = Math.max(ms, mx - ann.x); nh = Math.max(ms, my - ann.y); }
      else if (resizeHandle === 'sw') { const r = ann.x + ann.width; nx = Math.min(r - ms, mx); nw = r - nx; nh = Math.max(ms, my - ann.y); }
      else if (resizeHandle === 'ne') { const b = ann.y + ann.height; ny = Math.min(b - ms, my); nh = b - ny; nw = Math.max(ms, mx - ann.x); }
      else if (resizeHandle === 'nw') { const r = ann.x + ann.width, b = ann.y + ann.height; nx = Math.min(r - ms, mx); nw = r - nx; ny = Math.min(b - ms, my); nh = b - ny; }
      updateAnnotation(path, { ...ann, x: nx, y: ny, width: nw, height: nh }); return;
    }
    if (dragStartPos && dragOffset && selectedId) {
      const ann = allAnnotations.find(a => a.id === selectedId); if (!ann) return;
      updateAnnotation(path, { ...ann, x: (x - dragOffset.x) / zoom, y: (y - dragOffset.y) / zoom }); return;
    }
    if (currentTool === 'draw' && isDrawing) { setActiveDrawPath(prev => [...prev, [x / zoom, y / zoom]]); }
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { x, y } = getCanvasCoords(e);
    if (currentTool === 'cursor') { setDragStartPos(null); setDragOffset(null); setResizeHandle(null); return; }
    if (currentTool === 'eraser') { setIsDrawing(false); setDragStartPos(null); return; }
    if (!isDrawing) return;
    if (currentTool === 'draw') {
      if (activeDrawPath.length > 1) {
        addAnnotation(path, 'image', {
          id: uuidv4(), type: 'draw', x: Math.min(...activeDrawPath.map(p => p[0])), y: Math.min(...activeDrawPath.map(p => p[1])),
          width: Math.max(...activeDrawPath.map(p => p[0])) - Math.min(...activeDrawPath.map(p => p[0])),
          height: Math.max(...activeDrawPath.map(p => p[1])) - Math.min(...activeDrawPath.map(p => p[1])),
          color: currentColor, path: activeDrawPath, timestamp: Date.now(),
        });
      }
      setIsDrawing(false); setActiveDrawPath([]); return;
    }
    if (dragStartPos) {
      const sx = dragStartPos.x / zoom, sy = dragStartPos.y / zoom, ex = x / zoom, ey = y / zoom;
      const w = Math.abs(ex - sx), h = Math.abs(ey - sy);
      if (w > 4 && h > 4) {
        let text: string | undefined;
        if (currentTool === 'text') { const input = prompt('Enter note text:', 'Note'); if (!input?.trim()) { setIsDrawing(false); setDragStartPos(null); return; } text = input; }
        const id = uuidv4();
        addAnnotation(path, 'image', { id, type: currentTool as any, x: Math.min(sx, ex), y: Math.min(sy, ey), width: w, height: h, color: currentColor, text, timestamp: Date.now() });
        setSelectedId(id);
      }
    }
    setIsDrawing(false); setDragStartPos(null);
  };

  const handleDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (currentTool !== 'cursor') return;
    const { x, y } = getCanvasCoords(e);
    const hit = findAnnotationAt(x, y);
    if (hit && hit.type === 'text') { const input = prompt('Edit note text:', hit.text); if (input?.trim()) updateAnnotation(path, { ...hit, text: input }); }
  };

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (selectedId && currentTool === 'cursor' && (e.key === 'Delete' || e.key === 'Backspace')) { e.preventDefault(); removeAnnotation(path, selectedId); setSelectedId(null); } };
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  }, [selectedId, currentTool, removeAnnotation, path]);

  const filteredAnnotations = allAnnotations.filter(ann => {
    if (!sidebarSearch.trim()) return true;
    const q = sidebarSearch.toLowerCase();
    return ann.type.toLowerCase().includes(q) || (ann.text && ann.text.toLowerCase().includes(q));
  });

  return (
    <div ref={containerRef} className={cn('flex h-full flex-col bg-zinc-950 text-zinc-100 font-sans select-none', isFullscreen && 'fixed inset-0 z-50')}>
      {/* Toolbar */}
      <div className="border-b border-white/10 bg-zinc-900 px-4 py-2.5 flex flex-wrap items-center justify-between gap-4 shrink-0 shadow-md">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 text-white font-extrabold text-xs h-7 w-7 flex items-center justify-center rounded shadow">IMG</div>
          <div>
            <span className="font-bold text-sm tracking-wide block">Image Annotator Studio</span>
            <span className="text-[10px] text-zinc-400 font-mono truncate block max-w-[280px]">{path.split('/').pop()}</span>
          </div>
        </div>

        {/* Tools */}
        <div className="flex items-center gap-1.5 bg-white/5 rounded-lg p-1 border border-white/10">
          <Button size="sm" variant="ghost" className={cn('h-8 px-2.5 text-zinc-400 hover:text-white hover:bg-white/10 flex items-center gap-1.5', currentTool === 'cursor' && 'bg-blue-600/90 text-white hover:bg-blue-600')} onClick={() => useAnnotationStore.setState({ currentTool: 'cursor' })} title="Select">
            <MousePointer className="h-4 w-4" /><span className="text-xs font-semibold">Select</span>
          </Button>
          <div className="w-px h-5 bg-white/10 mx-1" />
          <Button
            size="sm"
            variant="ghost"
            className={cn('h-8 w-8 p-0 transition-all', currentTool === 'draw' ? 'text-white' : 'text-zinc-400 hover:text-white hover:bg-white/10')}
            style={currentTool === 'draw' ? { backgroundColor: currentColor } : {}}
            onClick={() => useAnnotationStore.setState({ currentTool: 'draw' })}
            title="Pen"
          >
            <Pen className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className={cn('h-8 w-8 p-0 transition-all', currentTool === 'highlight' ? 'text-white' : 'text-zinc-400 hover:text-white hover:bg-white/10')}
            style={currentTool === 'highlight' ? { backgroundColor: currentColor + '40', color: currentColor, border: `1px solid ${currentColor}` } : {}}
            onClick={() => useAnnotationStore.setState({ currentTool: 'highlight' })}
            title="Highlighter"
          >
            <Highlighter className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className={cn('h-8 w-8 p-0 transition-all', currentTool === 'text' ? 'text-white' : 'text-zinc-400 hover:text-white hover:bg-white/10')}
            style={currentTool === 'text' ? { backgroundColor: currentColor } : {}}
            onClick={() => useAnnotationStore.setState({ currentTool: 'text' })}
            title="Text"
          >
            <Type className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className={cn('h-8 w-8 p-0 transition-all', currentTool === 'rectangle' ? 'text-white' : 'text-zinc-400 hover:text-white hover:bg-white/10')}
            style={currentTool === 'rectangle' ? { backgroundColor: currentColor + '20', color: currentColor, border: `1px solid ${currentColor}` } : {}}
            onClick={() => useAnnotationStore.setState({ currentTool: 'rectangle' })}
            title="Rectangle"
          >
            <Square className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className={cn('h-8 w-8 p-0 transition-all', currentTool === 'eraser' ? 'bg-red-600 text-white' : 'text-zinc-400 hover:text-white hover:bg-white/10')}
            onClick={() => useAnnotationStore.setState({ currentTool: 'eraser' })}
            title="Eraser"
          >
            <Eraser className="h-4 w-4" />
          </Button>
        </div>

        {/* Color */}
        <div className="flex items-center gap-2 bg-white/5 rounded-lg px-3 py-1 border border-white/10">
          <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Color</label>
          <input type="color" value={currentColor} onChange={(e) => useAnnotationStore.setState({ currentColor: e.target.value })} className="h-7 w-8 cursor-pointer rounded border border-white/10 bg-transparent" />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-white/5 rounded-lg p-1 border border-white/10 text-xs">
            <Button size="icon" variant="ghost" className="h-7 w-7 text-zinc-400 hover:text-white hover:bg-white/10" onClick={() => setZoom(Math.max(0.25, zoom - 0.25))}><ZoomOut className="h-3.5 w-3.5" /></Button>
            <span className="min-w-10 text-center font-mono font-bold text-zinc-300">{Math.round(zoom * 100)}%</span>
            <Button size="icon" variant="ghost" className="h-7 w-7 text-zinc-400 hover:text-white hover:bg-white/10" onClick={() => setZoom(Math.min(4, zoom + 0.25))}><ZoomIn className="h-3.5 w-3.5" /></Button>
          </div>
          <Button size="icon" variant="ghost" className="h-8 w-8 text-zinc-400 hover:text-white hover:bg-white/10" onClick={onDownload} title="Download"><Download className="h-4 w-4" /></Button>
          <Button size="icon" variant="ghost" className="h-8 w-8 text-zinc-400 hover:text-white hover:bg-white/10" onClick={handleSaveAnnotations} title="Export annotations" disabled={allAnnotations.length === 0}><Save className="h-4 w-4" /></Button>
          <Button size="icon" variant="ghost" className="h-8 w-8 text-zinc-400 hover:text-white hover:bg-white/10" onClick={toggleFullscreen} title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}>{isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}</Button>
          <Button size="icon" variant="ghost" className={cn('h-8 w-8 text-zinc-400 hover:text-white hover:bg-white/10', showSidebar && 'bg-white/10 text-white')} onClick={() => setShowSidebar(!showSidebar)} title="Annotations panel"><Layers className="h-4 w-4" /></Button>
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        <div className="flex-1 overflow-auto bg-zinc-900/50 p-6 flex justify-center items-start min-w-0 scrollbar-thin">
          <div className="relative shadow-2xl rounded-lg border border-white/5 bg-white select-none inline-block">
            <img ref={imgRef} src={url} alt="Preview" className="block" style={{ width: imgRef.current ? imgRef.current.naturalWidth * zoom : 'auto', imageRendering: zoom > 1 ? 'pixelated' : 'auto' }}
              onLoad={() => { setImgLoaded(true); setLoading(false); redrawAnnotations(); }}
              onError={() => setLoading(false)} />
            <canvas ref={canvasRef} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onDoubleClick={handleDoubleClick}
              className="absolute inset-0 z-10 block" style={{ width: '100%', height: '100%' }} />
          </div>
        </div>

        {/* Sidebar */}
        {showSidebar && (
          <div className="w-72 border-l border-white/10 bg-zinc-900/90 backdrop-blur-md flex flex-col shrink-0 min-h-0 select-none">
            <div className="p-4 border-b border-white/10 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2"><FileText className="h-4 w-4 text-blue-500" /><span className="font-bold text-xs uppercase tracking-wider text-zinc-300">Annotations ({allAnnotations.length})</span></div>
              <Button size="icon" variant="ghost" className="h-6 w-6 text-zinc-500 hover:text-white" onClick={() => setShowSidebar(false)}><X className="h-3.5 w-3.5" /></Button>
            </div>
            <div className="p-3 border-b border-white/5 shrink-0">
              <div className="relative"><Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-zinc-500" />
                <input type="text" placeholder="Search notes..." value={sidebarSearch} onChange={(e) => setSidebarSearch(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-md pl-8 pr-3 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-blue-500/50" />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2.5 scrollbar-thin">
              {filteredAnnotations.length === 0 ? (
                <div className="text-center text-xs text-zinc-600 py-8 italic">{allAnnotations.length === 0 ? 'No annotations yet' : 'No matches'}</div>
              ) : filteredAnnotations.map(ann => (
                <div key={ann.id} onClick={() => { setSelectedId(ann.id); useAnnotationStore.setState({ currentTool: 'cursor' }); }}
                  className={cn('group rounded-lg p-3 bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/10 transition-all cursor-pointer flex flex-col gap-2', selectedId === ann.id && 'bg-white/10 border-blue-500/40 ring-1 ring-blue-500/25')}>
                  <div className="flex items-center justify-between text-[10px]">
                    <div className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-zinc-400"><div className="h-2 w-2 rounded-full border border-white/10" style={{ backgroundColor: ann.color }} /><span>{ann.type}</span></div>
                  </div>
                  {ann.text && <p className="text-xs text-zinc-200 leading-relaxed font-mono px-2 py-1 bg-black/25 rounded border border-white/5 break-words">{ann.text}</p>}
                  <div className="flex items-center justify-between border-t border-white/5 pt-2 text-[9px] text-zinc-500 mt-1 opacity-60 group-hover:opacity-100 transition-opacity">
                    <span>{new Date(ann.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                      {ann.type === 'text' && <Button size="sm" variant="ghost" className="h-5 px-1.5 text-zinc-400 hover:text-white hover:bg-white/5" onClick={() => { const t = prompt('Edit:', ann.text); if (t?.trim()) updateAnnotation(path, { ...ann, text: t }); }}>Edit</Button>}
                      <Button size="icon" variant="ghost" className="h-5 w-5 text-zinc-500 hover:text-red-400" onClick={() => { removeAnnotation(path, ann.id); if (selectedId === ann.id) setSelectedId(null); }}><Trash2 className="h-3 w-3" /></Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {allAnnotations.length > 0 && (
              <div className="p-3 border-t border-white/10 bg-zinc-950/20 shrink-0">
                <Button size="sm" variant="destructive" className="w-full h-8 text-xs font-semibold" onClick={() => { if (confirm('Delete all annotations?')) { clearAnnotations(path); setSelectedId(null); } }}><Trash2 className="h-3.5 w-3.5 mr-1.5" />Clear All</Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
