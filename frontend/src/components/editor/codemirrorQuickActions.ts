import type { Extension } from "@codemirror/state";
import { selectAll, undo, redo } from "@codemirror/commands";
import {
  closeSearchPanel,
  findNext,
  findPrevious,
  getSearchQuery,
  openSearchPanel,
  search,
  searchPanelOpen,
  SearchQuery,
  setSearchQuery,
} from "@codemirror/search";
import { keymap, type EditorView, type KeyBinding, type Panel } from "@codemirror/view";

type PaletteActionId =
  | "find-next"
  | "find-previous"
  | "undo"
  | "redo"
  | "select-all"
  | "toggle-search-bar";

type PaletteAction = {
  id: PaletteActionId;
  label: string;
  execute: (view: EditorView) => void;
};

const paletteActions: PaletteAction[] = [
  { id: "find-next", label: "Find Next", execute: (view) => findNext(view) },
  { id: "find-previous", label: "Find Previous", execute: (view) => findPrevious(view) },
  { id: "undo", label: "Undo", execute: (view) => undo(view) },
  { id: "redo", label: "Redo", execute: (view) => redo(view) },
  { id: "select-all", label: "Select All", execute: (view) => selectAll(view) },
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