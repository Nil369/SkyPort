import * as React from "react";
import * as XLSX from "xlsx";
import {
  Download,
  Save,
  Plus,
  Trash2,
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Calculator,
  Grid3X3,
  FileSpreadsheet,
  Maximize2,
  Minimize2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";
import { platformApi } from "@/features/platform/api";

type ExcelPreviewAndEditorProps = {
  url: string;
  path: string;
  onDownload: () => void;
  setLoading: (v: boolean) => void;
  setError: (v: string | null) => void;
};

type CellSelection = {
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
};

export function ExcelPreviewAndEditor({
  url,
  path,
  onDownload,
  setLoading,
  setError,
}: ExcelPreviewAndEditorProps) {
  const [workbook, setWorkbook] = React.useState<XLSX.WorkBook | null>(null);
  const [sheets, setSheets] = React.useState<Array<{ name: string; data: any[][] }>>([]);
  const [activeSheet, setActiveSheet] = React.useState(0);
  const [selectedCell, setSelectedCell] = React.useState<{ row: number; col: number }>({ row: 0, col: 0 });
  const [selectionRange, setSelectionRange] = React.useState<CellSelection>({ startRow: 0, startCol: 0, endRow: 0, endCol: 0 });
  const [isSelecting, setIsSelecting] = React.useState(false);
  const [editMode, setEditMode] = React.useState(false);
  const [editValue, setEditValue] = React.useState("");
  const [isDirty, setIsDirty] = React.useState(false);
  const [savePending, setSavePending] = React.useState(false);
  const [isFullscreen, setIsFullscreen] = React.useState(false);

  // Formatting state
  const [boldCells, setBoldCells] = React.useState<Record<string, boolean>>({});
  const [italicCells, setItalicCells] = React.useState<Record<string, boolean>>({});
  const [underlineCells, setUnderlineCells] = React.useState<Record<string, boolean>>({});
  const [alignCells, setAlignCells] = React.useState<Record<string, "left" | "center" | "right">>({});
  const [activeRibbonTab, setActiveRibbonTab] = React.useState<"home" | "insert" | "formulas">("home");

  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const gridContainerRef = React.useRef<HTMLDivElement | null>(null);
  const fullscreenRef = React.useRef<HTMLDivElement | null>(null);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      fullscreenRef.current?.requestFullscreen?.();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.();
      setIsFullscreen(false);
    }
  };

  React.useEffect(() => {
    const handleFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handleFsChange);
    return () => document.removeEventListener("fullscreenchange", handleFsChange);
  }, []);

  const deleteSheet = (idx: number) => {
    if (sheets.length <= 1) { toast.error("Cannot delete the only sheet"); return; }
    if (!confirm(`Delete sheet "${sheets[idx].name}"?`)) return;
    const updated = sheets.filter((_, i) => i !== idx);
    setSheets(updated);
    setActiveSheet(Math.min(activeSheet, updated.length - 1));
    setIsDirty(true);
    toast.success(`Deleted sheet: ${sheets[idx].name}`);
  };

  // Load Excel or CSV workbook
  React.useEffect(() => {
    setWorkbook(null);
    setSheets([]);
    setActiveSheet(0);
    setSelectedCell({ row: 0, col: 0 });
    setSelectionRange({ startRow: 0, startCol: 0, endRow: 0, endCol: 0 });
    setEditMode(false);
    setIsDirty(false);
    
    const loadWorkbook = async () => {
      try {
        setLoading(true);
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        
        const isCSV = path.toLowerCase().endsWith(".csv");
        let wb: XLSX.WorkBook;
        
        if (isCSV) {
          const text = new TextDecoder().decode(arrayBuffer);
          wb = XLSX.read(text, { type: "string" });
        } else {
          wb = XLSX.read(new Uint8Array(arrayBuffer), { type: "array" });
        }
        
        setWorkbook(wb);
        const sheetData = wb.SheetNames.map(name => {
          const ws = wb.Sheets[name];
          const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as any[][];
          
          // Pad rows and columns to create an initial grid size (e.g. 50x20)
          const paddedData = padGridData(data, 50, 20);
          return { name, data: paddedData };
        });

        setSheets(sheetData);
        setLoading(false);
      } catch (err) {
        console.error(err);
        setError("Failed to load spreadsheet file.");
        setLoading(false);
      }
    };

    loadWorkbook();
  }, [url, path, setLoading, setError]);

  const currentSheet = sheets[activeSheet];
  const currentData = currentSheet?.data ?? [];

  // Pad data rows and columns
  const padGridData = (data: any[][], minRows: number, minCols: number): any[][] => {
    const padded = data.map(row => [...row]);
    
    // Pad columns first
    let maxCols = minCols;
    padded.forEach(row => {
      if (row.length > maxCols) maxCols = row.length;
    });
    padded.forEach(row => {
      while (row.length < maxCols) {
        row.push("");
      }
    });

    // Pad rows
    while (padded.length < minRows) {
      padded.push(Array(maxCols).fill(""));
    }
    return padded;
  };

  // Helper to get Excel-style column label (A, B, C... Z, AA, AB...)
  const getColumnLabel = (index: number): string => {
    let label = "";
    let temp = index;
    while (temp >= 0) {
      label = String.fromCharCode((temp % 26) + 65) + label;
      temp = Math.floor(temp / 26) - 1;
    }
    return label;
  };

  const getCellId = (row: number, col: number) => {
    return `${getColumnLabel(col)}${row + 1}`;
  };

  const parseCellLabel = (label: string): [number, number] => {
    const colStr = label.replace(/[0-9]/g, "");
    const rowStr = label.replace(/[A-Z]/g, "");
    
    let col = 0;
    for (let i = 0; i < colStr.length; i++) {
      col = col * 26 + (colStr.charCodeAt(i) - 64);
    }
    col = col - 1; // 0-indexed
    const row = parseInt(rowStr, 10) - 1;
    return [col, row];
  };

  const parseCellRangeOrList = (expr: string): [number, number][] => {
    const parts = expr.split(",");
    const cells: [number, number][] = [];
    parts.forEach(part => {
      part = part.trim();
      if (part.includes(":")) {
        const [start, end] = part.split(":");
        const [cStart, rStart] = parseCellLabel(start);
        const [cEnd, rEnd] = parseCellLabel(end);
        
        const minR = Math.min(rStart, rEnd);
        const maxR = Math.max(rStart, rEnd);
        const minC = Math.min(cStart, cEnd);
        const maxC = Math.max(cStart, cEnd);
        
        for (let r = minR; r <= maxR; r++) {
          for (let c = minC; c <= maxC; c++) {
            cells.push([r, c]);
          }
        }
      } else {
        cells.push(parseCellLabel(part));
      }
    });
    return cells;
  };

  // Evaluate cell formula dynamically
  const evaluateCellFormula = React.useCallback((formula: string, data: any[][]): string => {
    if (typeof formula !== "string" || !formula.startsWith("=")) return formula;
    try {
      const expr = formula.substring(1).toUpperCase().trim();
      
      // SUM(A1:B3)
      if (expr.startsWith("SUM(") && expr.endsWith(")")) {
        const content = expr.substring(4, expr.length - 1);
        const cells = parseCellRangeOrList(content);
        let sum = 0;
        cells.forEach(([c, r]) => {
          const cellVal = data[r]?.[c];
          // If referencing another formula, evaluate it first
          const val = Number(evaluateCellFormula(cellVal, data) ?? 0);
          if (!isNaN(val)) sum += val;
        });
        return String(sum);
      }
      
      // AVERAGE(A1:B3)
      if (expr.startsWith("AVERAGE(") && expr.endsWith(")")) {
        const content = expr.substring(8, expr.length - 1);
        const cells = parseCellRangeOrList(content);
        let sum = 0;
        let count = 0;
        cells.forEach(([c, r]) => {
          const cellVal = data[r]?.[c];
          const val = Number(evaluateCellFormula(cellVal, data) ?? 0);
          if (!isNaN(val)) {
            sum += val;
            count++;
          }
        });
        return count > 0 ? String(Number((sum / count).toFixed(4))) : "0";
      }

      // COUNT(A1:B3)
      if (expr.startsWith("COUNT(") && expr.endsWith(")")) {
        const content = expr.substring(6, expr.length - 1);
        const cells = parseCellRangeOrList(content);
        let count = 0;
        cells.forEach(([c, r]) => {
          const cellVal = data[r]?.[c];
          const val = evaluateCellFormula(cellVal, data);
          if (val !== undefined && val !== null && val !== "") {
            count++;
          }
        });
        return String(count);
      }

      // MAX(A1:B3)
      if (expr.startsWith("MAX(") && expr.endsWith(")")) {
        const content = expr.substring(4, expr.length - 1);
        const cells = parseCellRangeOrList(content);
        let max = -Infinity;
        cells.forEach(([c, r]) => {
          const cellVal = data[r]?.[c];
          const val = Number(evaluateCellFormula(cellVal, data) ?? 0);
          if (!isNaN(val) && val > max) max = val;
        });
        return max === -Infinity ? "0" : String(max);
      }

      // MIN(A1:B3)
      if (expr.startsWith("MIN(") && expr.endsWith(")")) {
        const content = expr.substring(4, expr.length - 1);
        const cells = parseCellRangeOrList(content);
        let min = Infinity;
        cells.forEach(([c, r]) => {
          const cellVal = data[r]?.[c];
          const val = Number(evaluateCellFormula(cellVal, data) ?? 0);
          if (!isNaN(val) && val < min) min = val;
        });
        return min === Infinity ? "0" : String(min);
      }

      // Basic arithmetic evaluator (A1 + B2 * C3)
      let resolvedExpr = expr;
      const cellRefRegex = /[A-Z]+\d+/g;
      let match;
      const refs = new Set<string>();
      while ((match = cellRefRegex.exec(expr)) !== null) {
        refs.add(match[0]);
      }
      const sortedRefs = Array.from(refs).sort((a, b) => b.length - a.length);
      for (const ref of sortedRefs) {
        const [c, r] = parseCellLabel(ref);
        const rawCell = data[r]?.[c];
        const val = Number(evaluateCellFormula(rawCell, data) ?? 0);
        resolvedExpr = resolvedExpr.replace(new RegExp(ref, "g"), isNaN(val) ? "0" : String(val));
      }
      
      if (/^[0-9+\-*/().\s]+$/.test(resolvedExpr)) {
        // eslint-disable-next-line no-eval
        const result = eval(resolvedExpr);
        return String(Number(result.toFixed(4)));
      }
      return "#VALUE!";
    } catch (e) {
      return "#ERROR!";
    }
  }, []);

  const getCellDisplayValue = (rowIdx: number, colIdx: number): string => {
    const rawVal = currentData[rowIdx]?.[colIdx];
    if (rawVal === undefined || rawVal === null) return "";
    if (typeof rawVal === "string" && rawVal.startsWith("=")) {
      return evaluateCellFormula(rawVal, currentData);
    }
    return String(rawVal);
  };

  // Selection statistics (Sum, Count, Average)
  const stats = React.useMemo(() => {
    if (sheets.length === 0) return null;
    
    let sum = 0;
    let count = 0;
    let numericCount = 0;
    
    const minRow = Math.min(selectionRange.startRow, selectionRange.endRow);
    const maxRow = Math.max(selectionRange.startRow, selectionRange.endRow);
    const minCol = Math.min(selectionRange.startCol, selectionRange.endCol);
    const maxCol = Math.max(selectionRange.startCol, selectionRange.endCol);

    for (let r = minRow; r <= maxRow; r++) {
      for (let c = minCol; c <= maxCol; c++) {
        const valStr = getCellDisplayValue(r, c);
        if (valStr !== "") {
          count++;
          const valNum = Number(valStr);
          if (!isNaN(valNum)) {
            sum += valNum;
            numericCount++;
          }
        }
      }
    }

    if (count <= 1 || numericCount === 0) return null;
    return {
      sum: Number(sum.toFixed(4)),
      count,
      average: Number((sum / numericCount).toFixed(4)),
    };
  }, [selectionRange, currentData, sheets, getCellDisplayValue]);

  // Update cell data
  const updateCellValue = (row: number, col: number, value: any) => {
    const updatedSheets = sheets.map((sheet, index) => {
      if (index !== activeSheet) return sheet;
      const updatedData = sheet.data.map((r, rIdx) => {
        if (rIdx !== row) return r;
        return r.map((c, cIdx) => {
          if (cIdx !== col) return c;
          return value;
        });
      });
      return { ...sheet, data: updatedData };
    });
    setSheets(updatedSheets);
    setIsDirty(true);
  };

  const activeRawValue = currentData[selectedCell.row]?.[selectedCell.col] ?? "";

  // Enter edit mode
  const startEditing = (row: number, col: number) => {
    setSelectedCell({ row, col });
    setSelectionRange({ startRow: row, startCol: col, endRow: row, endCol: col });
    setEditMode(true);
    setEditValue(String(currentData[row]?.[col] ?? ""));
    setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 50);
  };

  // Exit & Save edit mode
  const stopEditing = (saveChanges = true) => {
    if (!editMode) return;
    if (saveChanges) {
      updateCellValue(selectedCell.row, selectedCell.col, editValue);
    }
    setEditMode(false);
  };

  // Save the entire workbook back to VPS
  const handleSave = async () => {
    if (!workbook || sheets.length === 0) return;
    setSavePending(true);
    try {
      // Rebuild workbook from react state sheets
      const newWb = XLSX.utils.book_new();
      sheets.forEach(sheet => {
        // Remove empty padding rows & cols at the end of the sheet data for clean saving
        let lastPopulatedRow = 0;
        let lastPopulatedCol = 0;
        sheet.data.forEach((row, rIdx) => {
          row.forEach((cell, cIdx) => {
            if (cell !== null && cell !== undefined && cell !== "") {
              if (rIdx > lastPopulatedRow) lastPopulatedRow = rIdx;
              if (cIdx > lastPopulatedCol) lastPopulatedCol = cIdx;
            }
          });
        });
        
        const cleanData = sheet.data.slice(0, lastPopulatedRow + 1).map(row => row.slice(0, lastPopulatedCol + 1));
        const ws = XLSX.utils.aoa_to_sheet(cleanData);
        XLSX.utils.book_append_sheet(newWb, ws, sheet.name);
      });

      const isCSV = path.toLowerCase().endsWith(".csv");
      let fileContentBase64 = "";

      if (isCSV) {
        const firstSheet = newWb.SheetNames[0];
        const csvContent = XLSX.utils.sheet_to_csv(newWb.Sheets[firstSheet]);
        // Encode CSV content to base64
        fileContentBase64 = btoa(unescape(encodeURIComponent(csvContent)));
      } else {
        const outputBytes = XLSX.write(newWb, { type: "array", bookType: "xlsx" });
        // Convert arrayBuffer to base64
        const binary = String.fromCharCode(...new Uint8Array(outputBytes));
        fileContentBase64 = btoa(binary);
      }

      await platformApi.writeFile(path, fileContentBase64, "base64");
      setIsDirty(false);
      toast.success("Spreadsheet saved successfully");
    } catch (e: any) {
      console.error(e);
      toast.error(e?.response?.data?.error?.message ?? "Failed to save spreadsheet");
    } finally {
      setSavePending(false);
    }
  };

  // Row and Column Insert/Delete
  const insertRow = (above: boolean) => {
    const targetIdx = selectedCell.row + (above ? 0 : 1);
    const numCols = currentData[0]?.length ?? 10;
    const newRow = Array(numCols).fill("");
    
    const updatedSheets = sheets.map((sheet, index) => {
      if (index !== activeSheet) return sheet;
      const updatedData = [...sheet.data];
      updatedData.splice(targetIdx, 0, newRow);
      return { ...sheet, data: updatedData };
    });
    setSheets(updatedSheets);
    setIsDirty(true);
    setSelectedCell(prev => ({ ...prev, row: targetIdx }));
    setSelectionRange(prev => ({ ...prev, startRow: targetIdx, endRow: targetIdx }));
    toast.success("Inserted 1 row");
  };

  const deleteRow = () => {
    if (currentData.length <= 1) return;
    const targetIdx = selectedCell.row;
    
    const updatedSheets = sheets.map((sheet, index) => {
      if (index !== activeSheet) return sheet;
      const updatedData = [...sheet.data];
      updatedData.splice(targetIdx, 1);
      return { ...sheet, data: updatedData };
    });
    setSheets(updatedSheets);
    setIsDirty(true);
    const nextRow = Math.max(0, targetIdx - 1);
    setSelectedCell(prev => ({ ...prev, row: nextRow }));
    setSelectionRange(prev => ({ ...prev, startRow: nextRow, endRow: nextRow }));
    toast.success("Deleted row " + (targetIdx + 1));
  };

  const insertColumn = (left: boolean) => {
    const targetIdx = selectedCell.col + (left ? 0 : 1);
    
    const updatedSheets = sheets.map((sheet, index) => {
      if (index !== activeSheet) return sheet;
      const updatedData = sheet.data.map(row => {
        const newRow = [...row];
        newRow.splice(targetIdx, 0, "");
        return newRow;
      });
      return { ...sheet, data: updatedData };
    });
    setSheets(updatedSheets);
    setIsDirty(true);
    setSelectedCell(prev => ({ ...prev, col: targetIdx }));
    setSelectionRange(prev => ({ ...prev, startCol: targetIdx, endCol: targetIdx }));
    toast.success("Inserted 1 column");
  };

  const deleteColumn = () => {
    const numCols = currentData[0]?.length ?? 10;
    if (numCols <= 1) return;
    const targetIdx = selectedCell.col;
    
    const updatedSheets = sheets.map((sheet, index) => {
      if (index !== activeSheet) return sheet;
      const updatedData = sheet.data.map(row => {
        const newRow = [...row];
        newRow.splice(targetIdx, 1);
        return newRow;
      });
      return { ...sheet, data: updatedData };
    });
    setSheets(updatedSheets);
    setIsDirty(true);
    const nextCol = Math.max(0, targetIdx - 1);
    setSelectedCell(prev => ({ ...prev, col: nextCol }));
    setSelectionRange(prev => ({ ...prev, startCol: nextCol, endCol: nextCol }));
    toast.success("Deleted column " + getColumnLabel(targetIdx));
  };

  const addNewSheet = () => {
    const newName = `Sheet${sheets.length + 1}`;
    const newGrid = padGridData([[""]], 50, 20);
    setSheets(prev => [...prev, { name: newName, data: newGrid }]);
    setActiveSheet(sheets.length);
    setSelectedCell({ row: 0, col: 0 });
    setSelectionRange({ startRow: 0, startCol: 0, endRow: 0, endCol: 0 });
    setIsDirty(true);
    toast.success(`Created sheet: ${newName}`);
  };

  // Keyboard navigation & Shortcuts
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      handleSave();
      return;
    }

    if (editMode) {
      if (e.key === "Enter") {
        e.preventDefault();
        stopEditing(true);
        // Move selection down
        const nextRow = Math.min(currentData.length - 1, selectedCell.row + 1);
        setSelectedCell(prev => ({ ...prev, row: nextRow }));
        setSelectionRange(prev => ({ ...prev, startRow: nextRow, endRow: nextRow }));
      } else if (e.key === "Escape") {
        e.preventDefault();
        stopEditing(false);
      }
      return;
    }

    // Normal mode navigation
    let nextRow = selectedCell.row;
    let nextCol = selectedCell.col;
    let moved = false;

    if (e.key === "ArrowUp") {
      e.preventDefault();
      nextRow = Math.max(0, selectedCell.row - 1);
      moved = true;
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      nextRow = Math.min(currentData.length - 1, selectedCell.row + 1);
      moved = true;
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      nextCol = Math.max(0, selectedCell.col - 1);
      moved = true;
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      nextCol = Math.min((currentData[0]?.length ?? 1) - 1, selectedCell.col + 1);
      moved = true;
    } else if (e.key === "Tab") {
      e.preventDefault();
      if (e.shiftKey) {
        nextCol = Math.max(0, selectedCell.col - 1);
      } else {
        nextCol = Math.min((currentData[0]?.length ?? 1) - 1, selectedCell.col + 1);
      }
      moved = true;
    } else if (e.key === "Enter") {
      e.preventDefault();
      startEditing(selectedCell.row, selectedCell.col);
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      updateCellValue(selectedCell.row, selectedCell.col, "");
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      // Start typing directly
      setSelectedCell({ row: selectedCell.row, col: selectedCell.col });
      setSelectionRange({ startRow: selectedCell.row, startCol: selectedCell.col, endRow: selectedCell.row, endCol: selectedCell.col });
      setEditMode(true);
      setEditValue(e.key);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }

    if (moved) {
      if (e.shiftKey) {
        // Expand selection range
        setSelectionRange(prev => ({
          ...prev,
          endRow: nextRow,
          endCol: nextCol
        }));
      } else {
        // Normal cell jump
        setSelectedCell({ row: nextRow, col: nextCol });
        setSelectionRange({ startRow: nextRow, startCol: nextCol, endRow: nextRow, endCol: nextCol });
      }
    }
  };

  // Mouse drag range selection
  const handleCellMouseDown = (row: number, col: number, e: React.MouseEvent) => {
    if (e.button !== 0) return; // Only left click
    
    if (editMode && (selectedCell.row !== row || selectedCell.col !== col)) {
      stopEditing(true);
    }

    setSelectedCell({ row, col });
    setSelectionRange({ startRow: row, startCol: col, endRow: row, endCol: col });
    setIsSelecting(true);
  };

  const handleCellMouseEnter = (row: number, col: number) => {
    if (!isSelecting) return;
    setSelectionRange(prev => ({
      ...prev,
      endRow: row,
      endCol: col,
    }));
  };
  React.useEffect(() => {
    const handleGlobalMouseUp = () => {
      setIsSelecting(false);
    };
    window.addEventListener("mouseup", handleGlobalMouseUp);
    return () => window.removeEventListener("mouseup", handleGlobalMouseUp);
  }, []);

  const isCellSelected = (row: number, col: number) => {
    const minRow = Math.min(selectionRange.startRow, selectionRange.endRow);
    const maxRow = Math.max(selectionRange.startRow, selectionRange.endRow);
    const minCol = Math.min(selectionRange.startCol, selectionRange.endCol);
    const maxCol = Math.max(selectionRange.startCol, selectionRange.endCol);

    return row >= minRow && row <= maxRow && col >= minCol && col <= maxCol;
  };

  // Formula click helper
  const insertFormula = (name: string) => {
    const formulaStr = `=${name}(A1:A5)`;
    updateCellValue(selectedCell.row, selectedCell.col, formulaStr);
    startEditing(selectedCell.row, selectedCell.col);
  };

  if (sheets.length === 0) {
    return (
      <div className="flex h-full items-center justify-center bg-zinc-50 dark:bg-zinc-900 text-zinc-400">
        <div className="flex flex-col items-center gap-2">
          <FileSpreadsheet className="h-10 w-10 animate-bounce text-emerald-600" />
          <span className="text-sm font-medium">Opening Excel document...</span>
        </div>
      </div>
    );
  }

  const selectionMinRow = Math.min(selectionRange.startRow, selectionRange.endRow);
  const selectionMaxRow = Math.max(selectionRange.startRow, selectionRange.endRow);
  const selectionMinCol = Math.min(selectionRange.startCol, selectionRange.endCol);
  const selectionMaxCol = Math.max(selectionRange.startCol, selectionRange.endCol);

  return (
    <div
      ref={fullscreenRef}
      className={cn("flex h-full flex-col bg-zinc-100 text-zinc-800 font-sans select-none", isFullscreen && "fixed inset-0 z-50")}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      {/* Office Header Toolbar */}
      <div className="bg-[#107c41] text-white px-4 py-2 flex items-center justify-between shrink-0 shadow-md">
        <div className="flex items-center gap-3">
          <div className="bg-white text-[#107c41] font-black text-sm h-7 w-7 flex items-center justify-center rounded shadow">
            X
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm tracking-wide">Excel Online</span>
              <span className="bg-emerald-800/60 text-[9px] px-1.5 py-0.5 rounded uppercase tracking-wider font-semibold text-emerald-200">
                Interactive Previewer
              </span>
            </div>
            <div className="text-[10px] text-emerald-100 font-mono truncate max-w-sm">
              {path.split("/").pop()}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isDirty && (
            <span className="text-xs bg-amber-600/60 px-2 py-0.5 rounded text-amber-100 animate-pulse mr-2">
              Unsaved changes
            </span>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={handleSave}
            disabled={savePending}
            className="h-8 text-white hover:bg-emerald-800 hover:text-white"
          >
            <Save className="h-4 w-4 mr-1.5" />
            {savePending ? "Saving..." : "Save (Ctrl+S)"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onDownload}
            className="h-8 text-white hover:bg-emerald-800 hover:text-white"
          >
            <Download className="h-4 w-4 mr-1.5" />
            Download
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={toggleFullscreen}
            className="h-8 w-8 text-white hover:bg-emerald-800 hover:text-white"
            title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Office Excel Ribbons */}
      <div className="bg-white border-b border-zinc-200 shrink-0">
        <div className="flex border-b border-zinc-200 text-xs px-4">
          <button
            onClick={() => setActiveRibbonTab("home")}
            className={cn(
              "px-4 py-2 font-medium border-b-2 transition-all",
              activeRibbonTab === "home"
                ? "border-emerald-600 text-emerald-700 font-bold"
                : "border-transparent text-zinc-500 hover:text-zinc-800"
            )}
          >
            Home
          </button>
          <button
            onClick={() => setActiveRibbonTab("insert")}
            className={cn(
              "px-4 py-2 font-medium border-b-2 transition-all",
              activeRibbonTab === "insert"
                ? "border-emerald-600 text-emerald-700 font-bold"
                : "border-transparent text-zinc-500 hover:text-zinc-800"
            )}
          >
            Insert
          </button>
          <button
            onClick={() => setActiveRibbonTab("formulas")}
            className={cn(
              "px-4 py-2 font-medium border-b-2 transition-all",
              activeRibbonTab === "formulas"
                ? "border-emerald-600 text-emerald-700 font-bold"
                : "border-transparent text-zinc-500 hover:text-zinc-800"
            )}
          >
            Formulas
          </button>
        </div>

        {/* Ribbon Tools Panel */}
        <div className="bg-zinc-50 px-6 py-2.5 flex items-center gap-6 text-zinc-700 border-b border-zinc-200 min-h-12 overflow-x-auto">
          {activeRibbonTab === "home" && (
            <>
              {/* Font Styles */}
              <div className="flex items-center gap-1 border-r border-zinc-300 pr-4">
                <Button
                  size="icon"
                  variant="ghost"
                  className={cn(
                    "h-8 w-8 text-zinc-600 hover:bg-zinc-200",
                    boldCells[getCellId(selectedCell.row, selectedCell.col)] && "bg-zinc-200 text-zinc-900 font-bold"
                  )}
                  onClick={() => {
                    const id = getCellId(selectedCell.row, selectedCell.col);
                    setBoldCells(prev => ({ ...prev, [id]: !prev[id] }));
                  }}
                  title="Bold"
                >
                  <Bold className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className={cn(
                    "h-8 w-8 text-zinc-600 hover:bg-zinc-200",
                    italicCells[getCellId(selectedCell.row, selectedCell.col)] && "bg-zinc-200 text-zinc-900 font-bold"
                  )}
                  onClick={() => {
                    const id = getCellId(selectedCell.row, selectedCell.col);
                    setItalicCells(prev => ({ ...prev, [id]: !prev[id] }));
                  }}
                  title="Italic"
                >
                  <Italic className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className={cn(
                    "h-8 w-8 text-zinc-600 hover:bg-zinc-200",
                    underlineCells[getCellId(selectedCell.row, selectedCell.col)] && "bg-zinc-200 text-zinc-900 font-bold"
                  )}
                  onClick={() => {
                    const id = getCellId(selectedCell.row, selectedCell.col);
                    setUnderlineCells(prev => ({ ...prev, [id]: !prev[id] }));
                  }}
                  title="Underline"
                >
                  <Underline className="h-4 w-4" />
                </Button>
              </div>

              {/* Text Alignments */}
              <div className="flex items-center gap-1 border-r border-zinc-300 pr-4">
                <Button
                  size="icon"
                  variant="ghost"
                  className={cn(
                    "h-8 w-8 text-zinc-600 hover:bg-zinc-200",
                    alignCells[getCellId(selectedCell.row, selectedCell.col)] === "left" && "bg-zinc-200 text-zinc-900"
                  )}
                  onClick={() => {
                    const id = getCellId(selectedCell.row, selectedCell.col);
                    setAlignCells(prev => ({ ...prev, [id]: "left" }));
                  }}
                  title="Align Left"
                >
                  <AlignLeft className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className={cn(
                    "h-8 w-8 text-zinc-600 hover:bg-zinc-200",
                    alignCells[getCellId(selectedCell.row, selectedCell.col)] === "center" && "bg-zinc-200 text-zinc-900"
                  )}
                  onClick={() => {
                    const id = getCellId(selectedCell.row, selectedCell.col);
                    setAlignCells(prev => ({ ...prev, [id]: "center" }));
                  }}
                  title="Align Center"
                >
                  <AlignCenter className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className={cn(
                    "h-8 w-8 text-zinc-600 hover:bg-zinc-200",
                    alignCells[getCellId(selectedCell.row, selectedCell.col)] === "right" && "bg-zinc-200 text-zinc-900"
                  )}
                  onClick={() => {
                    const id = getCellId(selectedCell.row, selectedCell.col);
                    setAlignCells(prev => ({ ...prev, [id]: "right" }));
                  }}
                  title="Align Right"
                >
                  <AlignRight className="h-4 w-4" />
                </Button>
              </div>

              {/* Grid Toggle / View */}
              <div className="flex items-center gap-2">
                <Grid3X3 className="h-4 w-4 text-emerald-600" />
                <span className="text-xs text-zinc-500 font-medium">Standard Grid Mode</span>
              </div>
            </>
          )}

          {activeRibbonTab === "insert" && (
            <>
              <div className="flex items-center gap-2 border-r border-zinc-300 pr-4">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => insertRow(true)}
                  className="h-8 text-xs text-zinc-700 border-zinc-300 hover:bg-zinc-100"
                >
                  Insert Row Above
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => insertRow(false)}
                  className="h-8 text-xs text-zinc-700 border-zinc-300 hover:bg-zinc-100"
                >
                  Insert Row Below
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => insertColumn(true)}
                  className="h-8 text-xs text-zinc-700 border-zinc-300 hover:bg-zinc-100"
                >
                  Insert Column Left
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => insertColumn(false)}
                  className="h-8 text-xs text-zinc-700 border-zinc-300 hover:bg-zinc-100"
                >
                  Insert Column Right
                </Button>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={deleteRow}
                  className="h-8 text-xs flex items-center gap-1"
                >
                  <Trash2 className="h-3 w-3" />
                  Delete Row
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={deleteColumn}
                  className="h-8 text-xs flex items-center gap-1"
                >
                  <Trash2 className="h-3 w-3" />
                  Delete Column
                </Button>
              </div>
            </>
          )}

          {activeRibbonTab === "formulas" && (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-zinc-400 mr-2 flex items-center gap-1 font-semibold">
                  <Calculator className="h-3 w-3 text-emerald-600" /> Formulas:
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => insertFormula("SUM")}
                  className="h-8 text-xs hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300"
                >
                  SUM
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => insertFormula("AVERAGE")}
                  className="h-8 text-xs hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300"
                >
                  AVERAGE
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => insertFormula("COUNT")}
                  className="h-8 text-xs hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300"
                >
                  COUNT
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => insertFormula("MAX")}
                  className="h-8 text-xs hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300"
                >
                  MAX
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => insertFormula("MIN")}
                  className="h-8 text-xs hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300"
                >
                  MIN
                </Button>
                <span className="text-[10px] text-zinc-400 italic ml-4">
                  *Formulas automatically evaluate live grid values
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Dynamic Formula Bar */}
      <div className="flex items-center gap-2 border-b border-zinc-200 bg-white px-4 py-1.5 text-xs shrink-0 select-none">
        {/* Name Box */}
        <div className="flex items-center justify-center bg-zinc-50 border border-zinc-200 px-3 py-1 text-emerald-700 font-mono font-bold rounded min-w-16 text-center select-none h-7">
          {getCellId(selectedCell.row, selectedCell.col)}
        </div>
        
        {/* Separator */}
        <div className="text-zinc-300 font-light select-none">|</div>
        
        {/* fx label */}
        <div className="text-zinc-400 font-serif italic font-semibold select-none px-1 text-sm">fx</div>
        
        {/* Formula Input */}
        <input
          type="text"
          value={editMode ? editValue : String(activeRawValue)}
          onChange={(e) => {
            if (editMode) {
              setEditValue(e.target.value);
            } else {
              setEditMode(true);
              setEditValue(e.target.value);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              stopEditing(true);
            } else if (e.key === "Escape") {
              stopEditing(false);
            }
          }}
          onBlur={() => {
            // Delay stop editing slightly in case user clicked in formulas ribbon
            setTimeout(() => stopEditing(true), 150);
          }}
          placeholder="Enter text, numbers, or formula starting with '='"
          className="flex-1 bg-zinc-50 border border-zinc-200 px-3 py-1 rounded text-zinc-800 outline-none placeholder:text-zinc-400 font-mono text-xs h-7 focus:bg-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors"
        />
      </div>

      {/* Spreadsheet Grid Container */}
      <div
        ref={gridContainerRef}
        className="flex-1 overflow-auto bg-zinc-100 relative"
      >
        <div className="inline-block min-w-full">
          <table className="border-collapse table-fixed text-xs font-sans select-none bg-white">
            <thead>
              {/* Column Headers */}
              <tr className="bg-zinc-50 border-b border-zinc-200 sticky top-0 z-20">
                {/* Top-Left Empty Header Corner */}
                <th className="w-12 bg-zinc-50 border-r border-b border-zinc-200 text-center text-[10px] text-zinc-400 font-semibold select-none sticky left-0 z-30 h-6"></th>
                {Array.from({ length: currentData[0]?.length ?? 10 }).map((_, colIdx) => {
                  const isColActive = selectedCell.col === colIdx || (colIdx >= selectionMinCol && colIdx <= selectionMaxCol);
                  return (
                    <th
                      key={colIdx}
                      className={cn(
                        "w-32 px-2 py-1 bg-zinc-50 border-r border-zinc-200 text-center text-[10px] font-bold select-none border-b h-6 transition-colors",
                        isColActive ? "text-emerald-700 bg-emerald-50 border-b-2 border-b-emerald-600" : "text-zinc-500"
                      )}
                    >
                      {getColumnLabel(colIdx)}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {currentData.map((row, rowIdx) => {
                const isRowActive = selectedCell.row === rowIdx || (rowIdx >= selectionMinRow && rowIdx <= selectionMaxRow);
                return (
                  <tr key={rowIdx} className="hover:bg-zinc-50/50 border-b border-zinc-100">
                    {/* Row Index Header */}
                    <td
                      className={cn(
                        "w-12 bg-zinc-50 border-r border-zinc-200 text-center text-[10px] font-bold select-none sticky left-0 z-10 transition-colors h-6.5",
                        isRowActive ? "text-emerald-700 bg-emerald-50 border-r-2 border-r-emerald-600" : "text-zinc-400"
                      )}
                    >
                      {rowIdx + 1}
                    </td>

                    {/* Data Cells */}
                    {row.map((cell, colIdx) => {
                      const cellId = getCellId(rowIdx, colIdx);
                      const isSelected = isCellSelected(rowIdx, colIdx);
                      const isEditing = editMode && selectedCell.row === rowIdx && selectedCell.col === colIdx;
                      
                      // Formatting
                      const isBold = boldCells[cellId];
                      const isItalic = italicCells[cellId];
                      const isUnderline = underlineCells[cellId];
                      const align = alignCells[cellId] ?? "left";

                      return (
                        <td
                          key={colIdx}
                          onMouseDown={(e) => handleCellMouseDown(rowIdx, colIdx, e)}
                          onMouseEnter={() => handleCellMouseEnter(rowIdx, colIdx)}
                          onDoubleClick={() => startEditing(rowIdx, colIdx)}
                          className={cn(
                            "w-32 px-2.5 py-1 border-r border-zinc-200/85 text-left truncate relative cursor-cell select-none h-6.5 font-normal transition-all",
                            isSelected && "bg-emerald-600/10 border-emerald-600/30",
                            selectedCell.row === rowIdx && selectedCell.col === colIdx && !isEditing && "outline outline-2 outline-emerald-600 z-10",
                            isBold && "font-bold",
                            isItalic && "italic",
                            isUnderline && "underline",
                            align === "center" && "text-center",
                            align === "right" && "text-right"
                          )}
                          title={cellId + ": " + (cell !== undefined && cell !== null ? String(cell) : "")}
                        >
                          {isEditing ? (
                            <input
                              ref={inputRef}
                              type="text"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              className="absolute inset-0 w-full h-full px-2 py-0 border-none outline-none font-mono text-xs z-30 bg-white"
                              style={{ boxShadow: "inset 0 0 0 2px #107c41" }}
                            />
                          ) : (
                            getCellDisplayValue(rowIdx, colIdx)
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Sheets & Bottom Status Bar */}
      <div className="flex flex-col shrink-0 border-t border-zinc-200 bg-white select-none">
        {/* Sheet Tabs */}
        <div className="flex items-center gap-1 border-b border-zinc-200 px-4 py-1.5 overflow-x-auto bg-zinc-50">
          <span className="text-[10px] font-bold text-zinc-400 mr-3 uppercase tracking-wider">
            Sheets:
          </span>
          <div className="flex items-center gap-1">
            {sheets.map((sheet, idx) => (
              <button
                key={idx}
                onClick={() => {
                  if (editMode) stopEditing(true);
                  setActiveSheet(idx);
                  setSelectedCell({ row: 0, col: 0 });
                  setSelectionRange({ startRow: 0, startCol: 0, endRow: 0, endCol: 0 });
                }}
                className={cn(
                  "px-4 py-1 text-xs rounded transition-all flex items-center gap-1.5 group",
                  activeSheet === idx
                    ? "bg-white text-emerald-700 font-bold border border-zinc-200 border-b-emerald-600 border-b-2 shadow-sm"
                    : "text-zinc-500 hover:bg-zinc-200 hover:text-zinc-800"
                )}
              >
                <span>{sheet.name}</span>
                {sheets.length > 1 && (
                  <span
                    onClick={(e) => { e.stopPropagation(); deleteSheet(idx); }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity rounded-full hover:bg-zinc-300 p-0.5 -mr-1"
                    title={`Delete ${sheet.name}`}
                  >
                    <X className="h-3 w-3" />
                  </span>
                )}
              </button>
            ))}
            <button
              onClick={addNewSheet}
              className="p-1 rounded text-zinc-500 hover:bg-zinc-200 hover:text-zinc-800"
              title="Add New Sheet"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>

          <div className="ml-auto text-[10px] text-zinc-400 flex items-center gap-2">
            <span className="font-mono">
              Grid Size: {currentData.length} rows × {currentData[0]?.length ?? 0} cols
            </span>
          </div>
        </div>

        {/* Status Bar */}
        <div className="bg-[#107c41] text-emerald-50 px-4 py-1.5 text-xs flex justify-between items-center h-8 font-medium">
          <div className="flex items-center gap-3">
            <span className="uppercase text-[10px] font-bold bg-emerald-800 px-2 py-0.5 rounded tracking-widest">
              Ready
            </span>
            {isDirty && (
              <span className="text-[10px] text-emerald-200 font-bold animate-pulse">
                • Changes not saved
              </span>
            )}
          </div>

          {/* dynamic cell statistics */}
          {stats ? (
            <div className="flex items-center gap-4 bg-emerald-800/50 px-3 py-0.5 rounded text-[11px] font-mono border border-emerald-500/20">
              <span>Average: <strong className="text-white">{stats.average}</strong></span>
              <span>Count: <strong className="text-white">{stats.count}</strong></span>
              <span>Sum: <strong className="text-white">{stats.sum}</strong></span>
            </div>
          ) : (
            <div className="text-[10px] text-emerald-200/70 italic">
              Select multiple cell values to see stats
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
