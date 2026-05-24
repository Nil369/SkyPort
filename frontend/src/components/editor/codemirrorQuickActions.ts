import type { Extension } from "@codemirror/state";
import {
  cursorDocEnd,
  cursorDocStart,
  cursorGroupLeft,
  cursorGroupRight,
  cursorLineBoundaryBackward,
  cursorLineBoundaryForward,
  cursorLineEnd,
  cursorLineDown,
  cursorLineStart,
  cursorLineUp,
  cursorMatchingBracket,
  deleteCharBackward,
  deleteCharForward,
  deleteGroupBackward,
  deleteGroupForward,
  deleteLine,
  deleteToLineEnd,
  deleteToLineStart,
  indentLess,
  indentMore,
  indentSelection,
  insertBlankLine,
  insertNewlineAndIndent,
  moveLineDown,
  moveLineUp,
  redo,
  redoSelection,
  selectAll,
  selectDocEnd,
  selectDocStart,
  selectLine,
  selectLineDown,
  selectLineUp,
  selectMatchingBracket,
  selectParentSyntax,
  cursorSyntaxLeft,
  cursorSyntaxRight,
  splitLine,
  toggleBlockComment,
  toggleComment,
  transposeChars,
  undo,
  undoSelection,
} from "@codemirror/commands";
import {
  closeSearchPanel,
  gotoLine,
  findNext,
  findPrevious,
  getSearchQuery,
  openSearchPanel,
  replaceAll,
  replaceNext,
  search,
  searchPanelOpen,
  selectNextOccurrence,
  selectMatches,
  SearchQuery,
  setSearchQuery,
} from "@codemirror/search";
import { acceptCompletion, closeCompletion, startCompletion } from "@codemirror/autocomplete";
import { foldAll, foldCode, toggleFold, unfoldAll, unfoldCode } from "@codemirror/language";
import { keymap, type EditorView, type KeyBinding, type Panel } from "@codemirror/view";

type PaletteAction = {
  id: string;
  label: string;
  execute: (view: EditorView) => void;
};

const paletteActions: PaletteAction[] = [
  { id: "open-search", label: "Open Search", execute: (view) => openSearchPanel(view) },
  { id: "find-next", label: "Find Next", execute: (view) => findNext(view) },
  { id: "find-previous", label: "Find Previous", execute: (view) => findPrevious(view) },
  { id: "goto-line", label: "Go To Line", execute: (view) => gotoLine(view) },
  { id: "select-next-occurrence", label: "Select Next Occurrence", execute: (view) => selectNextOccurrence(view) },
  { id: "select-matches", label: "Select All Matches", execute: (view) => selectMatches(view) },
  { id: "replace-next", label: "Replace Next", execute: (view) => replaceNext(view) },
  { id: "replace-all", label: "Replace All", execute: (view) => replaceAll(view) },
  { id: "undo", label: "Undo", execute: (view) => undo(view) },
  { id: "redo", label: "Redo", execute: (view) => redo(view) },
  { id: "undo-selection", label: "Undo Selection", execute: (view) => undoSelection(view) },
  { id: "redo-selection", label: "Redo Selection", execute: (view) => redoSelection(view) },
  { id: "select-all", label: "Select All", execute: (view) => selectAll(view) },
  { id: "select-line", label: "Select Line", execute: (view) => selectLine(view) },
  { id: "select-parent-syntax", label: "Select Parent Syntax", execute: (view) => selectParentSyntax(view) },
  { id: "cursor-doc-start", label: "Cursor Doc Start", execute: (view) => cursorDocStart(view) },
  { id: "cursor-doc-end", label: "Cursor Doc End", execute: (view) => cursorDocEnd(view) },
  { id: "select-doc-start", label: "Select Doc Start", execute: (view) => selectDocStart(view) },
  { id: "select-doc-end", label: "Select Doc End", execute: (view) => selectDocEnd(view) },
  { id: "cursor-line-start", label: "Cursor Line Start", execute: (view) => cursorLineStart(view) },
  { id: "cursor-line-end", label: "Cursor Line End", execute: (view) => cursorLineEnd(view) },
  { id: "cursor-line-up", label: "Cursor Line Up", execute: (view) => cursorLineUp(view) },
  { id: "cursor-line-down", label: "Cursor Line Down", execute: (view) => cursorLineDown(view) },
  { id: "select-line-up", label: "Select Line Up", execute: (view) => selectLineUp(view) },
  { id: "select-line-down", label: "Select Line Down", execute: (view) => selectLineDown(view) },
  { id: "cursor-line-boundary-backward", label: "Cursor Line Boundary Backward", execute: (view) => cursorLineBoundaryBackward(view) },
  { id: "cursor-line-boundary-forward", label: "Cursor Line Boundary Forward", execute: (view) => cursorLineBoundaryForward(view) },
  { id: "cursor-group-left", label: "Cursor Group Left", execute: (view) => cursorGroupLeft(view) },
  { id: "cursor-group-right", label: "Cursor Group Right", execute: (view) => cursorGroupRight(view) },
  { id: "cursor-syntax-left", label: "Cursor Syntax Left", execute: (view) => cursorSyntaxLeft(view) },
  { id: "cursor-syntax-right", label: "Cursor Syntax Right", execute: (view) => cursorSyntaxRight(view) },
  { id: "cursor-matching-bracket", label: "Cursor Matching Bracket", execute: (view) => cursorMatchingBracket(view) },
  { id: "select-matching-bracket", label: "Select Matching Bracket", execute: (view) => selectMatchingBracket(view) },
  { id: "indent-more", label: "Indent More", execute: (view) => indentMore(view) },
  { id: "indent-less", label: "Indent Less", execute: (view) => indentLess(view) },
  { id: "indent-selection", label: "Indent Selection", execute: (view) => indentSelection(view) },
  { id: "insert-newline-indent", label: "Insert Newline and Indent", execute: (view) => insertNewlineAndIndent(view) },
  { id: "insert-blank-line", label: "Insert Blank Line", execute: (view) => insertBlankLine(view) },
  { id: "split-line", label: "Split Line", execute: (view) => splitLine(view) },
  { id: "move-line-up", label: "Move Line Up", execute: (view) => moveLineUp(view) },
  { id: "move-line-down", label: "Move Line Down", execute: (view) => moveLineDown(view) },
  { id: "delete-line", label: "Delete Line", execute: (view) => deleteLine(view) },
  { id: "delete-char-backward", label: "Delete Character Backward", execute: (view) => deleteCharBackward(view) },
  { id: "delete-char-forward", label: "Delete Character Forward", execute: (view) => deleteCharForward(view) },
  { id: "delete-to-line-start", label: "Delete To Line Start", execute: (view) => deleteToLineStart(view) },
  { id: "delete-to-line-end", label: "Delete To Line End", execute: (view) => deleteToLineEnd(view) },
  { id: "delete-group-backward", label: "Delete Group Backward", execute: (view) => deleteGroupBackward(view) },
  { id: "delete-group-forward", label: "Delete Group Forward", execute: (view) => deleteGroupForward(view) },
  { id: "transpose-chars", label: "Transpose Characters", execute: (view) => transposeChars(view) },
  { id: "toggle-comment", label: "Toggle Comment", execute: (view) => toggleComment(view) },
  { id: "toggle-block-comment", label: "Toggle Block Comment", execute: (view) => toggleBlockComment(view) },
  { id: "fold-code", label: "Fold Code", execute: (view) => foldCode(view) },
  { id: "unfold-code", label: "Unfold Code", execute: (view) => unfoldCode(view) },
  { id: "toggle-fold", label: "Toggle Fold", execute: (view) => toggleFold(view) },
  { id: "fold-all", label: "Fold All", execute: (view) => foldAll(view) },
  { id: "unfold-all", label: "Unfold All", execute: (view) => unfoldAll(view) },
  { id: "start-completion", label: "Start Completion", execute: (view) => startCompletion(view) },
  { id: "close-completion", label: "Close Completion", execute: (view) => closeCompletion(view) },
  { id: "accept-completion", label: "Accept Completion", execute: (view) => acceptCompletion(view) },
  {
    id: "toggle-search-bar",
    label: "Toggle Search Bar",
    execute: (view) => {
      if (searchPanelOpen(view.state)) {
        closeSearchPanel(view);
      } else {
        openSearchPanel(view);
      }
    },
  },
  { id: "close-search", label: "Close Search", execute: (view) => closeSearchPanel(view) },
];

function createSearchQueryFromValue(view: EditorView, searchValue: string): SearchQuery {
  const currentQuery = getSearchQuery(view.state);
  return new SearchQuery({
    search: searchValue,
    caseSensitive: currentQuery.caseSensitive,
    literal: currentQuery.literal,
    regexp: currentQuery.regexp,
    replace: currentQuery.replace,
    wholeWord: currentQuery.wholeWord,
    test: currentQuery.test,
  });
}

export class CodeMirrorQuickAccessController {
  private view: EditorView | null = null;
  private searchPanelRoot: HTMLDivElement | null = null;
  private paletteRoot: HTMLDivElement | null = null;
  private paletteList: HTMLDivElement | null = null;
  private paletteQuery = "";
  private paletteSelectionIndex = 0;

  attach(view: EditorView) {
    this.view = view;
  }

  destroy() {
    this.closePalette(false);
    this.searchPanelRoot = null;
    this.view = null;
  }

  createSearchPanel(view: EditorView): Panel {
    const root = document.createElement("div");
    root.className = "cm-quick-search-panel";

    const shell = document.createElement("div");
    shell.className = "cm-quick-search-shell";
    root.appendChild(shell);

    const input = document.createElement("input");
    input.className = "cm-quick-search-input";
    input.type = "text";
    input.placeholder = "Search";
    input.autocomplete = "off";
    input.spellcheck = false;
    input.setAttribute("main-field", "true");
    shell.appendChild(input);

    const nextButton = this.createButton("Next");
    const previousButton = this.createButton("Previous");
    const closeButton = this.createButton("Close");

    shell.appendChild(previousButton);
    shell.appendChild(nextButton);
    shell.appendChild(closeButton);

    const applyQuery = (value: string) => {
      view.dispatch({
        effects: setSearchQuery.of(createSearchQueryFromValue(view, value)),
      });
    };

    const focusInput = () => {
      requestAnimationFrame(() => {
        input.focus();
        input.select();
      });
    };

    const goToNext = () => {
      if (!input.value.trim()) {
        input.focus();
        return;
      }
      findNext(view);
      view.focus();
    };

    const goToPrevious = () => {
      if (!input.value.trim()) {
        input.focus();
        return;
      }
      findPrevious(view);
      view.focus();
    };

    const closePanel = () => {
      closeSearchPanel(view);
      view.focus();
    };

    const handleInputKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Enter") {
        event.preventDefault();
        if (event.shiftKey) {
          goToPrevious();
        } else {
          goToNext();
        }
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        closePanel();
      }
    };

    input.addEventListener("input", () => {
      applyQuery(input.value);
    });
    input.addEventListener("keydown", handleInputKeyDown);
    nextButton.addEventListener("click", goToNext);
    previousButton.addEventListener("click", goToPrevious);
    closeButton.addEventListener("click", closePanel);

    const syncInput = () => {
      const currentSearch = getSearchQuery(view.state).search;
      if (document.activeElement !== input && input.value !== currentSearch) {
        input.value = currentSearch;
      }
    };

    return {
      dom: root,
      top: true,
      mount: () => {
        this.searchPanelRoot = root;
        syncInput();
        focusInput();
      },
      update: () => {
        syncInput();
      },
      destroy: () => {
        input.removeEventListener("keydown", handleInputKeyDown);
        nextButton.removeEventListener("click", goToNext);
        previousButton.removeEventListener("click", goToPrevious);
        closeButton.removeEventListener("click", closePanel);
        if (this.searchPanelRoot === root) {
          this.searchPanelRoot = null;
        }
      },
    };
  }

  openSearchBar(view: EditorView) {
    openSearchPanel(view);
  }

  closeSearchBar(view: EditorView) {
    closeSearchPanel(view);
    view.focus();
  }

  togglePalette(view: EditorView) {
    if (this.paletteRoot) {
      this.closePalette(true);
      return;
    }

    this.openPalette(view);
  }

  handleKeyBinding(view: EditorView, event: KeyboardEvent): boolean {
    const isModKey = event.metaKey || event.ctrlKey;

    if (!isModKey) {
      return false;
    }

    if (event.key.toLowerCase() === "f") {
      event.preventDefault();
      this.openSearchBar(view);
      return true;
    }

    if (event.key.toLowerCase() === "k") {
      event.preventDefault();
      this.togglePalette(view);
      return true;
    }

    return false;
  }

  handleEscape(view: EditorView): boolean {
    if (searchPanelOpen(view.state)) {
      this.closeSearchBar(view);
      return true;
    }

    if (this.paletteRoot) {
      this.closePalette(true);
      return true;
    }

    return false;
  }

  private openPalette(view: EditorView) {
    this.view = view;
    this.paletteQuery = "";
    this.paletteSelectionIndex = 0;

    const overlay = document.createElement("div");
    overlay.className = "cm-command-palette-overlay";

    const dialog = document.createElement("div");
    dialog.className = "cm-command-palette";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    overlay.appendChild(dialog);

    const input = document.createElement("input");
    input.className = "cm-command-palette-input";
    input.type = "text";
    input.placeholder = "Type a command";
    input.autocomplete = "off";
    input.spellcheck = false;

    const list = document.createElement("div");
    list.className = "cm-command-palette-list";

    dialog.appendChild(input);
    dialog.appendChild(list);

    const closeOnBackdrop = (event: MouseEvent) => {
      if (event.target === overlay) {
        this.closePalette(true);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      const visibleActions = this.getFilteredPaletteActions();

      if (event.key === "Escape") {
        event.preventDefault();
        this.closePalette(true);
        return;
      }

      if (!visibleActions.length) {
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        this.paletteSelectionIndex = (this.paletteSelectionIndex + 1) % visibleActions.length;
        this.renderPaletteList();
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        this.paletteSelectionIndex = (this.paletteSelectionIndex - 1 + visibleActions.length) % visibleActions.length;
        this.renderPaletteList();
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        const selectedAction = visibleActions[this.paletteSelectionIndex];
        if (selectedAction) {
          this.executePaletteAction(selectedAction);
        }
      }
    };

    input.addEventListener("input", () => {
      this.paletteQuery = input.value;
      this.paletteSelectionIndex = 0;
      this.renderPaletteList();
    });
    input.addEventListener("keydown", handleKeyDown);
    overlay.addEventListener("mousedown", closeOnBackdrop);

    document.body.appendChild(overlay);

    this.paletteRoot = overlay;
    this.paletteList = list;

    this.renderPaletteList();

    requestAnimationFrame(() => {
      input.focus();
      input.select();
    });
  }

  private closePalette(focusEditor: boolean) {
    if (!this.paletteRoot) {
      if (focusEditor) {
        this.view?.focus();
      }
      return;
    }

    this.paletteRoot.remove();
    this.paletteRoot = null;
    this.paletteList = null;
    this.paletteQuery = "";
    this.paletteSelectionIndex = 0;

    if (focusEditor) {
      this.view?.focus();
    }
  }

  private getFilteredPaletteActions() {
    const query = this.paletteQuery.trim().toLowerCase();
    if (!query) {
      return paletteActions;
    }

    return paletteActions.filter((action) => action.label.toLowerCase().includes(query));
  }

  private renderPaletteList() {
    if (!this.paletteList) {
      return;
    }

    const filteredActions = this.getFilteredPaletteActions();

    if (filteredActions.length === 0) {
      this.paletteList.replaceChildren(this.createEmptyPaletteState());
      return;
    }

    if (this.paletteSelectionIndex >= filteredActions.length) {
      this.paletteSelectionIndex = filteredActions.length - 1;
    }

    const fragment = document.createDocumentFragment();

    filteredActions.forEach((action, index) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "cm-command-palette-item";
      item.dataset.active = index === this.paletteSelectionIndex ? "true" : "false";
      item.setAttribute("role", "option");
      item.setAttribute("aria-selected", index === this.paletteSelectionIndex ? "true" : "false");
      item.textContent = action.label;

      item.addEventListener("mouseenter", () => {
        this.paletteSelectionIndex = index;
        this.renderPaletteList();
      });

      item.addEventListener("click", () => {
        this.executePaletteAction(action);
      });

      fragment.appendChild(item);
    });

    this.paletteList.replaceChildren(fragment);
  }

  private executePaletteAction(action: PaletteAction) {
    const view = this.view;
    if (!view) {
      return;
    }

    action.execute(view);
    this.closePalette(true);
  }

  private createEmptyPaletteState() {
    const emptyState = document.createElement("div");
    emptyState.className = "cm-command-palette-empty";
    emptyState.textContent = "No matching commands";
    return emptyState;
  }

  private createButton(label: string) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "cm-quick-search-button";
    button.textContent = label;
    return button;
  }
}

export function createCodeMirrorQuickAccessExtensions(controller: CodeMirrorQuickAccessController): Extension[] {
  const bindings: KeyBinding[] = [
    {
      key: "Mod-f",
      run: (view) => {
        controller.openSearchBar(view);
        return true;
      },
    },
    {
      key: "Mod-k",
      run: (view) => {
        controller.togglePalette(view);
        return true;
      },
    },
    {
      key: "Escape",
      run: (view) => controller.handleEscape(view),
    },
  ];

  return [
    search({
      top: true,
      createPanel: (view) => controller.createSearchPanel(view),
    }),
    keymap.of(bindings),
  ];
}