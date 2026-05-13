import { useEffect, useRef, useState } from 'react';
import { Terminal as XTermTerminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
import { Button } from '@/components/ui/button';
import { Copy, Download, ZoomIn, ZoomOut } from 'lucide-react';
import toast from 'react-hot-toast';
import { useVPS } from '@/hooks/useVPS';
import { useTheme } from '@/components/theme-provider';
import type { VPSServer } from '@/components/VPSManagement/VPSList';

interface SSHTerminalProps {
  vpsId: string;
}

function vpsFromGetResponse(res: unknown): VPSServer | undefined {
  if (!res || typeof res !== 'object') return undefined;
  const o = res as Record<string, unknown>;
  const inner = o.data;
  if (inner && typeof inner === 'object' && 'id' in inner) {
    return inner as VPSServer;
  }
  if ('id' in o && typeof o.id === 'string') {
    return res as VPSServer;
  }
  return undefined;
}

export function SSHTerminal({ vpsId }: SSHTerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const terminalInstanceRef = useRef<XTermTerminal | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [fontSize, setFontSize] = useState(14);
  const [buffer, setBuffer] = useState<string>('');
  const { data: vpsResponse } = useVPS(vpsId);
  const vps = vpsFromGetResponse(vpsResponse);
  const { effectiveTheme } = useTheme();

  const getTerminalTheme = () => ({
    background: effectiveTheme === 'dark' ? '#0f172a' : '#ffffff',
    foreground: effectiveTheme === 'dark' ? '#e2e8f0' : '#1e293b',
    cursor: effectiveTheme === 'dark' ? '#64748b' : '#94a3b8',
    cursorAccent: effectiveTheme === 'dark' ? '#1e293b' : '#ffffff',
    black: '#000000',
    red: '#f87171',
    green: '#86efac',
    yellow: '#facc15',
    blue: '#60a5fa',
    magenta: '#e879f9',
    cyan: '#22d3ee',
    white: effectiveTheme === 'dark' ? '#ffffff' : '#000000',
    brightBlack: '#4b5563',
    brightRed: '#ff6b6b',
    brightGreen: '#51cf66',
    brightYellow: '#ffe066',
    brightBlue: '#4dabf7',
    brightMagenta: '#ff6b9d',
    brightCyan: '#20c997',
    brightWhite: '#ffffff',
  });

  useEffect(() => {
    if (!vps || !terminalRef.current) return;

    // Initialize terminal
    const term = new XTermTerminal({
      cursorBlink: true,
      cursorStyle: 'block',
      fontSize: fontSize,
      fontFamily: 'JetBrains Mono, Courier New, monospace',
      theme: getTerminalTheme(),
      scrollback: 1000,
      rows: 24,
      cols: 80,
    });

    terminalInstanceRef.current = term;

    // Fit addon
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    // Mount to DOM
    term.open(terminalRef.current);
    fitAddon.fit();

    // Handle window resize
    const handleResize = () => {
      if (fitAddon && terminalRef.current?.clientHeight) {
        try {
          fitAddon.fit();
        } catch (err) {
          console.error('Failed to fit terminal:', err);
        }
      }
    };

    window.addEventListener('resize', handleResize);

    // Initialize WebSocket connection
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/vps/${vps.id}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('VPS Terminal: WebSocket connected to', wsUrl);
      setIsConnected(true);
      term.write(`\r\n\x1b[38;2;34;197;94mConnected to ${vps.server_name} (${vps.ip_address})\x1b[0m\r\n`);
      term.write(`\x1b[38;2;148;163;184mPress Ctrl+D or type 'exit' to close terminal\x1b[0m\r\n\r\n`);
    };

    ws.onmessage = (event) => {
      if (event.data instanceof Blob) {
        const reader = new FileReader();
        reader.onload = () => {
          const text = reader.result as string;
          term.write(text);
          setBuffer((prev) => prev + text);
        };
        reader.readAsText(event.data);
      } else {
        term.write(event.data);
        setBuffer((prev) => prev + event.data);
      }
    };

    ws.onerror = (error) => {
      console.error('VPS Terminal: WebSocket error:', error);
      setIsConnected(false);
      term.write(`\r\n\x1b[38;2;239;68;68mConnection error\x1b[0m\r\n`);
      toast.error('Terminal connection error');
    };

    ws.onclose = () => {
      setIsConnected(false);
      term.write('\r\n\x1b[38;2;239;68;68mDisconnected\x1b[0m\r\n');
    };

    // Handle terminal input
    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: 'input',
            data: data,
            sessionId: vps.id,
          })
        );
      }
    });

    // Handle terminal resize
    term.onResize(({ cols, rows }) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: 'resize',
            width: cols,
            height: rows,
            sessionId: vps.id,
          })
        );
      }
    });

    return () => {
      window.removeEventListener('resize', handleResize);
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
      term.dispose();
    };
  }, [vps, fontSize, effectiveTheme]);

  const handleCopy = () => {
    const selection = terminalInstanceRef.current?.getSelection();
    if (selection) {
      navigator.clipboard.writeText(selection);
      toast.success('Copied to clipboard');
    }
  };

  const handleDownload = () => {
    const element = document.createElement('a');
    element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(buffer));
    element.setAttribute('download', `terminal-${vpsId}-${Date.now()}.txt`);
    element.style.display = 'none';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
    toast.success('Downloaded terminal output');
  };

  const handleZoom = (direction: 'in' | 'out') => {
    const newSize = direction === 'in' ? fontSize + 2 : Math.max(10, fontSize - 2);
    setFontSize(newSize);
  };

  return (
    <div className={`flex flex-col h-full rounded-lg border ${
      effectiveTheme === 'dark' ? 'bg-slate-950 border-slate-800' : 'bg-white border-slate-200'
    }`}>
      {/* Toolbar */}
      <div className={`flex items-center justify-between p-3 border-b ${
        effectiveTheme === 'dark' ? 'border-slate-800 bg-slate-900/50' : 'border-slate-200 bg-slate-50'
      }`}>
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}
          />
          <span className="text-sm text-slate-400">
            {isConnected ? 'Connected' : 'Disconnected'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => handleZoom('in')}
            disabled={fontSize >= 24}
          >
            <ZoomIn className="w-4 h-4" />
          </Button>
          <span className="text-sm text-slate-400 w-8 text-center">{fontSize}px</span>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => handleZoom('out')}
            disabled={fontSize <= 10}
          >
            <ZoomOut className="w-4 h-4" />
          </Button>

          <div className="w-px h-6 bg-slate-700" />

          <Button size="sm" variant="ghost" onClick={handleCopy} title="Copy selection">
            <Copy className="w-4 h-4" />
          </Button>
          <Button size="sm" variant="ghost" onClick={handleDownload} title="Download terminal output">
            <Download className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Terminal */}
      <div
        ref={terminalRef}
        className="flex-1 overflow-hidden p-4"
        style={{ backgroundColor: effectiveTheme === 'dark' ? '#0f172a' : '#ffffff' }}
      />
    </div>
  );
}
