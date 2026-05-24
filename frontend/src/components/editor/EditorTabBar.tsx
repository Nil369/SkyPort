import React, { useState } from 'react';
import { useEditorTabStore } from '@/stores/editorTabStore';
import { Button } from '@/components/ui/button';
import { X, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getLanguageById } from '@/features/code-editor/languages/languageRegistry';
import { BrandLanguageIcon } from '@/features/code-editor/components/BrandLanguageIcon';

interface EditorTabBarProps {
  onTabChange?: (filePath: string | null) => void;
  onNewFile?: () => void;
}

export function EditorTabBar({ onTabChange, onNewFile }: EditorTabBarProps) {
  const { tabs, activeTabId, closeTab, closeAllTabs, closeOtherTabs, setActiveTab, reorderTabs } = useEditorTabStore();
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const handleTabClick = (tabId: string) => {
    setActiveTab(tabId);
    const tab = tabs.find(t => t.id === tabId);
    onTabChange?.(tab?.filePath || null);
  };

  const handleCloseTab = (e: React.MouseEvent, tabId: string) => {
    e.stopPropagation();
    closeTab(tabId);
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (draggedIndex !== null && draggedIndex !== dropIndex) {
      reorderTabs(draggedIndex, dropIndex);
    }
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleContextMenu = (e: React.MouseEvent, tabId: string) => {
    e.preventDefault();
    const menu = document.createElement('div');
    menu.className = 'fixed z-50 rounded-lg border border-border/80 bg-background shadow-xl p-1 min-w-40';
    menu.style.left = `${e.clientX}px`;
    menu.style.top = `${e.clientY}px`;

    const items = [
      { label: 'Close', onClick: () => closeTab(tabId) },
      { label: 'Close Others', onClick: () => closeOtherTabs(tabId) },
      { label: 'Close All', onClick: closeAllTabs },
    ];

    items.forEach(item => {
      const btn = document.createElement('button');
      btn.className = 'flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-muted transition-colors';
      btn.textContent = item.label;
      btn.onclick = () => {
        item.onClick();
        menu.remove();
      };
      menu.appendChild(btn);
    });

    document.body.appendChild(menu);
    const handleClick = () => {
      menu.remove();
      document.removeEventListener('click', handleClick);
    };
    document.addEventListener('click', handleClick);
  };

  if (tabs.length === 0) return null;

  const getLanguageIcon = (lang: string) => {
    const language = getLanguageById(lang);
    return <BrandLanguageIcon iconSlug={language.iconSlug} className="h-3.5 w-3.5" title={language.label} />;
  };

  return (
    <div className="flex items-center gap-0.5 border-b border-border/60 bg-muted/30 px-1 py-1 overflow-x-auto">
      {tabs.map((tab, index) => {
        const isActive = tab.id === activeTabId;
        const isDragging = draggedIndex === index;
        const isDragOver = dragOverIndex === index;

        return (
          <button
            key={tab.id}
            draggable
            onDragStart={(e) => handleDragStart(e, index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, index)}
            onDragEnd={handleDragEnd}
            onClick={() => handleTabClick(tab.id)}
            onContextMenu={(e) => handleContextMenu(e, tab.id)}
            className={cn(
              'group relative flex items-center gap-2 rounded-t px-3 py-2 text-xs whitespace-nowrap transition-all cursor-move',
              isDragging && 'opacity-50',
              isDragOver && 'border-l-2 border-l-primary bg-muted',
              isActive
                ? 'border-b-2 border-b-primary bg-background text-foreground shadow-sm'
                : 'border-b-2 border-b-transparent bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
            title={tab.filePath}
          >
            <span className="flex items-center justify-center shrink-0">
              {getLanguageIcon(tab.language)}
            </span>
            <span className="truncate max-w-xs">{tab.fileName}</span>
            {tab.isDirty && <span className="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" />}
            <button
              onClick={(e) => handleCloseTab(e, tab.id)}
              className="rounded p-0.5 opacity-0 hover:bg-muted group-hover:opacity-100 transition-opacity hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          </button>
        );
      })}

      {onNewFile && (
        <Button size="sm" variant="ghost" onClick={onNewFile} className="ml-2 shrink-0 h-8 w-8 p-0 opacity-50 hover:opacity-100">
          <Plus className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
}
