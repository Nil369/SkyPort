import React, { useRef, useState, useEffect } from 'react';
import {
  loadPresentation,
  renderSlideToElement,
  type LoadedPresentation,
} from 'pptx-viewer';
import PptxGenJS from 'pptxgenjs';
import { Button } from '@/components/ui/button';
import {
  ChevronLeft, ChevronRight, Download, Save, Plus, Trash2,
  Maximize2, Minimize2, Type, Image, Play,
  Layers, ArrowUp, ArrowDown, Copy, Clipboard, X,
  ZoomIn, ZoomOut, Check, RefreshCw
} from 'lucide-react';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';
import { platformApi } from '@/features/platform/api';

interface PptxPreviewAndEditorProps {
  url: string;
  path: string;
  onDownload: () => void;
  setLoading: (v: boolean) => void;
  setError: (v: string | null) => void;
}

interface SlideElement {
  id: string;
  type: 'text' | 'shape' | 'image' | 'line';
  shapeType?: 'rect' | 'circle' | 'triangle' | 'star' | 'arrow' | 'cloud';
  x: number; // percentage of slide width (0-100)
  y: number; // percentage of slide height (0-100)
  w: number; // percentage width
  h: number; // percentage height
  text?: string;
  color?: string;
  fontSize?: number;
  bgColor?: string;
  strokeColor?: string;
  strokeWidth?: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  align?: 'left' | 'center' | 'right';
  imgUrl?: string;
  borderRadius?: number;
  rotate?: number;
  fontFamily?: string;
}

interface SlideData {
  id: string;
  elements: SlideElement[];
  bgColor: string;
  bgGradient?: string;
}

const SHAPES = [
  { type: 'rect', label: 'Rectangle' },
  { type: 'circle', label: 'Circle' },
  { type: 'triangle', label: 'Triangle' },
  { type: 'star', label: '5-Point Star' },
  { type: 'arrow', label: 'Right Arrow' },
  { type: 'cloud', label: 'Cloud' }
];

const FONTS = [
  { name: 'Segoe UI', css: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif" },
  { name: 'Inter', css: "'Inter', sans-serif" },
  { name: 'Georgia', css: "Georgia, serif" },
  { name: 'Impact', css: "Impact, Charcoal, sans-serif" },
  { name: 'Courier New', css: "'Courier New', Courier, monospace" },
  { name: 'Times New Roman', css: "'Times New Roman', Times, serif" },
  { name: 'Comic Sans MS', css: "'Comic Sans MS', cursive" }
];

const FONT_MAP: Record<string, string> = {
  'calibri': 'Segoe UI',
  'arial': 'Arial',
  'times new roman': 'Times New Roman',
  'cambria': 'Georgia',
  'verdana': 'Verdana',
  'tahoma': 'Segoe UI',
};

function normalizeParagraphRunsSpacing(paragraphs: any[] | undefined) {
  if (!Array.isArray(paragraphs)) return;
  for (const p of paragraphs) {
    const runs = Array.isArray(p?.runs) ? p.runs : [];
    for (let i = 0; i < runs.length - 1; i++) {
      const cur = runs[i];
      const next = runs[i + 1];
      if (!cur || !next) continue;
      const a = typeof cur.text === 'string' ? cur.text : '';
      const b = typeof next.text === 'string' ? next.text : '';
      if (!a || !b) continue;

      const aLast = a[a.length - 1];
      const bFirst = b[0];
      const aEndsSpace = /\s$/.test(a);
      const bStartsSpace = /^\s/.test(b);
      const aWord = /[A-Za-z0-9)]/.test(aLast);
      const bWord = /[A-Za-z0-9(]/.test(bFirst);
      const bPunctuation = /^[,.;:!?)]/.test(b);

      if (!aEndsSpace && !bStartsSpace && aWord && bWord && !bPunctuation) {
        cur.text = `${a} `;
      }
    }
  }
}

function normalizePptxTextSpacing(pres: any) {
  const normalizeElements = (elements: any[] | undefined) => {
    if (!Array.isArray(elements)) return;
    for (const el of elements) {
      if (el?.type === 'text' && el?.text?.paragraphs) {
        normalizeParagraphRunsSpacing(el.text.paragraphs);
      }
      if (el?.type === 'table' && Array.isArray(el?.rows)) {
        for (const row of el.rows) {
          for (const cell of row?.cells || []) {
            if (cell?.text?.paragraphs) {
              normalizeParagraphRunsSpacing(cell.text.paragraphs);
            }
          }
        }
      }
      if (Array.isArray(el?.children)) {
        normalizeElements(el.children);
      }
    }
  };

  for (const slide of pres?.slides || []) normalizeElements(slide?.elements);
  if (pres?.slideLayouts?.values) {
    for (const layout of pres.slideLayouts.values()) normalizeElements(layout?.elements);
  }
  if (pres?.slideMasters?.values) {
    for (const master of pres.slideMasters.values()) normalizeElements(master?.elements);
  }
}

export function PptxPreviewAndEditor({ url, path, onDownload, setLoading, setError }: PptxPreviewAndEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const slideHostRef = useRef<HTMLDivElement>(null);
  const slideshowHostRef = useRef<HTMLDivElement>(null);
  const presentationRef = useRef<LoadedPresentation | null>(null);
  const sourcePptxBufferRef = useRef<ArrayBuffer | null>(null);
  const sourceBlobUrlRef = useRef<string | null>(null);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [slideIndex, setSlideIndex] = useState(0);
  const [viewMode, setViewMode] = useState<'view' | 'edit'>('view'); // 'view' = high-fidelity pptx-viewer; 'edit' = canvas editor
  const [showSaveAsModal, setShowSaveAsModal] = useState(false);
  const [saveAsPath, setSaveAsPath] = useState('');
  const [reloadTrigger, setReloadTrigger] = useState(0);
  const [isDirty, setIsDirty] = useState(false);
  const [savePending, setSavePending] = useState(false);
  const [slideAspectRatio, setSlideAspectRatio] = useState(16 / 9);
  const [isParsing, setIsParsing] = useState(false);
  const [parseMessage, setParseMessage] = useState('Parsing presentation...');

  // Editor states
  const [slides, setSlides] = useState<SlideData[]>([
    { id: 'slide-0', bgColor: '#ffffff', elements: [
      { id: 'title-1', type: 'text', x: 10, y: 15, w: 80, h: 15, text: 'Welcome to PowerPoint Studio', color: '#1a1a1a', fontSize: 36, bold: true, align: 'center' },
      { id: 'subtitle-1', type: 'text', x: 15, y: 35, w: 70, h: 10, text: 'The most stunning slide creation tool on the web', color: '#666666', fontSize: 18, align: 'center' }
    ]}
  ]);
  const [selectedElement, setSelectedElement] = useState<string | null>(null);
  const [editingText, setEditingText] = useState<string | null>(null);
  const [copiedElement, setCopiedElement] = useState<SlideElement | null>(null);
  const [zoom, setZoom] = useState(100);
  const [viewRenderWidth, setViewRenderWidth] = useState(1100);

  // Dragging and Resizing State
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState<string | null>(null); // 'nw', 'ne', 'se', 'sw'
  const [dragStartRect, setDragStartRect] = useState({ x: 0, y: 0, w: 0, h: 0 });
  const [dragStartMouse, setDragStartMouse] = useState({ x: 0, y: 0 });

  // Slideshow presentation state
  const [inSlideshow, setInSlideshow] = useState(false);
  const [slideshowIndex, setSlideshowIndex] = useState(0);
  const [laserPointer, setLaserPointer] = useState<{ x: number; y: number } | null>(null);

  const arrayBufferToBase64 = (ab: ArrayBuffer) => {
    const bytes = new Uint8Array(ab);
    const chunkSize = 0x8000;
    const chunks: string[] = [];
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize);
      chunks.push(String.fromCharCode(...chunk));
    }
    return btoa(chunks.join(''));
  };

  const createPptxDocument = () => {
    const pptx = new PptxGenJS();
    const safeRatio = Number.isFinite(slideAspectRatio) && slideAspectRatio > 0 ? slideAspectRatio : 16 / 9;
    const layoutName = 'SKYPORT_LAYOUT';
    const widthInch = 10;
    const heightInch = Math.max(4, Math.min(9, widthInch / safeRatio));
    pptx.defineLayout({ name: layoutName, width: widthInch, height: heightInch });
    pptx.layout = layoutName as any;
    return pptx;
  };

  // Load presentation for preview if it exists
  useEffect(() => {
    let cancelled = false;
    presentationRef.current?.cleanup();
    presentationRef.current = null;
    if (sourceBlobUrlRef.current) {
      URL.revokeObjectURL(sourceBlobUrlRef.current);
      sourceBlobUrlRef.current = null;
    }

    (async () => {
      if (!url) return;
      try {
        setLoading(true);
        setIsParsing(true);
        setParseMessage('Downloading PPTX...');

        const fetchUrl = url + (url.includes('?') ? '&' : '?') + 'cb=' + Date.now() + '_' + reloadTrigger;
        const fileRes = await fetch(fetchUrl);
        if (!fileRes.ok) {
          throw new Error(`Failed to fetch presentation: ${fileRes.statusText}`);
        }
        setParseMessage('Reading presentation package...');
        const sourceBuffer = await fileRes.arrayBuffer();
        sourcePptxBufferRef.current = sourceBuffer.slice(0);
        const blobUrl = URL.createObjectURL(
          new Blob([sourceBuffer], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' })
        );
        sourceBlobUrlRef.current = blobUrl;

        setParseMessage('Rendering slide layout...');
        const pres = await loadPresentation(blobUrl);
        if (cancelled) { pres.cleanup(); return; }
        if (!pres.slides?.length) { setLoading(false); pres.cleanup(); return; }

        normalizePptxTextSpacing(pres as any);
        presentationRef.current = pres;
        if (pres.slideSize?.width && pres.slideSize?.height) {
          setSlideAspectRatio(pres.slideSize.width / pres.slideSize.height);
        } else {
          setSlideAspectRatio(16 / 9);
        }

        // Convert parsed presentation elements to editable slides!
        const parsedSlides: SlideData[] = pres.slides.map((slide, idx) => {
          const els: SlideElement[] = [];
          slide.elements.forEach((el: any, eIdx: number) => {
            const boundW = pres.slideSize?.width || 960;
            const boundH = pres.slideSize?.height || 540;
            const xPercent = (el.bounds.x / boundW) * 100;
            const yPercent = (el.bounds.y / boundH) * 100;
            const wPercent = (el.bounds.width / boundW) * 100;
            const hPercent = (el.bounds.height / boundH) * 100;

            if (el.type === 'text') {
              const textVal = el.text?.paragraphs?.map((p: any) => (p.runs || []).map((r: any) => (r.text || '').trim()).filter(Boolean).join(' ')).join('\n') || 'Text';
              // Extract styling from first run if available
              const firstRun = el.text?.paragraphs?.[0]?.runs?.[0];
              const textColor = firstRun?.color?.hex ? `#${firstRun.color.hex}` : '#333333';
              const textBold = firstRun?.bold || false;
              const textItalic = firstRun?.italic || false;
              // Normalize fontSize: pptx-viewer may return half-points or centipoints
              let rawSize = firstRun?.fontSize || 18;
              if (rawSize > 200) rawSize = Math.round(rawSize / 100); // centipoints → points
              else if (rawSize > 72) rawSize = Math.round(rawSize / 2); // half-points → points
              const textSize = Math.max(8, Math.min(72, rawSize));
              // Map font family to available web-safe fonts
              let fontName = (firstRun?.font || firstRun?.fontFamily || '') as string;
              if (fontName) {
                const key = fontName.toLowerCase();
                fontName = FONT_MAP[key] || fontName;
              } else fontName = 'Segoe UI';

              els.push({
                id: `el-${idx}-${eIdx}`,
                type: 'text',
                x: Math.max(0, Math.min(100, xPercent)),
                y: Math.max(0, Math.min(100, yPercent)),
                w: Math.max(5, Math.min(100, wPercent)),
                h: Math.max(5, Math.min(100, hPercent)),
                text: textVal,
                color: textColor,
                fontSize: textSize,
                bold: textBold,
                italic: textItalic,
                fontFamily: fontName
              });
            } else if (el.type === 'shape') {
              els.push({
                id: `el-${idx}-${eIdx}`,
                type: 'shape',
                shapeType: el.shapeType === 'ellipse' ? 'circle' : 'rect',
                x: Math.max(0, Math.min(100, xPercent)),
                y: Math.max(0, Math.min(100, yPercent)),
                w: Math.max(5, Math.min(100, wPercent)),
                h: Math.max(5, Math.min(100, hPercent)),
                bgColor: el.fill?.color?.hex || '#3b82f6',
                strokeColor: el.stroke?.color?.hex || '#1d4ed8',
                strokeWidth: el.stroke?.width || 1
              });
            } else if (el.type === 'image') {
              els.push({
                id: `el-${idx}-${eIdx}`,
                type: 'image',
                x: Math.max(0, Math.min(100, xPercent)),
                y: Math.max(0, Math.min(100, yPercent)),
                w: Math.max(5, Math.min(100, wPercent)),
                h: Math.max(5, Math.min(100, hPercent)),
                imgUrl: el.src || ''
              });
            }
          });

          // Extract background color from parsed slide data
          const slideBg = (slide as any).background?.color?.hex
            ? `#${(slide as any).background.color.hex}`
            : '#ffffff';

          return {
            id: `slide-${idx}`,
            bgColor: slideBg,
            elements: els
          };
        });

        if (parsedSlides.length > 0) {
          setSlides(parsedSlides);
          setSlideIndex(0);
        }
        setLoading(false);
        setIsParsing(false);
      } catch (e: any) {
        console.error("Mammoth or pptx-viewer load error: ", e);
        setError(e?.message || "Could not load PowerPoint presentation.");
        setLoading(false);
        setIsParsing(false);
      }
    })();

    return () => {
      cancelled = true;
      presentationRef.current?.cleanup();
      presentationRef.current = null;
      if (sourceBlobUrlRef.current) {
        URL.revokeObjectURL(sourceBlobUrlRef.current);
        sourceBlobUrlRef.current = null;
      }
    };
  }, [url, reloadTrigger]);

  // Render slide in view mode using pptx-viewer's high-fidelity renderer
  useEffect(() => {
    if (viewMode !== 'view') return;
    const host = slideHostRef.current;
    const pres = presentationRef.current;
    if (!pres || !host) return;
    host.innerHTML = '';
    try {
      // ensure viewer uses our preferred web fonts for better layout fidelity
      host.style.fontFamily = 'Segoe UI, Arial, sans-serif';
      renderSlideToElement(pres, slideIndex, host, { width: viewRenderWidth });
    } catch (e) { console.error('renderSlideToElement error:', e); }
  }, [slideIndex, viewMode, viewRenderWidth]);


  // Slideshow should also use high-fidelity renderer.
  useEffect(() => {
    if (!inSlideshow) return;
    const host = slideshowHostRef.current;
    const pres = presentationRef.current;
    if (!host || !pres) return;

    const render = () => {
      host.innerHTML = '';
      const viewportW = Math.floor(window.innerWidth * 0.9);
      const viewportH = Math.floor(window.innerHeight * 0.84);
      const targetW = Math.max(720, Math.min(viewportW, Math.floor(viewportH * slideAspectRatio)));
      try {
        host.style.fontFamily = 'Segoe UI, Arial, sans-serif';
        renderSlideToElement(pres, slideshowIndex, host, { width: targetW });
      } catch (e) {
        console.error('slideshow renderSlideToElement error:', e);
      }
    };

    render();
    window.addEventListener('resize', render);
    return () => window.removeEventListener('resize', render);
  }, [inSlideshow, slideshowIndex, slideAspectRatio]);

  // Keep view renderer responsive to container changes.
  useEffect(() => {
    if (viewMode !== 'view') return;
    const host = slideHostRef.current;
    if (!host || typeof ResizeObserver === 'undefined') return;

    const update = () => {
      const parent = host.parentElement;
      const nextWidth = Math.max(560, Math.min(1600, Math.floor((parent?.clientWidth || 1100) - 32)));
      setViewRenderWidth(nextWidth);
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(host);
    if (host.parentElement) ro.observe(host.parentElement);
    return () => ro.disconnect();
  }, [viewMode]);

  // Slideshow keyboard controls
  useEffect(() => {
    if (!inSlideshow) return;
    const handleKeys = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'Enter') {
        setSlideshowIndex(prev => Math.min(slides.length - 1, prev + 1));
      } else if (e.key === 'ArrowLeft' || e.key === 'Backspace') {
        setSlideshowIndex(prev => Math.max(0, prev - 1));
      } else if (e.key === 'Escape') {
        setInSlideshow(false);
      }
    };
    window.addEventListener('keydown', handleKeys);
    return () => window.removeEventListener('keydown', handleKeys);
  }, [inSlideshow, slides.length]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) { containerRef.current?.requestFullscreen?.(); setIsFullscreen(true); }
    else { document.exitFullscreen?.(); setIsFullscreen(false); }
  };

  useEffect(() => {
    const h = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', h);
    return () => document.removeEventListener('fullscreenchange', h);
  }, []);

  const uid = () => Math.random().toString(36).substring(2, 9);

  // Element actions
  const addTextElement = () => {
    const updated = [...slides];
    updated[slideIndex].elements.push({
      id: uid(), type: 'text', x: 25, y: 40, w: 50, h: 12,
      text: 'Double-click to edit text block', color: '#1a1a1a', fontSize: 20, align: 'center', bold: false
    });
    setSlides(updated);
    setIsDirty(true);
    toast.success('Added text block');
  };

  const addShapeElement = (shapeType: 'rect' | 'circle' | 'triangle' | 'star' | 'arrow' | 'cloud') => {
    const updated = [...slides];
    updated[slideIndex].elements.push({
      id: uid(), type: 'shape', shapeType, x: 35, y: 30, w: 30, h: 30,
      bgColor: '#3b82f6', strokeColor: '#1d4ed8', strokeWidth: 2, borderRadius: shapeType === 'rect' ? 8 : 0
    });
    setSlides(updated);
    setIsDirty(true);
    toast.success(`Added ${shapeType}`);
  };

  const addImageElement = () => {
    const urlInput = prompt('Enter Image URL:', 'https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=600');
    if (!urlInput) return;
    const updated = [...slides];
    updated[slideIndex].elements.push({
      id: uid(), type: 'image', x: 30, y: 25, w: 40, h: 50, imgUrl: urlInput
    });
    setSlides(updated);
    setIsDirty(true);
    toast.success('Added image');
  };

  const copyElement = (el: SlideElement) => {
    setCopiedElement(el);
    toast.success('Copied element');
  };

  const pasteElement = () => {
    if (!copiedElement) return;
    const updated = [...slides];
    updated[slideIndex].elements.push({
      ...copiedElement,
      id: uid(),
      x: Math.min(90, copiedElement.x + 4),
      y: Math.min(90, copiedElement.y + 4)
    });
    setSlides(updated);
    setIsDirty(true);
    toast.success('Pasted element');
  };

  const deleteElement = (elId: string) => {
    const updated = [...slides];
    updated[slideIndex].elements = updated[slideIndex].elements.filter(e => e.id !== elId);
    setSlides(updated);
    setSelectedElement(null);
    setIsDirty(true);
  };

  const updateElement = (elId: string, updates: Partial<SlideElement>) => {
    const updated = [...slides];
    updated[slideIndex].elements = updated[slideIndex].elements.map(e => e.id === elId ? { ...e, ...updates } : e);
    setSlides(updated);
    setIsDirty(true);
  };

  // Reorder elements layers
  const moveElementLayer = (elId: string, direction: 'front' | 'back' | 'forward' | 'backward') => {
    const slide = slides[slideIndex];
    const els = [...slide.elements];
    const idx = els.findIndex(e => e.id === elId);
    if (idx === -1) return;

    if (direction === 'front') {
      const [item] = els.splice(idx, 1);
      els.push(item);
    } else if (direction === 'back') {
      const [item] = els.splice(idx, 1);
      els.unshift(item);
    } else if (direction === 'forward' && idx < els.length - 1) {
      const [item] = els.splice(idx, 1);
      els.splice(idx + 1, 0, item);
    } else if (direction === 'backward' && idx > 0) {
      const [item] = els.splice(idx, 1);
      els.splice(idx - 1, 0, item);
    }

    const updated = [...slides];
    updated[slideIndex].elements = els;
    setSlides(updated);
    setIsDirty(true);
    toast.success('Layer updated');
  };

  // Slide actions
  const addNewSlide = () => {
    setSlides(prev => [...prev, { id: `slide-${uid()}`, elements: [], bgColor: '#ffffff' }]);
    setSlideIndex(slides.length);
    setIsDirty(true);
    toast.success('Added slide');
  };

  const duplicateSlide = () => {
    const current = slides[slideIndex];
    const duplicated: SlideData = {
      id: `slide-${uid()}`,
      bgColor: current.bgColor,
      bgGradient: current.bgGradient,
      elements: current.elements.map(el => ({ ...el, id: uid() }))
    };
    const updated = [...slides];
    updated.splice(slideIndex + 1, 0, duplicated);
    setSlides(updated);
    setSlideIndex(slideIndex + 1);
    setIsDirty(true);
    toast.success('Duplicated slide');
  };

  const deleteCurrentSlide = () => {
    if (slides.length <= 1) { toast.error('Cannot delete the only slide'); return; }
    if (!confirm('Delete this slide?')) return;
    const updated = slides.filter((_, i) => i !== slideIndex);
    setSlides(updated);
    setSlideIndex(Math.min(slideIndex, updated.length - 1));
    setIsDirty(true);
    toast.success('Slide deleted');
  };

  const applyTemplate = (templateType: 'title' | 'content' | 'split' | 'blank') => {
    const updated = [...slides];
    const current = updated[slideIndex];
    
    if (templateType === 'title') {
      current.elements = [
        { id: uid(), type: 'text', x: 10, y: 25, w: 80, h: 20, text: 'Presentation Title', color: '#1a1a1a', fontSize: 44, bold: true, align: 'center', fontFamily: 'Segoe UI' },
        { id: uid(), type: 'text', x: 15, y: 50, w: 70, h: 10, text: 'Subtitle or presenter name goes here', color: '#555555', fontSize: 20, align: 'center', fontFamily: 'Segoe UI' }
      ];
    } else if (templateType === 'content') {
      current.elements = [
        { id: uid(), type: 'text', x: 8, y: 8, w: 84, h: 12, text: 'Slide Title', color: '#1a1a1a', fontSize: 32, bold: true, align: 'left', fontFamily: 'Segoe UI' },
        { id: uid(), type: 'text', x: 8, y: 24, w: 84, h: 68, text: '• Enter your first bullet point here\n• Enter another key observation\n• Support your claims with concise arguments\n• Summarize conclusions clearly', color: '#333333', fontSize: 18, align: 'left', fontFamily: 'Segoe UI' }
      ];
    } else if (templateType === 'split') {
      current.elements = [
        { id: uid(), type: 'text', x: 8, y: 8, w: 84, h: 12, text: 'Split Comparison', color: '#1a1a1a', fontSize: 32, bold: true, align: 'left', fontFamily: 'Segoe UI' },
        { id: uid(), type: 'text', x: 8, y: 24, w: 40, h: 68, text: 'Left Column Content:\n- Pros and opportunities\n- Details of strategy A\n- Core metrics and values', color: '#333333', fontSize: 16, align: 'left', fontFamily: 'Segoe UI' },
        { id: uid(), type: 'text', x: 52, y: 24, w: 40, h: 68, text: 'Right Column Content:\n- Cons and challenges\n- Details of strategy B\n- Risk mitigations', color: '#333333', fontSize: 16, align: 'left', fontFamily: 'Segoe UI' }
      ];
    } else if (templateType === 'blank') {
      current.elements = [];
    }
    
    setSlides(updated);
    setIsDirty(true);
    toast.success(`Applied layout template: ${templateType}`);
  };

  const moveSlideOrder = (direction: 'up' | 'down') => {
    if (direction === 'up' && slideIndex === 0) return;
    if (direction === 'down' && slideIndex === slides.length - 1) return;

    const nextIndex = direction === 'up' ? slideIndex - 1 : slideIndex + 1;
    const updated = [...slides];
    const temp = updated[slideIndex];
    updated[slideIndex] = updated[nextIndex];
    updated[nextIndex] = temp;

    setSlides(updated);
    setSlideIndex(nextIndex);
    setIsDirty(true);
  };

  // Save base64 Presentation file
  const handleSave = async () => {
    setSavePending(true);
    try {
      if (!isDirty && sourcePptxBufferRef.current) {
        const originalBase64 = arrayBufferToBase64(sourcePptxBufferRef.current);
        await platformApi.writeFile(path, originalBase64, 'base64');
        toast.success(`Saved successfully to ${path.split('/').pop()}`);
        return;
      }

      const pptx = createPptxDocument();

      slides.forEach(slide => {
        const s = pptx.addSlide();
        if (slide.bgColor !== '#ffffff') s.background = { color: slide.bgColor.replace('#', '') };

        slide.elements.forEach(el => {
          const xVal = `${el.x}%`;
          const yVal = `${el.y}%`;
          const wVal = `${el.w}%`;
          const hVal = `${el.h}%`;

          if (el.type === 'text') {
            const textOptions: any = {
              x: xVal as any,
              y: yVal as any,
              w: wVal as any,
              h: hVal as any,
              color: (el.color || '#333333').replace('#', ''),
              fontSize: el.fontSize || 18,
              bold: el.bold || false,
              italic: el.italic || false,
              underline: el.underline ? { style: 'sng' } : undefined,
              align: el.align || 'left',
              valign: 'middle',
              rotate: el.rotate || 0,
              fontFace: el.fontFamily || 'Segoe UI',
            };
            if (el.bgColor) textOptions.fill = { color: (el.bgColor || '#ffffff').replace('#', '') };
            s.addText(el.text || '', textOptions);
          } else if (el.type === 'shape') {
            let shapeName = pptx.ShapeType.rect;
            if (el.shapeType === 'circle') shapeName = pptx.ShapeType.ellipse;
            else if (el.shapeType === 'triangle') shapeName = pptx.ShapeType.triangle;
            else if (el.shapeType === 'star') shapeName = pptx.ShapeType.star5;
            else if (el.shapeType === 'arrow') shapeName = pptx.ShapeType.rightArrow;
            else if (el.shapeType === 'cloud') shapeName = pptx.ShapeType.cloud;

            s.addShape(shapeName, {
              x: xVal as any, y: yVal as any, w: wVal as any, h: hVal as any,
              fill: { color: (el.bgColor || '#3b82f6').replace('#', '') },
              line: { color: (el.strokeColor || '#1d4ed8').replace('#', ''), width: el.strokeWidth || 1 },
              rotate: el.rotate || 0,
            });
          } else if (el.type === 'image' && el.imgUrl) {
            s.addImage({
              path: el.imgUrl,
              x: xVal as any, y: yVal as any, w: wVal as any, h: hVal as any,
              rotate: el.rotate || 0,
            });
          }
        });
      });

      const data = await pptx.write({ outputType: 'base64' }) as string;
      const savePath = path;
      await platformApi.writeFile(savePath, data, 'base64');
      setIsDirty(false);
      toast.success(`Saved successfully to ${savePath.split('/').pop()}`);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.response?.data?.error?.message ?? 'Failed to save presentation');
    } finally {
      setSavePending(false);
    }
  };

  /** Save to any server path */
  const saveToPath = async (targetPath: string): Promise<void> => {
    if (!isDirty && sourcePptxBufferRef.current) {
      const originalBase64 = arrayBufferToBase64(sourcePptxBufferRef.current);
      await platformApi.writeFile(targetPath, originalBase64, 'base64');
      return;
    }

    const pptx = createPptxDocument();
    slides.forEach(slide => {
      const s = pptx.addSlide();
      if (slide.bgColor !== '#ffffff') s.background = { color: slide.bgColor.replace('#', '') };
      slide.elements.forEach(el => {
        const x = `${el.x}%` as any, y = `${el.y}%` as any, w = `${el.w}%` as any, h = `${el.h}%` as any;
        if (el.type === 'text') {
          const textOpts: any = { x, y, w, h, color: (el.color||'#333333').replace('#',''), fontSize: el.fontSize||18, bold: el.bold||false, italic: el.italic||false, underline: el.underline?{style:'sng'}:undefined, align: el.align||'left', valign:'middle', rotate:el.rotate||0, fontFace:el.fontFamily||'Segoe UI' };
          if (el.bgColor) textOpts.fill = { color: (el.bgColor||'#ffffff').replace('#','') };
          s.addText(el.text || '', textOpts);
        } else if (el.type === 'shape') {
          let sn = pptx.ShapeType.rect;
          if (el.shapeType==='circle') sn=pptx.ShapeType.ellipse;
          else if (el.shapeType==='triangle') sn=pptx.ShapeType.triangle;
          else if (el.shapeType==='star') sn=pptx.ShapeType.star5;
          else if (el.shapeType==='arrow') sn=pptx.ShapeType.rightArrow;
          else if (el.shapeType==='cloud') sn=pptx.ShapeType.cloud;
          s.addShape(sn, { x, y, w, h, fill:{color:(el.bgColor||'#3b82f6').replace('#','')}, line:{color:(el.strokeColor||'#1d4ed8').replace('#',''),width:el.strokeWidth||1}, rotate:el.rotate||0 });
        } else if (el.type==='image' && el.imgUrl) {
          s.addImage({ path:el.imgUrl, x, y, w, h, rotate:el.rotate||0 });
        }
      });
    });
    const data = await pptx.write({ outputType: 'base64' }) as string;
    await platformApi.writeFile(targetPath, data, 'base64');
  };

  const openSaveAs = () => {
    const dir = path.includes('/') ? path.replace(/\/[^/]+$/, '/') : path.replace(/\\[^\\]+$/, '\\');
    setSaveAsPath(dir + path.replace(/^.*[\\/]/, ''));
    setShowSaveAsModal(true);
  };

  const handleSaveAs = async () => {
    const target = saveAsPath.trim();
    if (!target) return;
    setSavePending(true);
    setShowSaveAsModal(false);
    try {
      await saveToPath(target);
      setIsDirty(false);
      toast.success(`Saved as ${target.replace(/^.*[\\/]/,'')}`);
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'Failed to save presentation');
    } finally {
      setSavePending(false);
    }
  };

  // Drag and Resize handlers
  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const curX = e.clientX;
    const curY = e.clientY;

    if (isDragging && selectedElement) {
      const slide = slides[slideIndex];
      const el = slide.elements.find(item => item.id === selectedElement);
      if (!el) return;

      const deltaX = ((curX - dragStartMouse.x) / rect.width) * 100;
      const deltaY = ((curY - dragStartMouse.y) / rect.height) * 100;

      updateElement(selectedElement, {
        x: Math.max(0, Math.min(100 - el.w, dragStartRect.x + deltaX)),
        y: Math.max(0, Math.min(100 - el.h, dragStartRect.y + deltaY))
      });
    }

    if (isResizing && selectedElement) {
      const slide = slides[slideIndex];
      const el = slide.elements.find(item => item.id === selectedElement);
      if (!el) return;

      const deltaX = ((curX - dragStartMouse.x) / rect.width) * 100;
      const deltaY = ((curY - dragStartMouse.y) / rect.height) * 100;

      let nextX = dragStartRect.x;
      let nextY = dragStartRect.y;
      let nextW = dragStartRect.w;
      let nextH = dragStartRect.h;

      if (isResizing === 'se') {
        nextW = Math.max(5, dragStartRect.w + deltaX);
        nextH = Math.max(5, dragStartRect.h + deltaY);
      } else if (isResizing === 'sw') {
        const right = dragStartRect.x + dragStartRect.w;
        nextX = Math.max(0, Math.min(right - 5, dragStartRect.x + deltaX));
        nextW = right - nextX;
        nextH = Math.max(5, dragStartRect.h + deltaY);
      } else if (isResizing === 'ne') {
        const bottom = dragStartRect.y + dragStartRect.h;
        nextY = Math.max(0, Math.min(bottom - 5, dragStartRect.y + deltaY));
        nextH = bottom - nextY;
        nextW = Math.max(5, dragStartRect.w + deltaX);
      } else if (isResizing === 'nw') {
        const right = dragStartRect.x + dragStartRect.w;
        const bottom = dragStartRect.y + dragStartRect.h;
        nextX = Math.max(0, Math.min(right - 5, dragStartRect.x + deltaX));
        nextW = right - nextX;
        nextY = Math.max(0, Math.min(bottom - 5, dragStartRect.y + deltaY));
        nextH = bottom - nextY;
      }

      updateElement(selectedElement, {
        x: nextX, y: nextY, w: nextW, h: nextH
      });
    }
  };

  const startDrag = (e: React.MouseEvent, el: SlideElement) => {
    e.stopPropagation();
    setSelectedElement(el.id);
    setIsDragging(true);
    setDragStartMouse({ x: e.clientX, y: e.clientY });
    setDragStartRect({ x: el.x, y: el.y, w: el.w, h: el.h });
  };

  const startResize = (e: React.MouseEvent, handle: string, el: SlideElement) => {
    e.stopPropagation();
    setIsResizing(handle);
    setDragStartMouse({ x: e.clientX, y: e.clientY });
    setDragStartRect({ x: el.x, y: el.y, w: el.w, h: el.h });
  };

  const stopDragOrResize = () => {
    setIsDragging(false);
    setIsResizing(null);
  };

  const currentSlide = slides[slideIndex];
  const canvasBaseWidth = 960;
  const canvasBaseHeight = Math.round(canvasBaseWidth / (slideAspectRatio || (16 / 9)));

  // Helper to render mini shapes in thumbnails
  const renderThumbnailContent = (slide: SlideData) => {
    return (
      <div className="w-full h-full relative overflow-hidden rounded bg-white shadow-inner border border-zinc-200">
        <div className="absolute inset-0" style={{ backgroundColor: slide.bgColor }} />
        {slide.elements.map(el => {
          const style = {
            left: `${el.x}%`, top: `${el.y}%`,
            width: `${el.w}%`, height: `${el.h}%`,
          };
          if (el.type === 'text') {
            return (
              <div key={el.id} className="absolute flex items-center p-0.5 overflow-hidden text-[3px] leading-tight font-bold scale-[0.9]" style={{ ...style, color: el.color || '#333', justifyContent: el.align === 'center' ? 'center' : el.align === 'right' ? 'flex-end' : 'flex-start' }}>
                {el.text || 'Text'}
              </div>
            );
          } else if (el.type === 'shape') {
            return (
              <div key={el.id} className={cn("absolute border-[0.2px] border-zinc-500", el.shapeType === 'circle' ? 'rounded-full' : 'rounded-[2px]')} style={{ ...style, backgroundColor: el.bgColor }} />
            );
          } else if (el.type === 'image' && el.imgUrl) {
            return (
              <img key={el.id} src={el.imgUrl} className="absolute object-cover" style={style} alt="" />
            );
          }
          return null;
        })}
      </div>
    );
  };

  return (
    <div ref={containerRef} className={cn('flex h-full flex-col bg-zinc-900 text-zinc-100 font-sans select-none', isFullscreen && 'fixed inset-0 z-50')}>

      {/* Save As Modal */}
      {showSaveAsModal && (
        <div className="fixed inset-0 z-[100] bg-black/70 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl w-full max-w-md p-6">
            <h3 className="text-base font-bold text-white mb-1 flex items-center gap-2">
              <Save className="h-4 w-4 text-[#f16e4f]" /> Save Presentation As
            </h3>
            <p className="text-xs text-zinc-400 mb-4">Enter the full server path to save the .pptx file.</p>
            <label className="text-xs font-semibold text-zinc-400 block mb-1">Destination Path (server)</label>
            <input
              type="text" value={saveAsPath} onChange={e => setSaveAsPath(e.target.value)}
              onKeyDown={e => { if (e.key==='Enter') handleSaveAs(); if (e.key==='Escape') setShowSaveAsModal(false); }}
              autoFocus
              className="w-full px-3 py-2 text-sm border border-zinc-600 rounded-lg mb-4 outline-none focus:border-[#f16e4f] focus:ring-2 focus:ring-[#f16e4f]/20 font-mono bg-zinc-800 text-white"
              placeholder="e.g. /home/user/slides/deck.pptx"
            />
            <div className="text-[11px] text-zinc-500 mb-4 bg-zinc-800 rounded-lg p-3 border border-zinc-700 space-y-0.5">
              <p>• <b className="text-zinc-300">Windows:</b> <code>C:/Users/you/Desktop/deck.pptx</code></p>
              <p>• <b className="text-zinc-300">Linux/Mac:</b> <code>/home/you/Documents/deck.pptx</code></p>
            </div>
            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="outline" className="border-zinc-600 text-zinc-300" onClick={() => setShowSaveAsModal(false)}>Cancel</Button>
              <Button size="sm" onClick={handleSaveAs} disabled={savePending||!saveAsPath.trim()} className="bg-[#b7472a] hover:bg-[#943920] text-white">
                <Save className="h-3.5 w-3.5 mr-1.5" />{savePending?'Saving…':'Save'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="bg-[#b7472a] text-white px-4 py-2 flex items-center justify-between shrink-0 shadow-md">
        <div className="flex items-center gap-3">
          <div className="bg-white text-[#b7472a] font-black text-sm h-7 w-7 flex items-center justify-center rounded shadow">P</div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm tracking-wide">PowerPoint Studio</span>
              <span className="bg-red-800/60 text-[9px] px-1.5 py-0.5 rounded uppercase tracking-wider font-semibold text-red-200">PRO Editor</span>
            </div>
            <div className="text-[10px] text-red-100 font-mono truncate max-w-sm">{path.split('/').pop()}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isDirty && <span className="text-xs bg-amber-600/60 px-2 py-0.5 rounded text-amber-100 animate-pulse mr-2">Unsaved</span>}

          {/* View / Edit mode toggle */}
          <div className="flex items-center bg-white/10 rounded-lg overflow-hidden border border-white/20 mr-1">
            <button onClick={() => setViewMode('view')} className={cn('h-8 px-3 text-xs font-semibold transition-all', viewMode==='view' ? 'bg-white text-[#b7472a]' : 'text-white hover:bg-white/20')}>View</button>
            <button onClick={() => setViewMode('edit')} className={cn('h-8 px-3 text-xs font-semibold transition-all', viewMode==='edit' ? 'bg-white text-[#b7472a]' : 'text-white hover:bg-white/20')}>Edit</button>
          </div>

          <Button size="sm" variant="ghost" onClick={() => { setSlideshowIndex(slideIndex); setInSlideshow(true); }} className="h-8 text-white bg-white/10 hover:bg-white/20">
            <Play className="h-4 w-4 mr-1.5" />Slideshow
          </Button>

          <div className="w-px h-5 bg-white/20 mx-1" />

          {/* Save / Save As split button */}
          <div className="flex items-center bg-white/10 rounded-lg overflow-hidden border border-white/20">
            <Button size="sm" variant="ghost" onClick={handleSave} disabled={savePending} className="h-8 text-white hover:bg-red-800 rounded-none border-r border-white/20 px-3">
              <Save className="h-4 w-4 mr-1.5" />{savePending?'Saving…':'Save'}
            </Button>
            <Button size="sm" variant="ghost" onClick={openSaveAs} disabled={savePending} className="h-8 text-white hover:bg-red-800 rounded-none text-xs px-2.5">
              Save As…
            </Button>
          </div>

          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setReloadTrigger(prev => prev + 1);
              toast.success('Reloading presentation...');
            }}
            className="h-8 text-white hover:bg-red-800 hover:text-white"
            title="Reload from server"
          >
            <RefreshCw className="h-4 w-4 mr-1.5" />Reload
          </Button>

          <Button size="sm" variant="ghost" onClick={onDownload} className="h-8 text-white hover:bg-red-800 hover:text-white"><Download className="h-4 w-4 mr-1.5" />Download</Button>
          <Button size="icon" variant="ghost" onClick={toggleFullscreen} className="h-8 w-8 text-white hover:bg-red-800 hover:text-white">{isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}</Button>
        </div>
      </div>

      {/* Editor Ribbon / Toolbar */}
      <div className="bg-zinc-800 border-b border-zinc-700 px-4 py-2 flex items-center gap-2 shrink-0 flex-wrap z-10 shadow">
        {/* Insert Section */}
        <div className="flex items-center gap-1.5 bg-zinc-900/40 rounded-lg p-1 border border-zinc-700/60">
          <span className="text-[10px] uppercase font-bold text-zinc-500 px-1">Insert</span>
          <Button size="sm" variant="ghost" onClick={addTextElement} className="h-8 text-xs hover:bg-zinc-700 text-zinc-300 hover:text-white"><Type className="h-3.5 w-3.5 mr-1.5" />Text</Button>
          
          <select
            onChange={(e) => {
              if (e.target.value) {
                addShapeElement(e.target.value as any);
                e.target.value = '';
              }
            }}
            className="text-xs bg-zinc-700/80 border border-zinc-600 rounded px-2.5 py-1 text-zinc-200 outline-none cursor-pointer hover:bg-zinc-700"
          >
            <option value="">Insert Shape...</option>
            {SHAPES.map(s => <option key={s.type} value={s.type}>{s.label}</option>)}
          </select>

          <Button size="sm" variant="ghost" onClick={addImageElement} className="h-8 text-xs hover:bg-zinc-700 text-zinc-300 hover:text-white"><Image className="h-3.5 w-3.5 mr-1.5" />Image</Button>
        </div>

        <div className="w-px h-6 bg-zinc-700 mx-1" />

        {/* Slide Management */}
        <div className="flex items-center gap-1.5 bg-zinc-900/40 rounded-lg p-1 border border-zinc-700/60">
          <span className="text-[10px] uppercase font-bold text-zinc-500 px-1">Slide</span>
          <Button size="sm" variant="ghost" onClick={addNewSlide} className="h-8 text-xs text-[#f16e4f] hover:bg-[#b7472a]/20"><Plus className="h-3.5 w-3.5 mr-1" />New</Button>
          <Button size="sm" variant="ghost" onClick={duplicateSlide} className="h-8 text-xs text-zinc-300 hover:bg-zinc-700"><Copy className="h-3.5 w-3.5 mr-1" />Duplicate</Button>
          <Button size="sm" variant="ghost" onClick={deleteCurrentSlide} className="h-8 text-xs text-red-400 hover:bg-red-500/20"><Trash2 className="h-3.5 w-3.5 mr-1" />Delete</Button>

          <div className="w-px h-5 bg-zinc-700 mx-1.5" />
          <select
            onChange={(e) => {
              if (e.target.value) {
                applyTemplate(e.target.value as any);
                e.target.value = '';
              }
            }}
            className="text-xs bg-zinc-700/80 border border-zinc-600 rounded px-2.5 py-1 text-zinc-200 outline-none cursor-pointer hover:bg-zinc-700"
          >
            <option value="">Apply Layout...</option>
            <option value="title">Title Slide</option>
            <option value="content">Title & Content</option>
            <option value="split">Split Columns</option>
            <option value="blank">Blank Slide</option>
          </select>

          <div className="flex items-center gap-0.5 border-l border-zinc-700 pl-1.5 ml-1">
            <Button size="icon" variant="ghost" onClick={() => moveSlideOrder('up')} disabled={slideIndex === 0} className="h-7 w-7 text-zinc-400 hover:bg-zinc-700 hover:text-white" title="Move Slide Up"><ArrowUp className="h-3.5 w-3.5" /></Button>
            <Button size="icon" variant="ghost" onClick={() => moveSlideOrder('down')} disabled={slideIndex === slides.length - 1} className="h-7 w-7 text-zinc-400 hover:bg-zinc-700 hover:text-white" title="Move Slide Down"><ArrowDown className="h-3.5 w-3.5" /></Button>
          </div>
        </div>

        {/* Background Config */}
        <div className="flex items-center gap-2 bg-zinc-900/40 rounded-lg px-3 py-1 border border-zinc-700/60 text-xs">
          <label className="text-[10px] uppercase font-bold text-zinc-500">Bg Color</label>
          <input
            type="color"
            value={currentSlide?.bgColor || '#ffffff'}
            onChange={(e) => {
              const updated = [...slides];
              updated[slideIndex].bgColor = e.target.value;
              setSlides(updated);
              setIsDirty(true);
            }}
            className="h-7 w-8 rounded border border-zinc-600 bg-transparent cursor-pointer"
            title="Slide background color"
          />
        </div>

        {/* Zoom Controls */}
        <div className="flex items-center gap-1 bg-zinc-900/40 rounded-lg p-1 border border-zinc-700/60 text-xs">
          <span className="text-[10px] uppercase font-bold text-zinc-500 px-1">Zoom</span>
          <Button size="icon" variant="ghost" onClick={() => setZoom(z => Math.max(25, z - 25))} className="h-7 w-7 text-zinc-400 hover:bg-zinc-700 hover:text-white" title="Zoom Out">
            <ZoomOut className="h-3.5 w-3.5" />
          </Button>
          <span className="text-[11px] font-mono font-bold text-zinc-300 w-10 text-center">{zoom}%</span>
          <Button size="icon" variant="ghost" onClick={() => setZoom(z => Math.min(200, z + 25))} className="h-7 w-7 text-zinc-400 hover:bg-zinc-700 hover:text-white" title="Zoom In">
            <ZoomIn className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setZoom(100)} className="h-7 px-2 text-[10px] text-zinc-300 hover:bg-zinc-700 hover:text-white">
            Reset
          </Button>
        </div>

        {/* Element Formatting Options */}
        {selectedElement && currentSlide && (
          <>
            <div className="w-px h-6 bg-zinc-700 mx-1" />
            {(() => {
              const el = currentSlide.elements.find(e => e.id === selectedElement);
              if (!el) return null;
              return (
                <div className="flex items-center gap-1.5 bg-zinc-900/40 rounded-lg p-1 border border-zinc-700/60">
                  <span className="text-[10px] uppercase font-bold text-zinc-500 px-1.5">Format ({el.type})</span>

                  {/* Clipboard */}
                  <Button size="icon" variant="ghost" onClick={() => copyElement(el)} className="h-8 w-8 text-zinc-300 hover:bg-zinc-700 hover:text-white" title="Copy"><Copy className="h-4 w-4" /></Button>
                  {copiedElement && (
                    <Button size="icon" variant="ghost" onClick={pasteElement} className="h-8 w-8 text-zinc-300 hover:bg-zinc-700 hover:text-white" title="Paste"><Clipboard className="h-4 w-4" /></Button>
                  )}

                  <div className="w-px h-5 bg-zinc-700 mx-1" />

                  {/* Layer ordering */}
                  <Button size="icon" variant="ghost" onClick={() => moveElementLayer(el.id, 'front')} className="h-8 w-8 text-zinc-300 hover:bg-zinc-700 hover:text-white" title="Bring to Front"><Layers className="h-4 w-4 text-emerald-400" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => moveElementLayer(el.id, 'back')} className="h-8 w-8 text-zinc-300 hover:bg-zinc-700 hover:text-white" title="Send to Back"><Layers className="h-4 w-4 text-red-400 rotate-180" /></Button>

                  <div className="w-px h-5 bg-zinc-700 mx-1" />

                  {el.type === 'text' && (
                    <>
                      {/* Font Family selector */}
                      <select
                        value={el.fontFamily || 'Segoe UI'}
                        onChange={(e) => updateElement(el.id, { fontFamily: e.target.value })}
                        className="text-xs bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-zinc-200 outline-none cursor-pointer"
                        title="Font Family"
                      >
                        {FONTS.map(f => (
                          <option key={f.name} value={f.name}>{f.name}</option>
                        ))}
                      </select>

                      {/* Text Color picker */}
                      <label className="text-[10px] text-zinc-400 pl-1">Color</label>
                      <input 
                        type="color" 
                        value={el.color || '#333333'} 
                        onChange={(e) => updateElement(el.id, { color: e.target.value })} 
                        className="h-7 w-7 rounded border border-zinc-600 bg-transparent cursor-pointer" 
                        title="Text Color" 
                      />

                      <input
                        type="number"
                        value={el.fontSize || 20}
                        onChange={(e) => updateElement(el.id, { fontSize: Number(e.target.value) })}
                        className="w-12 h-7 text-xs bg-zinc-800 border border-zinc-600 rounded text-center text-zinc-200"
                        title="Font Size"
                      />

                      <Button size="sm" variant={el.bold ? 'default' : 'outline'} className="h-7 px-2 text-xs" onClick={() => updateElement(el.id, { bold: !el.bold })} title="Bold">B</Button>
                      <Button size="sm" variant={el.italic ? 'default' : 'outline'} className="h-7 px-2 text-xs" onClick={() => updateElement(el.id, { italic: !el.italic })} title="Italic">I</Button>
                      <Button size="sm" variant={el.underline ? 'default' : 'outline'} className="h-7 px-2 text-xs" onClick={() => updateElement(el.id, { underline: !el.underline })} title="Underline">U</Button>

                      {/* Alignments */}
                      <select
                        value={el.align || 'left'}
                        onChange={(e) => updateElement(el.id, { align: e.target.value as any })}
                        className="text-xs bg-zinc-800 border border-zinc-600 rounded px-1.5 py-1 text-zinc-200 outline-none cursor-pointer"
                      >
                        <option value="left">Left</option>
                        <option value="center">Center</option>
                        <option value="right">Right</option>
                      </select>

                      {/* Rotation */}
                      <label className="text-[10px] text-zinc-400 pl-1">Rotate</label>
                      <input
                        type="number"
                        min={0}
                        max={359}
                        value={el.rotate || 0}
                        onChange={(e) => updateElement(el.id, { rotate: Number(e.target.value) })}
                        className="w-12 h-7 text-xs bg-zinc-800 border border-zinc-600 rounded text-center text-zinc-200"
                        title="Rotation Angle"
                      />
                    </>
                  )}

                  {el.type === 'shape' && (
                    <>
                      <label className="text-[10px] text-zinc-400">Fill</label>
                      <input type="color" value={el.bgColor || '#3b82f6'} onChange={(e) => updateElement(el.id, { bgColor: e.target.value })} className="h-7 w-7 rounded border border-zinc-600 bg-transparent cursor-pointer" title="Shape color" />
                      <label className="text-[10px] text-zinc-400">Stroke</label>
                      <input type="color" value={el.strokeColor || '#1d4ed8'} onChange={(e) => updateElement(el.id, { strokeColor: e.target.value })} className="h-7 w-7 rounded border border-zinc-600 bg-transparent cursor-pointer" title="Stroke color" />
                      
                      <label className="text-[10px] text-zinc-400 pl-1">Weight</label>
                      <input
                        type="number"
                        min={0}
                        max={20}
                        value={el.strokeWidth || 1}
                        onChange={(e) => updateElement(el.id, { strokeWidth: Number(e.target.value) })}
                        className="w-10 h-7 text-xs bg-zinc-800 border border-zinc-600 rounded text-center text-zinc-200"
                        title="Stroke Width"
                      />

                      {el.shapeType === 'rect' && (
                        <>
                          <label className="text-[10px] text-zinc-400 pl-1">Radius</label>
                          <input
                            type="number"
                            min={0}
                            max={50}
                            value={el.borderRadius || 0}
                            onChange={(e) => updateElement(el.id, { borderRadius: Number(e.target.value) })}
                            className="w-10 h-7 text-xs bg-zinc-800 border border-zinc-600 rounded text-center text-zinc-200"
                            title="Border Radius"
                          />
                        </>
                      )}

                      {/* Rotation */}
                      <label className="text-[10px] text-zinc-400 pl-1">Rotate</label>
                      <input
                        type="number"
                        min={0}
                        max={359}
                        value={el.rotate || 0}
                        onChange={(e) => updateElement(el.id, { rotate: Number(e.target.value) })}
                        className="w-12 h-7 text-xs bg-zinc-800 border border-zinc-600 rounded text-center text-zinc-200"
                        title="Rotation Angle"
                      />
                    </>
                  )}

                  {el.type === 'image' && (
                    <>
                      {/* Rotation */}
                      <label className="text-[10px] text-zinc-400 pl-1">Rotate</label>
                      <input
                        type="number"
                        min={0}
                        max={359}
                        value={el.rotate || 0}
                        onChange={(e) => updateElement(el.id, { rotate: Number(e.target.value) })}
                        className="w-12 h-7 text-xs bg-zinc-800 border border-zinc-600 rounded text-center text-zinc-200"
                        title="Rotation Angle"
                      />
                    </>
                  )}

                  <div className="w-px h-5 bg-zinc-700 mx-1.5" />
                  
                  {/* Tick / Lock Confirm Button */}
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    className="h-8 text-emerald-400 hover:bg-emerald-500/20 px-2 py-0.5 rounded flex items-center gap-1 font-bold" 
                    onClick={() => { setSelectedElement(null); toast.success("Changes locked in"); }}
                    title="Confirm Changes & Unlock Element"
                  >
                    <Check className="h-4 w-4" /> Done
                  </Button>

                  <Button size="icon" variant="ghost" className="h-8 w-8 text-red-400 hover:bg-red-500/20" onClick={() => deleteElement(el.id)} title="Delete Element"><Trash2 className="h-4 w-4" /></Button>
                </div>
              );
            })()}
          </>
        )}
      </div>

      {/* Main Canvas Workspace */}
      <div className="flex-1 flex overflow-hidden min-h-0 relative">
        {/* Slide Visual Thumbnails Sidebar */}
        <div className="w-48 border-r border-zinc-800 bg-zinc-950 overflow-y-auto p-3 space-y-3 shrink-0 scrollbar-thin flex flex-col shadow-inner">
          <label className="text-[10px] font-extrabold text-zinc-500 uppercase tracking-widest block mb-1.5 px-1">Slides</label>
          <div className="flex-1 space-y-3">
            {slides.map((slide, idx) => (
              <div key={slide.id} className="relative group">
                <button
                  onClick={() => { setSlideIndex(idx); setSelectedElement(null); }}
                  className={cn(
                    'w-full aspect-video rounded-lg border-2 transition-all p-1 bg-zinc-900',
                    slideIndex === idx ? 'border-[#b7472a] shadow-lg shadow-red-500/10' : 'border-zinc-800 hover:border-zinc-700'
                  )}
                >
                  {Math.abs(idx - slideIndex) <= 6 ? (
                    renderThumbnailContent(slide)
                  ) : (
                    <div className="w-full h-full rounded bg-zinc-900 border border-zinc-800 flex items-center justify-center text-[10px] font-mono text-zinc-500">
                      Slide {idx + 1}
                    </div>
                  )}
                </button>
                <span className="absolute bottom-1 right-2 bg-black/60 text-[9px] font-bold text-zinc-400 px-1 py-0.5 rounded leading-none">
                  {idx + 1}
                </span>
              </div>
            ))}
          </div>

          <button onClick={addNewSlide} className="w-full aspect-video rounded-lg border-2 border-dashed border-zinc-800 flex flex-col gap-1 items-center justify-center text-zinc-600 hover:border-[#b7472a] hover:text-[#b7472a] transition-all bg-zinc-900/30 py-3">
            <Plus className="h-5 w-5" />
            <span className="text-[10px] font-bold">New Slide</span>
          </button>
        </div>

        {/* HIGH-FIDELITY VIEW MODE — pptx-viewer renders directly to DOM like Google Slides / MS web */}
        {viewMode === 'view' && (
          <div className="flex-1 overflow-auto flex flex-col items-center justify-center bg-[radial-gradient(circle_at_20%_20%,#1a2740_0%,#0a0f1a_55%,#05080f_100%)] p-6 gap-4">
            <div className="text-[11px] text-zinc-500 bg-zinc-900 border border-zinc-800 rounded-full px-4 py-1.5 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-pulse" />
              High-fidelity preview · Switch to <button onClick={() => setViewMode('edit')} className="text-[#f16e4f] font-bold hover:underline">Edit mode</button> to make changes
            </div>
            {/* pptx-viewer renders full slide CSS/HTML layout here */}
            <div
              ref={slideHostRef}
              className="pptx-fidelity-scope shadow-2xl rounded-md overflow-hidden bg-white border border-zinc-300/60"
              style={{ width: '100%', maxWidth: 1600, minHeight: Math.floor(viewRenderWidth / (slideAspectRatio || (16 / 9))) }}
            />
            {/* Slide navigation */}
            <div className="flex items-center gap-3 mt-2">
              <Button size="sm" variant="ghost" onClick={() => setSlideIndex(i => Math.max(0, i - 1))} disabled={slideIndex === 0} className="text-zinc-400 hover:text-white hover:bg-zinc-700">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-xs text-zinc-400 font-mono">Slide {slideIndex + 1} / {slides.length}</span>
              <Button size="sm" variant="ghost" onClick={() => setSlideIndex(i => Math.min(slides.length - 1, i + 1))} disabled={slideIndex === slides.length - 1} className="text-zinc-400 hover:text-white hover:bg-zinc-700">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* EDIT MODE — custom canvas editor */}
        {viewMode === 'edit' && (
        <div className="flex-1 overflow-auto flex relative min-h-0" style={{ background: 'radial-gradient(circle at 50% 50%, #1a1a2e 0%, #0f0f1a 100%)' }}>
          <div 
            className="flex items-center justify-center p-8 min-h-full min-w-full"
            style={{
              width: zoom > 100 ? `${canvasBaseWidth * (zoom / 100) + 64}px` : 'auto',
              height: zoom > 100 ? `${canvasBaseHeight * (zoom / 100) + 64}px` : 'auto',
            }}
          >
            {/* Slide canvas — professional shadow like Google Slides */}
            <div className="relative shrink-0">
              <div
                className="bg-white relative select-none rounded-sm"
                style={{
                  width: canvasBaseWidth,
                  height: canvasBaseHeight,
                  backgroundColor: currentSlide?.bgColor || '#ffffff',
                  transform: `scale(${zoom / 100})`,
                  transformOrigin: 'center center',
                  boxShadow: '0 4px 24px rgba(0,0,0,0.45), 0 1px 6px rgba(0,0,0,0.3)',
                }}
                onClick={() => setSelectedElement(null)}
                onMouseMove={handleCanvasMouseMove}
                onMouseUp={stopDragOrResize}
                onMouseLeave={stopDragOrResize}
              >
              {/* Draw Elements */}
              {currentSlide && currentSlide.elements.map(el => {
                const isSelected = selectedElement === el.id;
                const boundsStyle = {
                  left: `${el.x}%`, top: `${el.y}%`,
                  width: `${el.w}%`, height: `${el.h}%`,
                  transform: el.rotate ? `rotate(${el.rotate}deg)` : undefined,
                };
                const fontCss = el.fontFamily ? (FONTS.find(f => f.name === el.fontFamily)?.css || el.fontFamily) : "'Segoe UI', sans-serif";

                return (
                  <div
                    key={el.id}
                    onMouseDown={(e) => startDrag(e, el)}
                    onClick={(e) => e.stopPropagation()}
                    onDoubleClick={(e) => { e.stopPropagation(); if (el.type === 'text') setEditingText(el.id); }}
                    className={cn(
                      'absolute transition-shadow duration-100 flex items-center justify-center box-border',
                      isSelected && 'ring-2 ring-blue-500 z-30 cursor-move'
                    )}
                    style={boundsStyle}
                  >
                  {/* Element Content Render */}
                  {el.type === 'text' && (
                    editingText === el.id ? (
                      <textarea
                        autoFocus
                        value={el.text || ''}
                        onChange={(e) => updateElement(el.id, { text: e.target.value })}
                        onBlur={() => setEditingText(null)}
                        onKeyDown={(e) => { if (e.key === 'Escape') setEditingText(null); }}
                        className="w-full h-full p-2 resize-none outline-none border-2 border-blue-500 rounded bg-white text-zinc-800 font-sans z-50 shadow-lg"
                        style={{
                          fontSize: `${Math.max(8, el.fontSize || 20)}px`,
                          fontWeight: el.bold ? 'bold' : 'normal',
                          fontStyle: el.italic ? 'italic' : 'normal',
                          textDecoration: el.underline ? 'underline' : 'none',
                          color: el.color || '#333333',
                          textAlign: el.align || 'left',
                          fontFamily: fontCss
                        }}
                      />
                    ) : (
                      <div
                        className="w-full h-full p-1 overflow-hidden break-words leading-snug"
                        style={{
                          fontSize: `${Math.max(8, el.fontSize || 20)}px`,
                          fontWeight: el.bold ? 'bold' : 'normal',
                          fontStyle: el.italic ? 'italic' : 'normal',
                          textDecoration: el.underline ? 'underline' : 'none',
                          color: el.color || '#333333',
                          textAlign: el.align || 'left',
                          wordBreak: 'break-word' as const,
                          overflowWrap: 'break-word' as const,
                          whiteSpace: 'pre-wrap',
                          fontFamily: fontCss
                        }}
                      >
                        {el.text || 'Double-click to edit text'}
                      </div>
                    )
                  )}

                  {el.type === 'shape' && (
                    <svg
                      viewBox="0 0 100 100"
                      preserveAspectRatio="none"
                      className="w-full h-full"
                      style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.08))' }}
                    >
                      {el.shapeType === 'rect' && (
                        <rect
                          x={el.strokeWidth || 1} y={el.strokeWidth || 1}
                          width={100 - 2 * (el.strokeWidth || 1)} height={100 - 2 * (el.strokeWidth || 1)}
                          rx={el.borderRadius || 0} ry={el.borderRadius || 0}
                          fill={el.bgColor || '#3b82f6'}
                          stroke={el.strokeColor || '#1d4ed8'}
                          strokeWidth={el.strokeWidth || 1}
                          vectorEffect="non-scaling-stroke"
                        />
                      )}
                      {el.shapeType === 'circle' && (
                        <ellipse
                          cx="50" cy="50" rx={50 - (el.strokeWidth || 1)} ry={50 - (el.strokeWidth || 1)}
                          fill={el.bgColor || '#3b82f6'}
                          stroke={el.strokeColor || '#1d4ed8'}
                          strokeWidth={el.strokeWidth || 1}
                          vectorEffect="non-scaling-stroke"
                        />
                      )}
                      {el.shapeType === 'triangle' && (
                        <polygon
                          points="50,2 98,98 2,98"
                          fill={el.bgColor || '#3b82f6'}
                          stroke={el.strokeColor || '#1d4ed8'}
                          strokeWidth={el.strokeWidth || 1}
                          strokeLinejoin="round"
                          vectorEffect="non-scaling-stroke"
                        />
                      )}
                      {el.shapeType === 'star' && (
                        <polygon
                          points="50,2 61,35 98,35 68,57 79,91 50,70 21,91 32,57 2,35 39,35"
                          fill={el.bgColor || '#3b82f6'}
                          stroke={el.strokeColor || '#1d4ed8'}
                          strokeWidth={el.strokeWidth || 1}
                          strokeLinejoin="round"
                          vectorEffect="non-scaling-stroke"
                        />
                      )}
                      {el.shapeType === 'arrow' && (
                        <polygon
                          points="0,25 60,25 60,5 100,50 60,95 60,75 0,75"
                          fill={el.bgColor || '#3b82f6'}
                          stroke={el.strokeColor || '#1d4ed8'}
                          strokeWidth={el.strokeWidth || 1}
                          strokeLinejoin="round"
                          vectorEffect="non-scaling-stroke"
                        />
                      )}
                      {el.shapeType === 'cloud' && (
                        <path
                          d="M25,60 Q0,60 10,45 Q0,30 20,25 Q20,5 40,10 Q50,0 65,10 Q80,0 85,15 Q100,15 95,35 Q105,50 90,55 Q100,70 80,75 Q75,90 55,80 Q40,90 35,75 Q15,80 25,60Z"
                          fill={el.bgColor || '#3b82f6'}
                          stroke={el.strokeColor || '#1d4ed8'}
                          strokeWidth={el.strokeWidth || 1}
                          strokeLinejoin="round"
                          vectorEffect="non-scaling-stroke"
                        />
                      )}
                    </svg>
                  )}

                  {el.type === 'image' && el.imgUrl && (
                    <img src={el.imgUrl} className="w-full h-full object-cover pointer-events-none rounded-md" alt="" />
                  )}

                  {/* Resize Handles */}
                  {isSelected && (
                    <>
                      <div onMouseDown={(e) => startResize(e, 'nw', el)} className="absolute w-2.5 h-2.5 bg-blue-600 border border-white -top-1.5 -left-1.5 z-40 cursor-nwse-resize" />
                      <div onMouseDown={(e) => startResize(e, 'ne', el)} className="absolute w-2.5 h-2.5 bg-blue-600 border border-white -top-1.5 -right-1.5 z-40 cursor-nesw-resize" />
                      <div onMouseDown={(e) => startResize(e, 'se', el)} className="absolute w-2.5 h-2.5 bg-blue-600 border border-white -bottom-1.5 -right-1.5 z-40 cursor-nwse-resize" />
                      <div onMouseDown={(e) => startResize(e, 'sw', el)} className="absolute w-2.5 h-2.5 bg-blue-600 border border-white -bottom-1.5 -left-1.5 z-40 cursor-nesw-resize" />
                    </>
                  )}

                  {/* Floating Action / Confirm Toolbar */}
                  {isSelected && (
                    <div 
                      className="absolute -top-12 left-1/2 -translate-x-1/2 bg-zinc-950/95 text-white border border-zinc-700/80 rounded-lg shadow-2xl px-2.5 py-1.5 flex items-center gap-2 z-[60] backdrop-blur-md shrink-0 pointer-events-auto select-none"
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                      style={{ transform: el.rotate ? `rotate(${-el.rotate}deg)` : undefined }}
                    >
                      <button
                        onClick={() => { setSelectedElement(null); toast.success("Changes locked in"); }}
                        className="flex items-center gap-1 text-[11px] font-bold text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/20 px-2 py-0.5 rounded transition-all cursor-pointer"
                        title="Confirm & Close (Move on)"
                      >
                        <Check className="h-3.5 w-3.5" /> Confirm
                      </button>
                      <div className="w-px h-4 bg-zinc-700" />
                      
                      <button
                        onClick={() => deleteElement(el.id)}
                        className="text-red-400 hover:text-red-300 hover:bg-red-500/20 p-1 rounded transition-all cursor-pointer"
                        title="Delete Element"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                      
                      <button
                        onClick={() => copyElement(el)}
                        className="text-zinc-300 hover:text-white hover:bg-white/10 p-1 rounded transition-all cursor-pointer"
                        title="Copy Element"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>

                      <button
                        onClick={() => updateElement(el.id, { rotate: ((el.rotate || 0) + 90) % 360 })}
                        className="text-zinc-300 hover:text-white hover:bg-white/10 p-1 rounded transition-all cursor-pointer"
                        title="Rotate 90°"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                      </button>

                      <button
                        onClick={() => moveElementLayer(el.id, 'front')}
                        className="text-zinc-300 hover:text-white hover:bg-white/10 p-1 rounded transition-all cursor-pointer"
                        title="Bring to Front"
                      >
                        <Layers className="h-3.5 w-3.5 text-emerald-400" />
                      </button>

                      <button
                        onClick={() => moveElementLayer(el.id, 'back')}
                        className="text-zinc-300 hover:text-white hover:bg-white/10 p-1 rounded transition-all cursor-pointer"
                        title="Send to Back"
                      >
                        <Layers className="h-3.5 w-3.5 text-red-400 rotate-180" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}

            {currentSlide && currentSlide.elements.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center text-zinc-400/60 text-sm italic pointer-events-none select-none">
                <div className="flex flex-col items-center gap-2">
                  <svg className="w-10 h-10 opacity-30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>
                  Click Insert above to add elements
                </div>
              </div>
            )}
              </div>
              {/* Slide number indicator — like Google Slides */}
              <div className="flex items-center justify-center mt-3 gap-4">
                <span className="text-[11px] text-zinc-500 font-mono bg-zinc-800/50 px-3 py-1 rounded-full border border-zinc-700/40">
                  Slide {slideIndex + 1} / {slides.length} · {zoom}%
                </span>
              </div>
            </div>
          </div>
        </div>
        )}

        {isParsing && (
          <div className="absolute inset-0 z-30 bg-black/45 backdrop-blur-[1px] flex items-center justify-center">
            <div className="bg-zinc-900/95 border border-zinc-700 rounded-xl shadow-2xl px-5 py-4 min-w-[320px]">
              <div className="flex items-center gap-3">
                <div className="h-5 w-5 rounded-full border-2 border-red-200/30 border-t-[#f16e4f] animate-spin" />
                <div>
                  <div className="text-sm font-semibold text-white">Loading PPTX</div>
                  <div className="text-xs text-zinc-400">{parseMessage}</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Styled Laser and Paint Canvas Overlay for Slideshow */}
      {inSlideshow && (
        <div
          className="fixed inset-0 z-50 bg-black flex flex-col justify-center items-center select-none"
          onMouseMove={(e) => {
            setLaserPointer({ x: e.clientX, y: e.clientY });
          }}
        >
          {/* Laser Pointer visual */}
          {laserPointer && (
            <div
              className="fixed w-6 h-6 rounded-full bg-red-500 opacity-80 blur-[2px] pointer-events-none z-50 transition-all duration-75"
              style={{ left: laserPointer.x - 12, top: laserPointer.y - 12, boxShadow: '0 0 12px 6px rgba(239, 68, 68, 0.6)' }}
            />
          )}

          {/* Full-fidelity slideshow canvas */}
          <div
            className="bg-white shadow-2xl relative select-none shrink-0 overflow-hidden border border-zinc-200"
            style={{ width: '90vw', maxWidth: '1700px', maxHeight: '84vh', aspectRatio: `${slideAspectRatio}` }}
          >
            <div ref={slideshowHostRef} className="pptx-fidelity-scope w-full h-full" />
          </div>

          {/* Presentation control floating bar */}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-zinc-800/90 border border-zinc-700 px-4 py-2 rounded-full flex items-center gap-4 text-xs shadow-lg z-50 backdrop-blur">
            <Button size="sm" variant="ghost" disabled={slideshowIndex <= 0} onClick={() => setSlideshowIndex(prev => Math.max(0, prev - 1))} className="text-zinc-300 hover:text-white h-7 w-7 p-0"><ChevronLeft className="h-4 w-4" /></Button>
            <span className="font-mono text-zinc-300 font-bold">Slide {slideshowIndex + 1} of {slides.length}</span>
            <Button size="sm" variant="ghost" disabled={slideshowIndex >= slides.length - 1} onClick={() => setSlideshowIndex(prev => Math.min(slides.length - 1, prev + 1))} className="text-zinc-300 hover:text-white h-7 w-7 p-0"><ChevronRight className="h-4 w-4" /></Button>
            <div className="w-px h-4 bg-zinc-700 mx-1" />
            <Button size="sm" variant="ghost" onClick={() => setInSlideshow(false)} className="text-red-400 hover:text-red-300 h-8 px-3 rounded-full flex items-center gap-1"><X className="h-4 w-4" />End Show</Button>
          </div>
        </div>
      )}

      {/* Footer Navigation Bar */}
      <div className="bg-[#b7472a] text-red-50 px-4 py-1.5 text-xs flex justify-between items-center h-9 font-medium shrink-0 shadow-inner">
        <div className="flex items-center gap-3">
          <Button size="sm" variant="ghost" className="h-6 px-2 text-red-200 hover:text-white hover:bg-red-800" disabled={slideIndex <= 0} onClick={() => { setSlideIndex(i => Math.max(0, i - 1)); setSelectedElement(null); }}><ChevronLeft className="h-3.5 w-3.5" /></Button>
          <span className="font-mono font-bold">Slide {slideIndex + 1} / {slides.length}</span>
          <Button size="sm" variant="ghost" className="h-6 px-2 text-red-200 hover:text-white hover:bg-red-800" disabled={slideIndex >= slides.length - 1} onClick={() => { setSlideIndex(i => Math.min(slides.length - 1, i + 1)); setSelectedElement(null); }}><ChevronRight className="h-3.5 w-3.5" /></Button>
        </div>
        <div className="flex items-center gap-4 font-mono text-[11px]">
          {/* Zoom controls */}
          <div className="flex items-center gap-1 bg-red-800/40 px-2 py-0.5 rounded border border-red-700/50 mr-2">
            <Button
              size="icon"
              variant="ghost"
              className="h-5 w-5 text-red-200 hover:text-white hover:bg-red-800"
              onClick={() => setZoom(z => Math.max(50, z - 10))}
              title="Zoom Out"
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </Button>
            <span className="min-w-[32px] text-center font-bold text-red-100">{zoom}%</span>
            <Button
              size="icon"
              variant="ghost"
              className="h-5 w-5 text-red-200 hover:text-white hover:bg-red-800"
              onClick={() => setZoom(z => Math.min(200, z + 10))}
              title="Zoom In"
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-5 px-1.5 text-[10px] text-red-300 hover:text-white hover:bg-red-800 font-sans"
              onClick={() => setZoom(100)}
            >
              Reset
            </Button>
          </div>

          <span>{currentSlide?.elements.length ?? 0} visual components</span>
          {isDirty && <span className="text-red-200 animate-pulse font-bold">• Unsaved changes</span>}
        </div>
      </div>
    </div>
  );
}
