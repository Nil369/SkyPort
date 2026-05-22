import { useRef, useState, useEffect, useCallback } from 'react';
import mammoth from 'mammoth';
import JSZip from 'jszip';
import { renderAsync as renderDocxAsync } from 'docx-preview';
import { asBlob } from 'html-docx-js-typescript';
import { Button } from '@/components/ui/button';
import {
  Bold, Italic, Underline, Strikethrough, AlignLeft, AlignCenter, AlignRight, AlignJustify,
  List, ListOrdered, Undo2, Redo2, Type, Heading1, Heading2, Heading3,
  Download, Save, Maximize2, Minimize2, Palette, Minus, Plus, Link2,
  Table, Settings, RefreshCw, Printer, Subscript, Superscript
} from 'lucide-react';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';
import { platformApi } from '@/features/platform/api';

interface DocxPreviewAndEditorProps {
  url: string;
  path: string;
  onDownload: () => void;
  setLoading: (v: boolean) => void;
  setError: (v: string | null) => void;
}

// Standards based on 96 DPI
const PAGE_SIZES = {
  A4: { name: 'A4', w: '8.27in', h: '11.69in', label: 'A4 (210 x 297 mm)' },
  A3: { name: 'A3', w: '11.69in', h: '16.54in', label: 'A3 (297 x 420 mm)' },
  A2: { name: 'A2', w: '16.54in', h: '23.39in', label: 'A2 (420 x 594 mm)' },
  A1: { name: 'A1', w: '23.39in', h: '33.11in', label: 'A1 (594 x 841 mm)' },
  A5: { name: 'A5', w: '5.83in', h: '8.27in', label: 'A5 (148 x 210 mm)' },
  B1: { name: 'B1', w: '27.83in', h: '39.37in', label: 'B1 (707 x 1000 mm)' },
  B2: { name: 'B2', w: '19.69in', h: '27.83in', label: 'B2 (500 x 707 mm)' },
  B3: { name: 'B3', w: '13.90in', h: '19.69in', label: 'B3 (353 x 500 mm)' },
  B4: { name: 'B4', w: '9.84in', h: '13.90in', label: 'B4 (250 x 353 mm)' },
  Letter: { name: 'Letter', w: '8.5in', h: '11in', label: 'Letter (8.5" x 11")' },
  Legal: { name: 'Legal', w: '8.5in', h: '14in', label: 'Legal (8.5" x 14")' }
};

const MARGIN_SIZES = {
  normal: { name: 'Normal', value: '1.0in', label: 'Normal (1" all sides)' },
  narrow: { name: 'Narrow', value: '0.5in', label: 'Narrow (0.5" all sides)' },
  moderate: { name: 'Moderate', value: '0.75in', label: 'Moderate (0.75" all sides)' },
  wide: { name: 'Wide', value: '1.5in', label: 'Wide (1.5" all sides)' }
};

const FONTS = [
  { name: 'Segoe UI', css: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif" },
  { name: 'Inter', css: "'Inter', sans-serif" },
  { name: 'Georgia', css: "Georgia, serif" },
  { name: 'Impact', css: "Impact, Charcoal, sans-serif" },
  { name: 'Courier New', css: "'Courier New', Courier, monospace" },
  { name: 'Times New Roman', css: "'Times New Roman', Times, serif" },
  { name: 'Comic Sans MS', css: "'Comic Sans MS', cursive" }
];

export function DocxPreviewAndEditor({ url, path, onDownload, setLoading, setError }: DocxPreviewAndEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const originalDocxBufferRef = useRef<ArrayBuffer | null>(null);
  const highFidelityRenderModeRef = useRef(false);
  const [isHighFidelity, setIsHighFidelity] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [savePending, setSavePending] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fontSize, setFontSize] = useState(16);
  const [wordCount, setWordCount] = useState(0);
  const [charCount, setCharCount] = useState(0);

  // Paging controls
  const [pageSize, setPageSize] = useState<keyof typeof PAGE_SIZES>('A4');
  const [margin, setMargin] = useState<keyof typeof MARGIN_SIZES>('normal');
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait');
  const [fontFamily, setFontFamily] = useState('Segoe UI');
  const [showConfig, setShowConfig] = useState(true);

  // Save As modal
  const [showSaveAsModal, setShowSaveAsModal] = useState(false);
  const [saveAsPath, setSaveAsPath] = useState('');
  const [reloadTrigger, setReloadTrigger] = useState(0);
  const [showTextColorPopover, setShowTextColorPopover] = useState(false);
  const [showHighlightPopover, setShowHighlightPopover] = useState(false);
  const [textColorValue, setTextColorValue] = useState('#000000');
  const [highlightColorValue, setHighlightColorValue] = useState('#ffff00');
  const [isParsing, setIsParsing] = useState(false);
  const [parseMessage, setParseMessage] = useState('Parsing document...');

  // Paginated pages state (Word-like pages)
  const [pages, setPages] = useState<string[] | null>(null);

  const extractDocumentBodyHtml = useCallback((rawHtml: string) => {
    if (!rawHtml) return '<p>&nbsp;</p>';
    try {
      const parsed = new DOMParser().parseFromString(rawHtml, 'text/html');
      const bodyHtml = parsed.body?.innerHTML?.trim();
      return bodyHtml && bodyHtml.length > 0 ? bodyHtml : rawHtml;
    } catch {
      return rawHtml;
    }
  }, []);

  // Try to extract embedded HTML/MHTML altChunk content from a .docx package
  const tryExtractAltChunkHtml = useCallback(async (arrayBuffer: ArrayBuffer): Promise<string | null> => {
    try {
      const zip = await JSZip.loadAsync(arrayBuffer);
      // Look for common locations for embedded HTML/MHT in OOXML packages
      const candidates: string[] = [];
      zip.forEach((relativePath) => {
        const lp = relativePath.toLowerCase();
        if (lp.endsWith('.mht') || lp.endsWith('.mhtml') || lp.endsWith('.html') || lp.endsWith('.htm')) candidates.push(relativePath);
        if (lp.startsWith('word/embeddings/') && (lp.endsWith('.mht') || lp.endsWith('.mhtml') || lp.endsWith('.html') || lp.endsWith('.htm'))) candidates.push(relativePath);
        if (lp.includes('altchunk') || lp.includes('afchunk')) candidates.push(relativePath);
      });

      // Prefer HTML-like candidates
      for (const p of candidates) {
        try {
          const txt = await zip.file(p)?.async('string');
          if (!txt) continue;
          // crude mhtml -> extract first <html ...>...</html>
          const htmlIdx = txt.toLowerCase().indexOf('<html');
          if (htmlIdx !== -1) {
            const html = txt.substring(htmlIdx);
            return html;
          }
          // fallback: if file is pure HTML
          if (/<!doctype html|<html/i.test(txt)) return txt;
        } catch (e) {
          // ignore candidate parse errors
        }
      }

      // Also check /word/document.xml for altChunk references pointing to parts
      const docXml = await zip.file('word/document.xml')?.async('string');
      if (docXml) {
        const altIds = Array.from(docXml.matchAll(/<w:altChunk[^>]*r:id="([^"]+)"/g)).map(m => m[1]);
        for (const id of altIds) {
          // find part by id in [Content_Types].xml / _rels
          // brute-force: scan entries for id string
          for (const entry of Object.keys(zip.files)) {
            if (entry.toLowerCase().includes(id.toLowerCase())) {
              try {
                const txt = await zip.file(entry)?.async('string');
                if (!txt) continue;
                const htmlIdx = txt.toLowerCase().indexOf('<html');
                if (htmlIdx !== -1) return txt.substring(htmlIdx);
                if (/<!doctype html|<html/i.test(txt)) return txt;
              } catch (e) {}
            }
          }
        }
      }

      // As a broader fallback, scan all files for embedded MHTML/HTML-like content
      for (const entry of Object.keys(zip.files)) {
        try {
          const txt = await zip.file(entry)?.async('string');
          if (!txt || typeof txt !== 'string') continue;
          if (/MIME-Version\s*:\s*1.0|multipart\/related|<html/i.test(txt)) {
            const idx = txt.toLowerCase().indexOf('<html');
            if (idx !== -1) return txt.substring(idx);
            return txt;
          }
        } catch (e) {
          // ignore
        }
      }

      return null;
    } catch (e) {
      return null;
    }
  }, []);

  // Parse an MHTML/MHT string and extract the text/html part and inline resources
  const parseMHTML = useCallback((mhtml: string) => {
    // decode quoted-printable sequences like =3D and soft line breaks before parsing
    const qpDecode = (s: string) => {
      try {
        // Remove soft line breaks =\n
        let out = s.replace(/=\r?\n/g, '');
        // Decode =XX hex sequences
        out = out.replace(/=([A-Fa-f0-9]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
        return out;
      } catch (e) { return s; }
    };

    // if content looks qp-encoded, decode first
    if (/=3D|=[0-9A-Fa-f]{2}/.test(mhtml)) {
      try { mhtml = qpDecode(mhtml); } catch {}
    }
    try {
      // Normalize HTML-escaped strings like &lt;html&gt; that may be embedded
      const unescapeHtml = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
      if (/&lt;html|&lt;!doctype/i.test(mhtml)) mhtml = unescapeHtml(mhtml);
      // Normalize newlines
      const raw = mhtml.replace(/\r\n/g, '\n');
      // Find boundary from Content-Type header
      const bMatch = raw.match(/boundary\s*=\s*"?([^";\n]+)"?/i);
      const boundary = bMatch ? bMatch[1].trim() : null;
      const parts: { headers: Record<string,string>, body: string }[] = [];
      if (!boundary) return { html: null, resources: new Map<string, { contentType: string, dataBase64: string }>() };
      const sep = `--${boundary}`;
      const rawParts = raw.split(sep).map(s => s.trim()).filter(s => s && s !== '--');
      for (const part of rawParts) {
        const idx = part.indexOf('\n\n');
        if (idx === -1) continue;
        const headerText = part.substring(0, idx).trim();
        const body = part.substring(idx + 2).trim();
        const headers: Record<string,string> = {};
        headerText.split('\n').forEach(line => {
          const m = line.match(/^([^:\s]+)\s*:\s*(.+)$/);
          if (m) headers[m[1].toLowerCase()] = m[2].trim();
        });
        parts.push({ headers, body });
      }

      let html: string | null = null;
      const resources = new Map<string, { contentType: string, dataBase64: string }>();
      for (const p of parts) {
        const ct = p.headers['content-type'] || '';
        const dispo = p.headers['content-transfer-encoding'] || '';
        const loc = p.headers['content-location'] || '';
        const cidRaw = p.headers['content-id'] || '';
        if (/text\/html/i.test(ct) && !html) {
          // body may be plain or base64 depending on encoding
          if (/base64/i.test(dispo)) {
            try { html = atob(p.body.replace(/\s+/g,'')); } catch { html = p.body; }
          } else {
            html = p.body;
          }
        } else if (/image\//i.test(ct) || /application\/octet-stream/i.test(ct)) {
          // image part
          let dataBase64 = p.body.replace(/\s+/g,'');
          if (!/^[A-Za-z0-9+/=]+$/.test(dataBase64)) {
            // might be quoted-printable or raw; fallback to body as-is
            // try to extract base64 chunk
            const b = dataBase64.match(/[A-Za-z0-9+/=\s]{100,}/);
            dataBase64 = b ? b[0].replace(/\s+/g,'') : dataBase64;
          }
          const key = cidRaw || loc || `part-${resources.size}`;
          resources.set(key.replace(/[<>]/g,''), { contentType: ct.split(';')[0].trim(), dataBase64 });
        }
      }

      return { html, resources };
    } catch (e) {
      return { html: null, resources: new Map() };
    }
  }, []);

  // Replace cid: or content-location references in HTML with data URLs from resource map
  const applyResourcesToHtml = useCallback((html: string, resources: Map<string,{contentType:string,dataBase64:string}>) => {
    try {
      let out = html;
      resources.forEach((v, k) => {
        const rawKey = k.replace(/[<>]/g, '');
        const dataUrl = `data:${v.contentType};base64,${v.dataBase64}`;
        // normalized forms to match HTML references
        const variants = new Set<string>();
        variants.add(rawKey);
        // strip file:// and file:/// prefixes
        variants.add(rawKey.replace(/^file:\/\//i, ''));
        variants.add(rawKey.replace(/^file:\/\//i, '').replace(/^\//, ''));
        // also add basename
        const base = rawKey.split(/[\\/]/).pop() || rawKey;
        variants.add(base);
        // also add URL-encoded variants
        try { variants.add(encodeURI(rawKey)); variants.add(encodeURIComponent(rawKey)); } catch {}

        variants.forEach((variant) => {
          const esc = variant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          // src="..."
          out = out.replace(new RegExp(`src=\"(?:cid:)?${esc}\"`, 'gi'), `src=\"${dataUrl}\"`);
          out = out.replace(new RegExp(`src=\'(?:cid:)?${esc}\'`, 'gi'), `src=\'${dataUrl}\'`);
          // src= without quotes
          out = out.replace(new RegExp(`src=(?:cid:)?${esc}`, 'gi'), `src=${dataUrl}`);
          // data attributes or background-image urls
          out = out.replace(new RegExp(`url\(\"?(?:cid:)?${esc}\"?\)`, 'gi'), `url(${dataUrl})`);
        });
      });
      return out;
    } catch { return html; }
  }, []);

  // Inline images that live inside the .docx package into the HTML as data URLs
  const inlineDocxImages = useCallback(async (arrayBuffer: ArrayBuffer, html: string) => {
    try {
      const zip = await JSZip.loadAsync(arrayBuffer);
      // find all <img src="..."> occurrences
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const imgs = Array.from(doc.getElementsByTagName('img')) as HTMLImageElement[];
      for (const img of imgs) {
        const src = img.getAttribute('src') || '';
        // normalize paths
        let candidate = src.replace(/^\.\//, '').replace(/^\//, '').replace(/^\w+:\/\//, '');
        // decode URI components if present
        try { candidate = decodeURIComponent(candidate); } catch {}
        if (!candidate) continue;
        // some src values are like 'word/media/image1.png' or 'media/image1.png'
        const basename = candidate.split('/').pop() || candidate;
        const possiblePaths = [candidate, `word/${candidate}`, `word/media/${candidate}`, `media/${candidate}`, basename, `word/media/${basename}`];
        let found = null as string | null;
        for (const p of possiblePaths) {
          const file = zip.file(p);
          if (file) {
            const blob = await file.async('uint8array');
            // try to detect mime type by extension
            const match = p.match(/\.([a-z0-9]+)$/i);
            const ext = match ? match[1].toLowerCase() : 'png';
            let mime = 'image/png';
            if (ext === 'jpg' || ext === 'jpeg') mime = 'image/jpeg';
            else if (ext === 'gif') mime = 'image/gif';
            else if (ext === 'svg') mime = 'image/svg+xml';
            const base64 = btoa(String.fromCharCode(...Array.from(blob)));
            found = `data:${mime};base64,${base64}`;
            break;
          }
        }
        // If not found by path, try to match by filename suffix across the zip
        if (!found) {
          const base = candidate.split('/').pop() || candidate;
          for (const entry of Object.keys(zip.files)) {
            if (entry.toLowerCase().endsWith(base.toLowerCase())) {
              try {
                const file = zip.file(entry);
                if (!file) continue;
                const blob = await file.async('uint8array');
                const match = entry.match(/\.([a-z0-9]+)$/i);
                const ext = match ? match[1].toLowerCase() : 'png';
                let mime = 'image/png';
                if (ext === 'jpg' || ext === 'jpeg') mime = 'image/jpeg';
                else if (ext === 'gif') mime = 'image/gif';
                else if (ext === 'svg') mime = 'image/svg+xml';
                const base64 = btoa(String.fromCharCode(...Array.from(blob)));
                found = `data:${mime};base64,${base64}`;
                break;
              } catch (e) {}
            }
          }
        }
        if (found) img.setAttribute('src', found);
      }
      return doc.documentElement.innerHTML;
    } catch (e) {
      return html;
    }
  }, []);

  // Render .docx with docx-preview into HTML string (offscreen) and inline images
  const renderDocxPreviewToHtml = useCallback(async (arrayBuffer: ArrayBuffer) => {
    const tmp = document.createElement('div');
    try {
      await renderDocxAsync(arrayBuffer, tmp, undefined, { className: 'docx-render', inWrapper: true } as any);
      let html = tmp.innerHTML;
      // Inline images found in the zip into data URLs
      html = await inlineDocxImages(arrayBuffer, html);
      return html;
    } finally {
      // clean up
      tmp.innerHTML = '';
    }
  }, [inlineDocxImages]);

  const updateCounts = useCallback(() => {
    if (pages && pages.length > 0) {
      const combined = pages.join('\n').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      setCharCount(combined.length);
      setWordCount(combined ? combined.split(/\s+/).length : 0);
      return;
    }
    if (!editorRef.current) return;
    const text = editorRef.current.innerText || '';
    setCharCount(text.length);
    setWordCount(text.trim() ? text.trim().split(/\s+/).length : 0);
  }, []);

  // Paginate HTML string into page-sized HTML chunks.
  const paginateContent = useCallback(async (html: string, pageW: string, pageH: string, marginValue: string, fs: number, ff: string) => {
    try {
      // Create offscreen measurement container
      const meas = document.createElement('div');
      meas.style.position = 'absolute';
      meas.style.left = '-9999px';
      meas.style.top = '0';
      meas.style.width = pageW;
      meas.style.padding = marginValue;
      meas.style.boxSizing = 'border-box';
      meas.style.visibility = 'hidden';
      meas.style.fontSize = `${fs}px`;
      meas.style.fontFamily = FONTS.find(f => f.name === ff)?.css || "'Segoe UI', sans-serif";
      document.body.appendChild(meas);

      const wrapper = document.createElement('div');
      wrapper.innerHTML = html;
      const children = Array.from(wrapper.childNodes) as Node[];

      // Approximate page inner height in pixels (1in = 96px)
      const pageHpx = parseFloat(pageH) * 96;
      const marginPx = parseFloat(marginValue) * 96;
      const pageInnerHeight = pageHpx - marginPx * 2;

      const pagesOut: string[] = [];
      let current = document.createElement('div');
      current.style.width = '100%';
      current.style.boxSizing = 'border-box';
      meas.appendChild(current);

      for (const child of children) {
        current.appendChild(child.cloneNode(true));
        const h = current.scrollHeight || current.offsetHeight;
        if (h > pageInnerHeight && current.childNodes.length > 1) {
          // remove last, finalize page
          current.removeChild(current.lastChild!);
          pagesOut.push(current.innerHTML);
          // new page
          current = document.createElement('div');
          current.style.width = '100%';
          current.style.boxSizing = 'border-box';
          meas.innerHTML = '';
          meas.appendChild(current);
          current.appendChild(child.cloneNode(true));
        }
      }
      if (current.childNodes.length > 0) pagesOut.push(current.innerHTML);
      document.body.removeChild(meas);
      return pagesOut.length > 0 ? pagesOut : [html];
    } catch (e) {
      return [html];
    }
  }, [FONTS]);

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

  const writeArrayBufferToPath = async (targetPath: string, arrayBuffer: ArrayBuffer) => {
    const base64data = arrayBufferToBase64(arrayBuffer);
    await platformApi.writeFile(targetPath, base64data, 'base64');
  };

  const extractVisibleText = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

  // Load document fully client-side so server doesn't need LibreOffice.
  useEffect(() => {
    let cancelled = false;
    setIsDirty(false);
    (async () => {
      try {
        setLoading(true);
        setIsParsing(true);
        setParseMessage('Downloading DOCX...');
        const fetchUrl = url + (url.includes('?') ? '&' : '?') + 'cb=' + Date.now() + '_' + reloadTrigger;
        const response = await fetch(fetchUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch file: ${response.statusText}`);
        }
        setParseMessage('Parsing DOCX structure...');
        const arrayBuffer = await response.arrayBuffer();
        originalDocxBufferRef.current = arrayBuffer.slice(0);
        // Use mammoth with inline image conversion when possible so images are data URLs
        const mammothOptions: any = {
          convertImage: (mammoth as any).images && (mammoth as any).images.inline
            ? (mammoth as any).images.inline((element: any) => {
                return element.read('base64').then((imageData: string) => ({
                  src: `data:${element.contentType};base64,${imageData}`
                }));
              })
            : undefined
        };
        const result = await mammoth.convertToHtml({ arrayBuffer }, mammothOptions);
        if (cancelled) return;
        if (editorRef.current) {
          const rawMammothHtml = result.value || '';
          const mammothText = extractVisibleText(rawMammothHtml);
          let mammothHtml = extractDocumentBodyHtml(rawMammothHtml);
          // If mammoth returned an MHTML block, try to parse HTML and resources from it
          if (/mhtDocumentPart|multipart\/related|MIME-Version\s*:/i.test(rawMammothHtml)) {
            // Try to extract the MHTML segment — mammoth sometimes returns an entire MHTML blob
            let mhtmlText = rawMammothHtml;
            // Find common markers where MHTML begins
            const mhtmlMarkers = ['MIME-Version:', '-----=3DmhtDocumentPart', 'Content-Location:'];
            let startIdx = -1;
            for (const mk of mhtmlMarkers) {
              const i = rawMammothHtml.indexOf(mk);
              if (i !== -1) { startIdx = i; break; }
            }
            if (startIdx !== -1) mhtmlText = rawMammothHtml.substring(startIdx);

            const parsed = parseMHTML(mhtmlText);
            if (parsed.html) {
              // apply resources if any
              const applied = applyResourcesToHtml(parsed.html, parsed.resources);
              mammothHtml = applied;
            }
          }
          const looksLikeMhtmlAltChunk = /MIME-Version\s*:/i.test(mammothText) || /mhtDocumentPart/i.test(mammothText) || /multipart\/related/i.test(mammothText) || /Content-Location\s*:/i.test(mammothText) || /MIME-Version\s*:/i.test(rawMammothHtml) || /multipart\/related/i.test(rawMammothHtml);

          if (mammothText.length < 12 || looksLikeMhtmlAltChunk) {
            // First try extracting embedded altChunk HTML from the .docx package so user can edit it.
            setParseMessage('Attempting to extract embedded HTML from DOCX...');
            const altHtml = await tryExtractAltChunkHtml(arrayBuffer);
            if (altHtml) {
              const inlined = await inlineDocxImages(arrayBuffer, extractDocumentBodyHtml(altHtml) || '<p>&nbsp;</p>');
              const pagesArr = await paginateContent(inlined, finalWidth, finalHeight, currentMargin.value, fontSize, fontFamily);
              setPages(pagesArr);
              setIsHighFidelity(false);
            } else {
              // Complex DOCX often degrades in mammoth; render with docx-preview into HTML and paginate
              try {
                setParseMessage('Rendering with docx-preview fallback...');
                const dpHtml = await renderDocxPreviewToHtml(arrayBuffer);
                const pagesArr = await paginateContent(dpHtml, finalWidth, finalHeight, currentMargin.value, fontSize, fontFamily);
                setPages(pagesArr);
                highFidelityRenderModeRef.current = false;
                setIsHighFidelity(false);
              } catch (e) {
                // last resort: fallback to mammoth-inlined HTML
                const inlined = await inlineDocxImages(arrayBuffer, mammothHtml || '<p>&nbsp;</p>');
                const pagesArr = await paginateContent(inlined, finalWidth, finalHeight, currentMargin.value, fontSize, fontFamily);
                setPages(pagesArr);
                setIsHighFidelity(false);
              }
            }
          } else {
            const inlinedMammoth = await inlineDocxImages(arrayBuffer, mammothHtml || '<p>&nbsp;</p>');
            const pagesArr = await paginateContent(inlinedMammoth, finalWidth, finalHeight, currentMargin.value, fontSize, fontFamily);
            setPages(pagesArr);
            highFidelityRenderModeRef.current = false;
            setIsHighFidelity(false);
          }

          updateCounts();
        }
        setError(null);
        setLoading(false);
        setIsParsing(false);
      } catch (e: any) {
        if (cancelled) return;
        console.error('Client-side DOCX render failed:', e);
        setError(e?.message || 'Failed to load Word document preview.');
        setLoading(false);
        setIsParsing(false);
      }
    })();
    return () => { cancelled = true; };
  }, [path, url, reloadTrigger, setLoading, setError, extractDocumentBodyHtml, updateCounts]);

  const execCmd = (cmd: string, value?: string) => {
    document.execCommand(cmd, false, value);
    editorRef.current?.focus();
    setIsDirty(true);
  };

  const applyInlineStyleToSelection = (styles: Record<string, string>) => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (range.collapsed) return;
    const span = document.createElement('span');
    for (const k of Object.keys(styles)) span.style.setProperty(k, styles[k]);
    try {
      range.surroundContents(span);
      setIsDirty(true);
    } catch (e) {
      // fallback: execCommand as last resort
      if (styles.color) document.execCommand('foreColor', false, styles.color);
      if (styles.backgroundColor) document.execCommand('hiliteColor', false, styles.backgroundColor);
    }
  };

  const applyForeColor = (color: string) => applyInlineStyleToSelection({ color });
  const applyHighlight = (color: string) => applyInlineStyleToSelection({ backgroundColor: color });

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

  /** Build a DOCX blob from current editor content (pure client-side) */
  const buildDocxBlob = async (): Promise<Blob> => {
    // prefer paginated pages content when available
    let htmlContent = '';
    if (pages && pages.length > 0) {
      htmlContent = pages.map(p => `<div>${p}</div>`).join('<div style="page-break-after:always"></div>');
    } else {
      if (!editorRef.current) throw new Error('Editor not ready');
      htmlContent = editorRef.current.innerHTML;
    }
    const fontCss = FONTS.find(f => f.name === fontFamily)?.css || "'Segoe UI', sans-serif";
    const fullHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:${fontCss};font-size:${fontSize}px;line-height:1.6;color:#1a1a1a;margin:0;padding:0}table{width:100%;border-collapse:collapse}td,th{border:1px solid #d1d5db;padding:8px}</style></head><body>${htmlContent}</body></html>`;
    const blob = await asBlob(fullHtml, {
      orientation: orientation as any,
      margins: { top: 720, right: 1440, bottom: 720, left: 1440 }
    });
    return blob as Blob;
  };

  /** Save to a specific server path */
  const saveToPath = async (targetPath: string): Promise<void> => {
    if (!isDirty && originalDocxBufferRef.current) {
      await writeArrayBufferToPath(targetPath, originalDocxBufferRef.current);
      return;
    }
    if (highFidelityRenderModeRef.current && originalDocxBufferRef.current) {
      await writeArrayBufferToPath(targetPath, originalDocxBufferRef.current);
      return;
    }
    const blob = await buildDocxBlob();
    const ab = await blob.arrayBuffer();
    const base64data = arrayBufferToBase64(ab);
    await platformApi.writeFile(targetPath, base64data, 'base64');
  };

  /** Overwrite the original file (Ctrl+S / Save) */
  const handleSave = async () => {
    if (!editorRef.current) return;
    setSavePending(true);
    const filename = path.replace(/^.*[\\/]/, '');
    try {
      await saveToPath(path);
      setIsDirty(false);
      toast.success(`Saved to ${filename}`);
    } catch (e: any) {
      console.error('Save failed:', e);
      toast.error(e?.response?.data?.error?.message ?? 'Failed to save document');
    } finally {
      setSavePending(false);
    }
  };

  /** Save As — open modal then write to chosen path */
  const openSaveAs = () => {
    // Pre-fill with folder of current file + original filename
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
      toast.success(`Saved as ${target.replace(/^.*[\\/]/, '')}`);
    } catch (e: any) {
      console.error('Save As failed:', e);
      toast.error(e?.response?.data?.error?.message ?? 'Failed to save document');
    } finally {
      setSavePending(false);
    }
  };


  const insertLink = () => {
    const url = prompt('Enter URL:', 'https://');
    if (url) execCmd('createLink', url);
  };

  const insertTable = () => {
    const rows = prompt('Enter number of rows:', '3');
    const cols = prompt('Enter number of columns:', '3');
    if (!rows || !cols) return;
    const rCount = parseInt(rows);
    const cCount = parseInt(cols);
    if (isNaN(rCount) || isNaN(cCount)) return;

    let tableHtml = '<table style="width:100%; border-collapse: collapse; margin: 15px 0;"><tbody>';
    for (let r = 0; r < rCount; r++) {
      tableHtml += '<tr>';
      for (let c = 0; c < cCount; c++) {
        tableHtml += '<td style="border: 1px solid #d1d5db; padding: 8px;">&nbsp;</td>';
      }
      tableHtml += '</tr>';
    }
    tableHtml += '</tbody></table><p>&nbsp;</p>';
    execCmd('insertHTML', tableHtml);
  };

  const changeFontSize = (delta: number) => {
    const next = Math.max(10, Math.min(48, fontSize + delta));
    setFontSize(next);
    if (editorRef.current) editorRef.current.style.fontSize = `${next}px`;
  };

  const setHeading = (tag: string) => {
    execCmd('formatBlock', tag);
  };

  const setLineSpacing = (spacing: string) => {
    if (editorRef.current) {
      editorRef.current.style.lineHeight = spacing;
      setIsDirty(true);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const currentSize = PAGE_SIZES[pageSize];
  const currentMargin = MARGIN_SIZES[margin];
  const finalWidth = orientation === 'portrait' ? currentSize.w : currentSize.h;
  const finalHeight = orientation === 'portrait' ? currentSize.h : currentSize.w;

  return (
    <div ref={containerRef} className={cn('flex h-full flex-col bg-zinc-100 text-zinc-800 font-sans select-none', isFullscreen && 'fixed inset-0 z-50')}>

      {/* Save As Modal */}
      {showSaveAsModal && (
        <div className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl border border-zinc-200 w-full max-w-md p-6">
            <h3 className="text-base font-bold text-zinc-800 mb-1 flex items-center gap-2">
              <Save className="h-4 w-4 text-[#2b579a]" /> Save As
            </h3>
            <p className="text-xs text-zinc-500 mb-4">Enter the full server path where you'd like to save this document.</p>
            <label className="text-xs font-semibold text-zinc-600 block mb-1">Destination Path (server)</label>
            <input
              type="text"
              value={saveAsPath}
              onChange={e => setSaveAsPath(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSaveAs(); if (e.key === 'Escape') setShowSaveAsModal(false); }}
              autoFocus
              className="w-full px-3 py-2 text-sm border border-zinc-300 rounded-lg mb-4 outline-none focus:border-[#2b579a] focus:ring-2 focus:ring-[#2b579a]/20 font-mono"
              placeholder="e.g. /home/user/documents/report.docx"
            />
            <div className="text-[11px] text-zinc-400 mb-4 bg-zinc-50 rounded-lg p-3 border border-zinc-200 space-y-0.5">
              <p>• <b>Windows:</b> <code>C:/Users/you/Desktop/doc.docx</code></p>
              <p>• <b>Linux / Mac:</b> <code>/home/you/Documents/doc.docx</code></p>
              <p>• File will be created if it doesn't exist.</p>
            </div>
            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="outline" onClick={() => setShowSaveAsModal(false)}>Cancel</Button>
              <Button size="sm" onClick={handleSaveAs} disabled={savePending || !saveAsPath.trim()} className="bg-[#2b579a] hover:bg-[#1e3f7a] text-white">
                <Save className="h-3.5 w-3.5 mr-1.5" />{savePending ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="bg-[#2b579a] text-white px-4 py-2 flex items-center justify-between shrink-0 shadow-md">
        <div className="flex items-center gap-3">
          <div className="bg-white text-[#2b579a] font-black text-sm h-7 w-7 flex items-center justify-center rounded shadow">W</div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm tracking-wide">Docs Studio</span>
              <span className="bg-blue-800/60 text-[9px] px-1.5 py-0.5 rounded uppercase tracking-wider font-semibold text-blue-200">Pro Editor</span>
            </div>
            <div className="text-[10px] text-blue-100 font-mono truncate max-w-sm">{path.split('/').pop()}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isDirty && <span className="text-xs bg-amber-600/60 px-2 py-0.5 rounded text-amber-100 animate-pulse mr-2">Unsaved changes</span>}

          {/* Save group - like MS Office */}
          <div className="flex items-center bg-white/10 rounded-lg overflow-hidden border border-white/20">
            <Button
              size="sm" variant="ghost"
              onClick={handleSave}
              disabled={savePending}
              className="h-8 text-white hover:bg-blue-800 rounded-none border-r border-white/20 px-3"
              title="Save (overwrite current file)"
            >
              <Save className="h-4 w-4 mr-1.5" />{savePending ? 'Saving…' : 'Save'}
            </Button>
            <Button
              size="sm" variant="ghost"
              onClick={openSaveAs}
              disabled={savePending}
              className="h-8 text-white hover:bg-blue-800 rounded-none text-xs px-2.5"
              title="Save As — choose destination path"
            >
              Save As…
            </Button>
          </div>

          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setReloadTrigger(prev => prev + 1);
              toast.success('Reloading document...');
            }}
            className="h-8 text-white hover:bg-blue-800 hover:text-white"
            title="Reload from server"
          >
            <RefreshCw className="h-4 w-4 mr-1.5" />Reload
          </Button>

          <Button size="sm" variant="ghost" onClick={onDownload} className="h-8 text-white hover:bg-blue-800 hover:text-white">
            <Download className="h-4 w-4 mr-1.5" />Download
          </Button>
          <Button size="sm" variant="ghost" onClick={handlePrint} className="h-8 text-white hover:bg-blue-800 hover:text-white" title="Print document">
            <Printer className="h-4 w-4 mr-1.5" />Print
          </Button>
          <Button size="icon" variant="ghost" onClick={toggleFullscreen} className="h-8 w-8 text-white hover:bg-blue-800 hover:text-white" title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Formatting Ribbon */}
      <div className="bg-white border-b border-zinc-200 shrink-0 shadow-sm z-10">
        <div className="px-4 py-2 flex items-center gap-1.5 flex-wrap overflow-visible">
          {/* Undo/Redo */}
          <div className="flex items-center gap-0.5 border-r border-zinc-200 pr-2 mr-1">
            <Button size="icon" variant="ghost" className="h-8 w-8 text-zinc-600 hover:bg-zinc-100" onClick={() => execCmd('undo')} title="Undo"><Undo2 className="h-4 w-4" /></Button>
            <Button size="icon" variant="ghost" className="h-8 w-8 text-zinc-600 hover:bg-zinc-100" onClick={() => execCmd('redo')} title="Redo"><Redo2 className="h-4 w-4" /></Button>
          </div>

          {/* Font Family selector */}
          <div className="flex items-center gap-1 border-r border-zinc-200 pr-2 mr-1">
            <select
              value={fontFamily}
              onChange={(e) => {
                setFontFamily(e.target.value);
                const selected = FONTS.find(f => f.name === e.target.value);
                if (selected && editorRef.current) {
                  editorRef.current.style.fontFamily = selected.css;
                  setIsDirty(true);
                }
              }}
              className="text-xs font-semibold bg-zinc-50 border border-zinc-200 rounded px-2.5 py-1 text-zinc-700 outline-none cursor-pointer"
            >
              {FONTS.map(f => (
                <option key={f.name} value={f.name}>{f.name}</option>
              ))}
            </select>
          </div>

          {/* Font Size */}
          <div className="flex items-center gap-1 border-r border-zinc-200 pr-2 mr-1">
            <Button size="icon" variant="ghost" className="h-7 w-7 text-zinc-600 hover:bg-zinc-100" onClick={() => changeFontSize(-2)}><Minus className="h-3 w-3" /></Button>
            <span className="text-xs font-mono min-w-8 text-center font-bold text-zinc-700">{fontSize}</span>
            <Button size="icon" variant="ghost" className="h-7 w-7 text-zinc-600 hover:bg-zinc-100" onClick={() => changeFontSize(2)}><Plus className="h-3 w-3" /></Button>
          </div>

          {/* Headings */}
          <div className="flex items-center gap-0.5 border-r border-zinc-200 pr-2 mr-1">
            <Button size="icon" variant="ghost" className="h-8 w-8 text-zinc-600 hover:bg-zinc-100" onClick={() => setHeading('h1')} title="Heading 1"><Heading1 className="h-4 w-4" /></Button>
            <Button size="icon" variant="ghost" className="h-8 w-8 text-zinc-600 hover:bg-zinc-100" onClick={() => setHeading('h2')} title="Heading 2"><Heading2 className="h-4 w-4" /></Button>
            <Button size="icon" variant="ghost" className="h-8 w-8 text-zinc-600 hover:bg-zinc-100" onClick={() => setHeading('h3')} title="Heading 3"><Heading3 className="h-4 w-4" /></Button>
            <Button size="icon" variant="ghost" className="h-8 w-8 text-zinc-600 hover:bg-zinc-100" onClick={() => setHeading('p')} title="Normal text"><Type className="h-4 w-4" /></Button>
          </div>

          {/* Text Formatting */}
          <div className="flex items-center gap-0.5 border-r border-zinc-200 pr-2 mr-1">
            <Button size="icon" variant="ghost" className="h-8 w-8 text-zinc-600 hover:bg-zinc-100" onClick={() => execCmd('bold')} title="Bold (Ctrl+B)"><Bold className="h-4 w-4" /></Button>
            <Button size="icon" variant="ghost" className="h-8 w-8 text-zinc-600 hover:bg-zinc-100" onClick={() => execCmd('italic')} title="Italic (Ctrl+I)"><Italic className="h-4 w-4" /></Button>
            <Button size="icon" variant="ghost" className="h-8 w-8 text-zinc-600 hover:bg-zinc-100" onClick={() => execCmd('underline')} title="Underline (Ctrl+U)"><Underline className="h-4 w-4" /></Button>
            <Button size="icon" variant="ghost" className="h-8 w-8 text-zinc-600 hover:bg-zinc-100" onClick={() => execCmd('strikeThrough')} title="Strikethrough"><Strikethrough className="h-4 w-4" /></Button>
            <Button size="icon" variant="ghost" className="h-8 w-8 text-zinc-600 hover:bg-zinc-100" onClick={() => execCmd('subscript')} title="Subscript"><Subscript className="h-4 w-4" /></Button>
            <Button size="icon" variant="ghost" className="h-8 w-8 text-zinc-600 hover:bg-zinc-100" onClick={() => execCmd('superscript')} title="Superscript"><Superscript className="h-4 w-4" /></Button>
          </div>

          {/* Line spacing controls */}
          <div className="flex items-center gap-1 border-r border-zinc-200 pr-2 mr-1">
            <select
              defaultValue="1.6"
              onChange={(e) => setLineSpacing(e.target.value)}
              className="text-xs bg-zinc-50 border border-zinc-200 rounded px-1.5 py-1 text-zinc-700 outline-none cursor-pointer"
              title="Line spacing"
            >
              <option value="1.0">Single (1.0)</option>
              <option value="1.15">1.15</option>
              <option value="1.5">1.5</option>
              <option value="2.0">Double (2.0)</option>
              <option value="3.0">Triple (3.0)</option>
            </select>
          </div>

          {/* Text Color */}
          <div className="flex items-center gap-2 border-r border-zinc-200 pr-2 mr-1">
            <div className="relative">
              <button onClick={() => setShowTextColorPopover(s => !s)} className="h-8 px-2 rounded flex items-center gap-2 border border-zinc-200 bg-white text-zinc-700" title="Text color">
                <Type className="h-4 w-4" />
                <span className="w-3 h-3 rounded" style={{ background: textColorValue, display: 'inline-block', border: '1px solid #ddd' }} />
              </button>
              {showTextColorPopover && (
                <div className="absolute top-9 left-0 bg-white border border-zinc-200 rounded shadow p-2 z-40">
                  <div className="flex gap-2 mb-2">
                    {['#000000','#333333','#7f1d1d','#b45309','#b7791f','#f59e0b','#16a34a','#06b6d4','#3b82f6','#7c3aed','#ffffff'].map(c => (
                      <button key={c} onClick={() => { setTextColorValue(c); applyForeColor(c); setShowTextColorPopover(false); }} className="w-6 h-6 rounded" style={{ background: c, border: '1px solid #ccc' }} />
                    ))}
                  </div>
                  <input type="color" value={textColorValue} onChange={(e) => { setTextColorValue(e.target.value); applyForeColor(e.target.value); }} className="w-full h-8" />
                </div>
              )}
            </div>

            <div className="relative">
              <button onClick={() => setShowHighlightPopover(s => !s)} className="h-8 px-2 rounded flex items-center gap-2 border border-zinc-200 bg-white text-zinc-700" title="Highlight color">
                <Palette className="h-4 w-4" />
                <span className="w-3 h-3 rounded" style={{ background: highlightColorValue, display: 'inline-block', border: '1px solid #ddd' }} />
              </button>
              {showHighlightPopover && (
                <div className="absolute top-9 left-0 bg-white border border-zinc-200 rounded shadow p-2 z-40">
                  <div className="flex gap-2 mb-2">
                    {['#ffff00','#ffb6c1','#fca5a5','#ffd699','#c7f9cc','#cfe9ff','#e0e7ff','#ffffff'].map(c => (
                      <button key={c} onClick={() => { setHighlightColorValue(c); applyHighlight(c); setShowHighlightPopover(false); }} className="w-6 h-6 rounded" style={{ background: c, border: '1px solid #ccc' }} />
                    ))}
                  </div>
                  <input type="color" value={highlightColorValue} onChange={(e) => { setHighlightColorValue(e.target.value); applyHighlight(e.target.value); }} className="w-full h-8" />
                </div>
              )}
            </div>
          </div>

          {/* Alignment */}
          <div className="flex items-center gap-0.5 border-r border-zinc-200 pr-2 mr-1">
            <Button size="icon" variant="ghost" className="h-8 w-8 text-zinc-600 hover:bg-zinc-100" onClick={() => execCmd('justifyLeft')} title="Align left"><AlignLeft className="h-4 w-4" /></Button>
            <Button size="icon" variant="ghost" className="h-8 w-8 text-zinc-600 hover:bg-zinc-100" onClick={() => execCmd('justifyCenter')} title="Align center"><AlignCenter className="h-4 w-4" /></Button>
            <Button size="icon" variant="ghost" className="h-8 w-8 text-zinc-600 hover:bg-zinc-100" onClick={() => execCmd('justifyRight')} title="Align right"><AlignRight className="h-4 w-4" /></Button>
            <Button size="icon" variant="ghost" className="h-8 w-8 text-zinc-600 hover:bg-zinc-100" onClick={() => execCmd('justifyFull')} title="Justify"><AlignJustify className="h-4 w-4" /></Button>
          </div>

          {/* Lists */}
          <div className="flex items-center gap-0.5 border-r border-zinc-200 pr-2 mr-1">
            <Button size="icon" variant="ghost" className="h-8 w-8 text-zinc-600 hover:bg-zinc-100" onClick={() => execCmd('insertUnorderedList')} title="Bullet list"><List className="h-4 w-4" /></Button>
            <Button size="icon" variant="ghost" className="h-8 w-8 text-zinc-600 hover:bg-zinc-100" onClick={() => execCmd('insertOrderedList')} title="Numbered list"><ListOrdered className="h-4 w-4" /></Button>
          </div>

          {/* Insert Tools */}
          <div className="flex items-center gap-0.5">
            <Button size="icon" variant="ghost" className="h-8 w-8 text-zinc-600 hover:bg-zinc-100" onClick={insertLink} title="Insert link"><Link2 className="h-4 w-4" /></Button>
            <Button size="icon" variant="ghost" className="h-8 w-8 text-zinc-600 hover:bg-zinc-100" onClick={insertTable} title="Insert Table"><Table className="h-4 w-4" /></Button>
            <Button size="icon" variant="ghost" className="h-8 w-8 text-zinc-600 hover:bg-zinc-100" onClick={() => execCmd('insertHorizontalRule')} title="Horizontal line"><Minus className="h-4 w-4" /></Button>
            <Button size="icon" variant="ghost" className="h-8 w-8 text-zinc-600 hover:bg-zinc-100" onClick={() => execCmd('removeFormat')} title="Clear formatting"><RefreshCw className="h-4 w-4" /></Button>
          </div>

          <div className="ml-auto">
            <Button size="sm" variant="outline" onClick={() => setShowConfig(!showConfig)} className={cn('h-8 text-xs flex items-center gap-1.5', showConfig && 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100')}>
              <Settings className="h-3.5 w-3.5" />Page Settings
            </Button>
          </div>
        </div>
      </div>

      {/* Main workspace area */}
      <div className="flex-1 flex overflow-hidden min-h-0 relative">
        {/* Left Page Configuration Sidebar */}
        {showConfig && (
          <div className="w-64 border-r border-zinc-200 bg-white overflow-y-auto p-4 shrink-0 flex flex-col gap-4 shadow-inner">
            <div>
              <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest block mb-2">Page Size</label>
              <div className="grid grid-cols-1 gap-1">
                {(Object.keys(PAGE_SIZES) as Array<keyof typeof PAGE_SIZES>).map((sizeKey) => {
                  const size = PAGE_SIZES[sizeKey];
                  return (
                    <button
                      key={sizeKey}
                      onClick={() => setPageSize(sizeKey)}
                      className={cn(
                        'w-full text-left px-3 py-2 text-xs rounded border transition-all flex flex-col justify-center',
                        pageSize === sizeKey
                          ? 'border-blue-600 bg-blue-50 text-blue-900 font-semibold'
                          : 'border-zinc-200 hover:bg-zinc-50 text-zinc-700'
                      )}
                    >
                      <span>{size.name}</span>
                      <span className="text-[10px] text-zinc-400 font-mono font-normal">{size.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <hr className="border-zinc-100" />

            <div>
              <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest block mb-2">Margins</label>
              <div className="grid grid-cols-1 gap-1">
                {(Object.keys(MARGIN_SIZES) as Array<keyof typeof MARGIN_SIZES>).map((marginKey) => {
                  const m = MARGIN_SIZES[marginKey];
                  return (
                    <button
                      key={marginKey}
                      onClick={() => setMargin(marginKey)}
                      className={cn(
                        'w-full text-left px-3 py-2 text-xs rounded border transition-all flex flex-col justify-center',
                        margin === marginKey
                          ? 'border-blue-600 bg-blue-50 text-blue-900 font-semibold'
                          : 'border-zinc-200 hover:bg-zinc-50 text-zinc-700'
                      )}
                    >
                      <span>{m.name}</span>
                      <span className="text-[10px] text-zinc-400 font-mono font-normal">{m.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <hr className="border-zinc-100" />

            <div>
              <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest block mb-2">Orientation</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setOrientation('portrait')}
                  className={cn(
                    'py-2 text-xs rounded border font-semibold text-center transition-all',
                    orientation === 'portrait' ? 'border-blue-600 bg-blue-50 text-blue-800' : 'border-zinc-200 hover:bg-zinc-50 text-zinc-600'
                  )}
                >
                  Portrait
                </button>
                <button
                  onClick={() => setOrientation('landscape')}
                  className={cn(
                    'py-2 text-xs rounded border font-semibold text-center transition-all',
                    orientation === 'landscape' ? 'border-blue-600 bg-blue-50 text-blue-800' : 'border-zinc-200 hover:bg-zinc-50 text-zinc-600'
                  )}
                >
                  Landscape
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Editor Page Container */}
        <div className="flex-1 overflow-auto bg-zinc-200/50 flex justify-center items-start py-8 px-8 min-h-0 relative">
          {pages && pages.length > 0 ? (
            <div className="flex flex-col gap-6">
              {pages.map((p, idx) => (
                <div
                  key={idx}
                  className="bg-white shadow-2xl border border-zinc-200 transition-all select-text shrink-0 print:border-none print:shadow-none print:m-0"
                  style={{ width: finalWidth, minHeight: finalHeight, padding: currentMargin.value, boxSizing: 'border-box' }}
                >
                  <div
                    contentEditable
                    suppressContentEditableWarning
                    className="outline-none min-h-full text-zinc-800 leading-relaxed docx-editor-content w-full"
                    style={{ fontSize: `${fontSize}px`, fontFamily: FONTS.find(f => f.name === fontFamily)?.css || "'Segoe UI', sans-serif", wordBreak: 'break-word' as const, overflowWrap: 'break-word' as const }}
                    dangerouslySetInnerHTML={{ __html: p }}
                    onInput={(e) => {
                      const html = (e.currentTarget as HTMLDivElement).innerHTML;
                      setPages(prev => { if (!prev) return [html]; const copy = [...prev]; copy[idx] = html; return copy; });
                      setIsDirty(true);
                      // update counts from combined content
                      const combined = pages ? pages.join('\n') : html;
                      setCharCount(combined.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().length);
                      setWordCount(combined.replace(/<[^>]*>/g, ' ').trim() ? combined.replace(/<[^>]*>/g, ' ').trim().split(/\s+/).length : 0);
                    }}
                    onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); handleSave(); } }}
                  />
                </div>
              ))}
            </div>
          ) : (
            <div
              className="bg-white shadow-2xl border border-zinc-200 transition-all flex flex-col select-text shrink-0 print:border-none print:shadow-none print:m-0"
              style={{
                width: finalWidth,
                minHeight: finalHeight,
                padding: currentMargin.value,
                boxSizing: 'border-box',
                overflowX: 'hidden' as const,
                overflowWrap: 'break-word' as const
              }}
            >
              <div
                ref={editorRef}
                contentEditable
                suppressContentEditableWarning
                className="outline-none min-h-full text-zinc-800 leading-relaxed docx-editor-content w-full"
                style={{
                  fontSize: `${fontSize}px`,
                  fontFamily: FONTS.find(f => f.name === fontFamily)?.css || "'Segoe UI', sans-serif",
                  wordBreak: 'break-word' as const,
                  overflowWrap: 'break-word' as const
                }}
                onInput={() => { setIsDirty(true); updateCounts(); }}
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); handleSave(); }
                }}
              />
            </div>
          )}

          {isParsing && (
            <div className="absolute inset-0 z-20 bg-zinc-900/35 backdrop-blur-[1px] flex items-center justify-center">
              <div className="bg-white/95 border border-zinc-200 rounded-xl shadow-2xl px-5 py-4 min-w-[280px]">
                <div className="flex items-center gap-3">
                  <div className="h-5 w-5 rounded-full border-2 border-blue-200 border-t-blue-600 animate-spin" />
                  <div>
                    <div className="text-sm font-semibold text-zinc-800">Loading DOCX</div>
                    <div className="text-xs text-zinc-500">{parseMessage}</div>
                  </div>
                </div>
              </div>
            </div>
          )}
          {/* If we rendered a high-fidelity read-only view, allow user to attempt an editable extraction */}
          {isHighFidelity && (
            <div className="absolute top-4 right-6 z-30">
              <button
                onClick={async () => {
                  try {
                    setParseMessage('Attempting to extract editable HTML...');
                    setIsParsing(true);
                    const buf = originalDocxBufferRef.current;
                    if (!buf) throw new Error('Original document not available');
                    const extracted = await tryExtractAltChunkHtml(buf);
                    if (!extracted) throw new Error('No editable HTML found inside DOCX');
                    if (editorRef.current) {
                      const extractedHtml = extractDocumentBodyHtml(extracted) || '<p>&nbsp;</p>';
                      const pagesArr = await paginateContent(extractedHtml, finalWidth, finalHeight, currentMargin.value, fontSize, fontFamily);
                      setPages(pagesArr);
                    }
                    highFidelityRenderModeRef.current = false;
                    setIsHighFidelity(false);
                    toast.success('Switched to editable view (extracted HTML)');
                  } catch (e: any) {
                    toast.error(e?.message || 'Could not extract editable content');
                  } finally { setIsParsing(false); }
                }}
                className="bg-white/95 border border-zinc-300 px-3 py-1 rounded text-sm shadow"
              >
                Edit (try extract HTML)
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Styled Headings, Lists, Tables and Images */}
      <style>{`
        .docx-editor-content h1 {
          font-size: 2.25rem !important;
          font-weight: 800 !important;
          margin-top: 1.5rem !important;
          margin-bottom: 0.75rem !important;
          color: #111827 !important;
          line-height: 1.25 !important;
        }
        .docx-editor-content h2 {
          font-size: 1.75rem !important;
          font-weight: 700 !important;
          margin-top: 1.25rem !important;
          margin-bottom: 0.5rem !important;
          color: #1f2937 !important;
          line-height: 1.3 !important;
        }
        .docx-editor-content h3 {
          font-size: 1.35rem !important;
          font-weight: 600 !important;
          margin-top: 1rem !important;
          margin-bottom: 0.5rem !important;
          color: #374151 !important;
        }
        .docx-editor-content p {
          margin-top: 0 !important;
          margin-bottom: 0.75rem !important;
          line-height: 1.75 !important;
          color: #374151 !important;
        }
        .docx-editor-content ul {
          list-style-type: disc !important;
          padding-left: 2rem !important;
          margin-bottom: 1rem !important;
          display: block !important;
        }
        .docx-editor-content ol {
          list-style-type: decimal !important;
          padding-left: 2rem !important;
          margin-bottom: 1rem !important;
          display: block !important;
        }
        .docx-editor-content li {
          margin-bottom: 0.25rem !important;
          line-height: 1.6 !important;
          display: list-item !important;
        }
        .docx-editor-content table {
          width: 100% !important;
          border-collapse: collapse !important;
          margin-top: 1.5rem !important;
          margin-bottom: 1.5rem !important;
        }
        .docx-editor-content th, .docx-editor-content td {
          border: 1px solid #d1d5db !important;
          padding: 0.75rem 1rem !important;
          text-align: left !important;
        }
        .docx-editor-content th {
          background-color: #f3f4f6 !important;
          font-weight: 600 !important;
        }
        .docx-editor-content img {
          max-width: 100% !important;
          height: auto !important;
          border-radius: 0.375rem !important;
          margin: 1.5rem 0 !important;
          box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1) !important;
        }
        @media print {
          body {
            background: white !important;
            color: black !important;
          }
          .shrink-0, .z-10, .w-64, .shadow-inner, select, button {
            display: none !important;
          }
          .flex-1 {
            overflow: visible !important;
            padding: 0 !important;
            background: none !important;
          }
          .bg-zinc-200\\/50 {
            background: none !important;
            padding: 0 !important;
          }
        }
      `}</style>

      {/* Status Bar */}
      <div className="bg-[#2b579a] text-blue-50 px-4 py-1.5 text-xs flex justify-between items-center h-8 font-medium shrink-0 shadow-inner">
        <div className="flex items-center gap-3">
          <span className="uppercase text-[10px] font-bold bg-blue-800 px-2 py-0.5 rounded tracking-widest">Editing</span>
          {isDirty && <span className="text-[10px] text-blue-200 font-bold animate-pulse">• Unsaved changes</span>}
        </div>
        <div className="flex items-center gap-4 text-[11px] font-mono">
          <span>Page Size: <strong className="text-white">{pageSize} ({orientation})</strong></span>
          <span>Words: <strong className="text-white">{wordCount}</strong></span>
          <span>Characters: <strong className="text-white">{charCount}</strong></span>
        </div>
      </div>
    </div>
  );
}
