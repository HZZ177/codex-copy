import { ArrowUp, LoaderCircle, SendHorizontal, Square, X } from "lucide-react";
import {
  type ClipboardEvent,
  type CompositionEvent,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent,
  type CSSProperties,
  type ReactNode,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";

import type { WorkspaceSearchResult } from "@/runtime";
import type { ConversationRuntimeState } from "@/renderer/stores/conversationStore";
import { getAtQuery, removeAtQuery } from "@/renderer/components/chat/AtFileMenu/atFiles";
import {
  defaultSlashCommands,
  filterSlashCommands,
  getSlashQuery,
  replaceSlashQuery,
  SlashCommandMenu,
  type SlashCommand,
} from "@/renderer/components/chat/SlashCommandMenu";
import { useWorkspaceFileSearch, type WorkspaceFileSearchFn } from "@/renderer/hooks/useWorkspaceFileSearch";

import styles from "./SendBox.module.css";
import {
  fileSelectionReducer,
  initialFileSelectionState,
  type SelectedFile,
  selectedFileFromFile,
  selectedFileFromWorkspace,
} from "./fileSelection";
import {
  initialQuoteSelectionState,
  quoteSelectionReducer,
  type SelectedQuote,
} from "./quoteSelection";
import { useCompositionInput } from "./useCompositionInput";

const LazyAtFileMenu = lazy(() =>
  import("@/renderer/components/chat/AtFileMenu/AtFileMenu").then((module) => ({
    default: module.AtFileMenu,
  })),
);

export interface SendBoxProps {
  value: string;
  runtimeState: ConversationRuntimeState;
  canSend: boolean;
  canStop: boolean;
  placeholder?: string;
  ariaLabel?: string;
  inputLabel?: string;
  className?: string;
  statusText?: string;
  controls?: ReactNode;
  rightControls?: ReactNode;
  contextBar?: ReactNode;
  disabled?: boolean;
  sendLoading?: boolean;
  variant?: "conversation" | "keydex";
  autoFocusKey?: string;
  allowFileSelection?: boolean;
  externalFileRequest?: SendBoxExternalFileRequest | null;
  externalQuoteRequest?: SendBoxExternalQuoteRequest | null;
  leftHint?: ReactNode;
  onChange: (value: string) => void;
  onSend: (files: SelectedFile[], quotes: SelectedQuote[]) => boolean | void | Promise<boolean | void>;
  onStop: () => void;
  onOpenFileReference?: (file: SelectedFile) => void;
  onSlashCommand?: (command: SlashCommand) => void;
  onListWorkspaceDirectory?: (path: string) => Promise<WorkspaceSearchResult[]>;
  onSearchWorkspace?: WorkspaceFileSearchFn;
}

export interface SendBoxExternalFileRequest {
  requestId: number;
  file: SelectedFile;
}

export interface SendBoxExternalQuoteRequest {
  requestId: number;
  quote: SelectedQuote;
}

export function SendBox({
  value,
  runtimeState,
  canSend,
  canStop,
  placeholder = "要求后续变更",
  ariaLabel = "继续对话输入",
  inputLabel = "继续输入",
  className = "",
  statusText = "回车发送",
  controls,
  rightControls,
  contextBar,
  disabled = false,
  sendLoading = false,
  variant = "conversation",
  autoFocusKey,
  allowFileSelection = true,
  externalFileRequest = null,
  externalQuoteRequest = null,
  leftHint = null,
  onChange,
  onSend,
  onStop,
  onOpenFileReference,
  onSlashCommand,
  onListWorkspaceDirectory,
  onSearchWorkspace,
}: SendBoxProps) {
  const inputRef = useRef<HTMLDivElement | null>(null);
  const handledExternalFileRequestIdRef = useRef<number | null>(null);
  const handledExternalQuoteRequestIdRef = useRef<number | null>(null);
  const [focused, setFocused] = useState(false);
  const [slashActiveIndex, setSlashActiveIndex] = useState(0);
  const [dismissedSlashValue, setDismissedSlashValue] = useState<string | null>(null);
  const [atActiveIndex, setAtActiveIndex] = useState(0);
  const [dismissedAtValue, setDismissedAtValue] = useState<string | null>(null);
  const [atBrowseState, setAtBrowseState] = useState<{ path: string; value: string } | null>(null);
  const hadAtDirectoryRequestRef = useRef(false);
  const [atDirectoryResults, setAtDirectoryResults] = useState<WorkspaceSearchResult[]>([]);
  const [atDirectoryLoading, setAtDirectoryLoading] = useState(false);
  const [atDirectoryError, setAtDirectoryError] = useState<string | null>(null);
  const [fileSelection, dispatchFileSelection] = useReducer(
    fileSelectionReducer,
    initialFileSelectionState,
  );
  const [quoteSelection, dispatchQuoteSelection] = useReducer(
    quoteSelectionReducer,
    initialQuoteSelectionState,
  );
  const editorValue = value;
  const busy = isBusy(runtimeState);
  const inputDisabled = disabled || (busy && runtimeState !== "running");
  const canSubmit = !busy && (canSend || fileSelection.files.length > 0 || quoteSelection.quotes.length > 0);
  const showSendLoading = sendLoading && !busy;
  const requestSend = useCallback(() => {
    const result = onSend(fileSelection.files, quoteSelection.quotes);
    void Promise.resolve(result).then((sent) => {
      if (sent !== false) {
        dispatchFileSelection({ type: "clear" });
        dispatchQuoteSelection({ type: "clear" });
      }
    });
  }, [fileSelection.files, onSend, quoteSelection.quotes]);
  const SendIcon = variant === "keydex" ? ArrowUp : SendHorizontal;
  const slashQuery = getSlashQuery(editorValue);
  const slashCommands = useMemo(
    () => (slashQuery === null ? [] : filterSlashCommands(defaultSlashCommands, slashQuery)),
    [slashQuery],
  );
  const slashOpen = slashQuery !== null && dismissedSlashValue !== editorValue && !busy;
  const atQuery = getAtQuery(editorValue);
  const atBrowsePath = atBrowseState && atBrowseState.value === editorValue ? atBrowseState.path : null;
  const atOpen =
    allowFileSelection &&
    Boolean(onSearchWorkspace || onListWorkspaceDirectory) &&
    atQuery !== null &&
    dismissedAtValue !== editorValue &&
    !busy &&
    !slashOpen;
  const atDirectoryPath =
    atOpen && onListWorkspaceDirectory && (atBrowsePath !== null || !atQuery) ? atBrowsePath ?? "" : null;
  const atSearchQuery = atDirectoryPath === null ? atQuery ?? "" : "";
  const atSearchState = useWorkspaceFileSearch({
    enabled: atOpen && atDirectoryPath === null && Boolean(onSearchWorkspace),
    query: atSearchQuery,
    search: onSearchWorkspace,
  });
  const atResults = atDirectoryPath === null ? atSearchState.results : atDirectoryResults;
  const atLoading = atDirectoryPath === null ? atSearchState.loading : atDirectoryLoading;
  const atError = atDirectoryPath === null ? atSearchState.error : atDirectoryError;
  const composition = useCompositionInput({
    disabled: inputDisabled || !canSubmit,
    onSubmit: requestSend,
  });

  useEffect(() => {
    setSlashActiveIndex(0);
  }, [slashQuery]);

  useEffect(() => {
    setAtActiveIndex(0);
  }, [atDirectoryPath, atQuery]);

  useEffect(() => {
    if (!atOpen) {
      setAtBrowseState(null);
    }
  }, [atOpen]);

  useEffect(() => {
    if (atQuery === null && dismissedAtValue !== null) {
      setDismissedAtValue(null);
    }
  }, [atQuery, dismissedAtValue]);

  useEffect(() => {
    if (atBrowseState && atBrowseState.value !== editorValue && atQuery !== "") {
      setAtBrowseState(null);
    }
  }, [atBrowseState, atQuery, editorValue]);

  useEffect(() => {
    if (!externalFileRequest || !allowFileSelection) {
      return;
    }
    if (handledExternalFileRequestIdRef.current === externalFileRequest.requestId) {
      return;
    }
    handledExternalFileRequestIdRef.current = externalFileRequest.requestId;
    dispatchFileSelection({ type: "add", file: externalFileRequest.file });
    inputRef.current?.focus();
  }, [allowFileSelection, externalFileRequest]);

  useEffect(() => {
    if (!externalQuoteRequest) {
      return;
    }
    if (handledExternalQuoteRequestIdRef.current === externalQuoteRequest.requestId) {
      return;
    }
    handledExternalQuoteRequestIdRef.current = externalQuoteRequest.requestId;
    dispatchQuoteSelection({ type: "add", quote: externalQuoteRequest.quote });
    inputRef.current?.focus();
  }, [externalQuoteRequest]);

  useEffect(() => {
    let active = true;
    if (!atOpen || atDirectoryPath === null || !onListWorkspaceDirectory) {
      if (hadAtDirectoryRequestRef.current) {
        hadAtDirectoryRequestRef.current = false;
        setAtDirectoryResults([]);
        setAtDirectoryLoading(false);
        setAtDirectoryError(null);
      }
      return;
    }
    hadAtDirectoryRequestRef.current = true;
    setAtDirectoryResults([]);
    setAtDirectoryLoading(true);
    setAtDirectoryError(null);
    void onListWorkspaceDirectory(atDirectoryPath)
      .then((results) => {
        if (active) {
          setAtDirectoryResults(results);
        }
      })
      .catch((reason: unknown) => {
        if (active) {
          setAtDirectoryResults([]);
          setAtDirectoryError(errorMessage(reason));
        }
      })
      .finally(() => {
        if (active) {
          setAtDirectoryLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [atDirectoryPath, atOpen, onListWorkspaceDirectory]);

  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input) {
      return;
    }
    resizeEditableInput(input);
  }, [editorValue]);

  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!autoFocusKey || inputDisabled || !input) {
      return;
    }
    focusEditableInput(input);
  }, [autoFocusKey, inputDisabled]);

  const selectSlashCommand = (command: SlashCommand) => {
    onSlashCommand?.(command);
    if (command.id === "clear") {
      onChange("");
      dispatchQuoteSelection({ type: "clear" });
      return;
    }
    onChange(replaceSlashQuery(editorValue, `${command.label} `));
  };

  const selectFile = (result: WorkspaceSearchResult) => {
    if (result.type === "directory" && onListWorkspaceDirectory) {
      setAtBrowseState({ path: result.path, value: editorValue });
      return;
    }
    dispatchFileSelection({ type: "add", file: selectedFileFromWorkspace(result) });
    const nextValue = removeAtQuery(editorValue);
    setAtBrowseState(null);
    setDismissedAtValue(nextValue);
    onChange(nextValue);
  };

  const navigateAtDirectory = (path: string) => {
    setAtBrowseState({ path, value: editorValue });
  };

  const removeFile = (path: string) => {
    dispatchFileSelection({ type: "remove", path });
  };

  const addFiles = (files: FileList | null, source: "dropped" | "pasted") => {
    if (!allowFileSelection) {
      return;
    }
    if (!files?.length) {
      return;
    }
    let added = 0;
    Array.from(files).forEach((file) => {
      const selected = selectedFileFromFile(file, source);
      if (!selected) {
        return;
      }
      added += 1;
      dispatchFileSelection({ type: "add", file: selected });
    });
    if (!added) {
      dispatchFileSelection({ type: "error", error: "不支持的文件，无法获取路径" });
    }
  };

  const handleDragOver = (event: DragEvent<HTMLFormElement>) => {
    if (!allowFileSelection) {
      return;
    }
    if (!event.dataTransfer.types.includes("Files")) {
      return;
    }
    event.preventDefault();
    dispatchFileSelection({ type: "dragging", dragging: true });
  };

  const handleDrop = (event: DragEvent<HTMLFormElement>) => {
    if (!allowFileSelection) {
      return;
    }
    if (!event.dataTransfer.types.includes("Files")) {
      return;
    }
    event.preventDefault();
    dispatchFileSelection({ type: "dragging", dragging: false });
    addFiles(event.dataTransfer.files, "dropped");
  };

  const handlePaste = (event: ClipboardEvent<HTMLDivElement>) => {
    if (allowFileSelection && event.clipboardData.files.length) {
      event.preventDefault();
      addFiles(event.clipboardData.files, "pasted");
      return;
    }
    pastePlainText(event);
    syncEditableChange(event.currentTarget, (nextValue) => {
      onChange(nextValue);
    });
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (slashOpen) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSlashActiveIndex((index) => Math.min(index + 1, Math.max(slashCommands.length - 1, 0)));
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSlashActiveIndex((index) => Math.max(index - 1, 0));
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setDismissedSlashValue(editorValue);
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        const command = slashCommands[slashActiveIndex];
        if (command) {
          selectSlashCommand(command);
        }
        return;
      }
    }
    if (atOpen) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setAtActiveIndex((index) => nextMenuIndex(index, atResults.length, 1));
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setAtActiveIndex((index) => nextMenuIndex(index, atResults.length, -1));
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setDismissedAtValue(editorValue);
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        const result = atResults[atActiveIndex];
        if (result) {
          selectFile(result);
        }
        return;
      }
    }
    if (event.key === "Enter" && event.shiftKey) {
      event.preventDefault();
      insertPlainText("\n");
      syncEditableChange(event.currentTarget, (nextValue) => {
        onChange(nextValue);
      });
      resizeEditableInput(event.currentTarget);
      scrollEditableToBottom(event.currentTarget);
      return;
    }
    composition.handleKeyDown(event);
  };

  const handleEditorInput = useCallback(
    (event: FormEvent<HTMLDivElement>) => {
      syncEditableChange(event.currentTarget, (nextValue) => {
        onChange(nextValue);
      });
    },
    [onChange],
  );

  const handleQuoteRemove = useCallback(
    (quoteId: string) => {
      dispatchQuoteSelection({ type: "remove", id: quoteId });
    },
    [],
  );

  return (
    <form
      className={[styles.root, className].filter(Boolean).join(" ")}
      data-sendbox-root="true"
      data-focused={focused ? "true" : "false"}
      data-dragging={fileSelection.dragging ? "true" : "false"}
      data-state={runtimeState}
      data-variant={variant}
      aria-label={ariaLabel}
      onDragLeave={() => dispatchFileSelection({ type: "dragging", dragging: false })}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onSubmit={(event) => {
        event.preventDefault();
        if (!busy && canSubmit) {
          requestSend();
        }
      }}
    >
      {quoteSelection.quotes.length || fileSelection.files.length ? (
        <div className={styles.fileChips} aria-label="已添加上下文">
          {quoteSelection.quotes.map((quote, index) => (
            <QuoteContextChip
              key={quote.id}
              quote={quote}
              index={index}
              onRemove={() => handleQuoteRemove(quote.id)}
            />
          ))}
          {fileSelection.files.map((file) => (
            <FileContextChip
              key={file.path}
              file={file}
              onOpen={onOpenFileReference}
              onRemove={() => removeFile(file.path)}
            />
          ))}
        </div>
      ) : null}

      <ContentEditableInput
        refSetter={(node) => {
          inputRef.current = node;
        }}
        value={value}
        inputLabel={inputLabel}
        placeholder={placeholder}
        disabled={inputDisabled}
        className={styles.input}
        onBlur={() => setFocused(false)}
        onChange={handleEditorInput}
        onCompositionEnd={composition.handleCompositionEnd}
        onCompositionStart={composition.handleCompositionStart}
        onFocus={() => setFocused(true)}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
      />

      {slashOpen ? (
        <SlashCommandMenu commands={slashCommands} activeIndex={slashActiveIndex} onSelect={selectSlashCommand} />
      ) : null}
      {atOpen ? (
        <Suspense fallback={null}>
          <LazyAtFileMenu
            results={atResults}
            activeIndex={atActiveIndex}
            loading={atLoading}
            error={atError}
            directoryPath={atDirectoryPath}
            query={atQuery ?? ""}
            onNavigateDirectory={navigateAtDirectory}
            onSelect={selectFile}
          />
        </Suspense>
      ) : null}

      {fileSelection.error ? <div className={styles.fileError}>{fileSelection.error}</div> : null}

      <div className={styles.toolbar}>
        <div className={styles.leftActions}>
          {controls}
          {leftHint}
        </div>

        <div className={styles.rightActions}>
          {statusText ? <span className={styles.statusText}>{statusText}</span> : null}
          {rightControls}
          {busy ? (
            <button className={styles.stopButton} type="button" aria-label="停止" disabled={!canStop} onClick={onStop}>
              <Square size={variant === "keydex" ? 12 : 13} />
            </button>
          ) : (
            <button
              className={styles.sendButton}
              type="submit"
              aria-label={showSendLoading ? "正在准备发送" : "发送"}
              data-loading={showSendLoading ? "true" : "false"}
              disabled={showSendLoading || !canSubmit}
            >
              {showSendLoading ? <LoaderCircle className={styles.sendSpinner} size={17} /> : <SendIcon size={17} />}
            </button>
          )}
        </div>
      </div>

      {contextBar ? <div className={styles.contextBar}>{contextBar}</div> : null}
    </form>
  );
}

function isBusy(state: ConversationRuntimeState): boolean {
  return state === "starting" || state === "running" || state === "waiting_approval" || state === "cancelling";
}

function nextMenuIndex(index: number, length: number, delta: 1 | -1): number {
  if (length <= 0) {
    return 0;
  }
  return (index + delta + length) % length;
}

function QuoteContextChip({
  quote,
  index,
  onRemove,
}: {
  quote: SelectedQuote;
  index: number;
  onRemove: () => void;
}) {
  const showTimerRef = useRef<number | null>(null);
  const hideTimerRef = useRef<number | null>(null);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const hoverPlacement = useHoverCardPlacement(open, QUOTE_HOVER_CARD_MAX_WIDTH);

  const clearShowTimer = useCallback(() => {
    if (showTimerRef.current === null) {
      return;
    }
    window.clearTimeout(showTimerRef.current);
    showTimerRef.current = null;
  }, []);

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current === null) {
      return;
    }
    window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = null;
  }, []);

  const scheduleOpen = useCallback(() => {
    clearShowTimer();
    clearHideTimer();
    showTimerRef.current = window.setTimeout(() => {
      showTimerRef.current = null;
      setOpen(true);
    }, QUOTE_CARD_SHOW_DELAY_MS);
  }, [clearHideTimer, clearShowTimer]);

  const scheduleClose = useCallback(() => {
    clearShowTimer();
    clearHideTimer();
    hideTimerRef.current = window.setTimeout(() => {
      hideTimerRef.current = null;
      setOpen(false);
      setCopied(false);
    }, 120);
  }, [clearHideTimer, clearShowTimer]);

  useEffect(
    () => () => {
      clearShowTimer();
      clearHideTimer();
    },
    [clearHideTimer, clearShowTimer],
  );

  const handleCopyQuote = async () => {
    await copyToClipboard(quote.text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };
  const chipLabel = quoteChipLabel(quote);
  const lineLabel = quote.file ? quoteLineLabel(quote.file.lineStart, quote.file.lineEnd) : null;

  return (
    <span
      ref={hoverPlacement.wrapperRef}
      className={styles.quoteChipWrapper}
      data-sendbox-hover-anchor="quote"
      onBlur={(event) => {
        const relatedTarget = event.relatedTarget instanceof Node ? event.relatedTarget : null;
        if (!event.currentTarget.contains(relatedTarget)) {
          scheduleClose();
        }
      }}
      onFocus={scheduleOpen}
      onMouseEnter={scheduleOpen}
      onMouseLeave={scheduleClose}
    >
      <span
        className={styles.quoteInputChip}
        tabIndex={0}
        aria-label={`${chipLabel}：${quote.preview}`}
        data-quote-index={index}
        data-source-quote={quote.file ? "true" : "false"}
      >
        <span className={styles.quoteInputChipLabel}>{chipLabel}</span>
        <button
          className={styles.quoteInputChipRemove}
          type="button"
          aria-label={`删除${chipLabel} ${quote.preview}`}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onRemove();
          }}
        >
          <X size={11} strokeWidth={2} />
        </button>
      </span>
      {open ? (
        <span
          ref={hoverPlacement.cardRef}
          className={styles.quoteHoverCard}
          data-quote-hover-card="true"
          style={hoverPlacement.style}
          onMouseDown={(event) => event.preventDefault()}
          onMouseEnter={clearHideTimer}
          onMouseLeave={scheduleClose}
        >
          {quote.file ? (
            <span className={styles.quoteHoverMeta}>
              <span>{quote.file.path}</span>
              {lineLabel ? <span>{lineLabel}</span> : null}
            </span>
          ) : null}
          <span className={styles.quoteHoverBody}>{quote.text}</span>
          <span className={styles.quoteHoverActions}>
            <button type="button" onClick={handleCopyQuote}>
              {copied ? "已复制" : "复制"}
            </button>
            <button type="button" data-danger="true" onClick={onRemove}>
              删除
            </button>
          </span>
        </span>
      ) : null}
    </span>
  );
}

function quoteChipLabel(quote: SelectedQuote): string {
  if (!quote.file) {
    return "引用片段";
  }
  const name = quote.file.name || fileName(quote.file.path);
  const lineLabel = quoteLineLabel(quote.file.lineStart, quote.file.lineEnd);
  return lineLabel ? `${name} · ${lineLabel}` : `${name} · 引用`;
}

function quoteLineLabel(start?: number | null, end?: number | null): string | null {
  if (!start || !end) {
    return null;
  }
  return start === end ? `L${start}` : `L${start}-L${end}`;
}

function fileName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() || path;
}

function FileContextChip({
  file,
  onOpen,
  onRemove,
}: {
  file: SelectedFile;
  onOpen?: (file: SelectedFile) => void;
  onRemove: () => void;
}) {
  const showTimerRef = useRef<number | null>(null);
  const hideTimerRef = useRef<number | null>(null);
  const [open, setOpen] = useState(false);
  const hoverPlacement = useHoverCardPlacement(open, FILE_HOVER_CARD_MAX_WIDTH);
  const fileKindLabel = file.type === "directory" ? "工作区目录" : "工作区文件";
  const chipLabel = fileName(file.name || file.path);

  const clearShowTimer = useCallback(() => {
    if (showTimerRef.current === null) {
      return;
    }
    window.clearTimeout(showTimerRef.current);
    showTimerRef.current = null;
  }, []);

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current === null) {
      return;
    }
    window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = null;
  }, []);

  const scheduleOpen = useCallback(() => {
    clearShowTimer();
    clearHideTimer();
    showTimerRef.current = window.setTimeout(() => {
      showTimerRef.current = null;
      setOpen(true);
    }, QUOTE_CARD_SHOW_DELAY_MS);
  }, [clearHideTimer, clearShowTimer]);

  const scheduleClose = useCallback(() => {
    clearShowTimer();
    clearHideTimer();
    hideTimerRef.current = window.setTimeout(() => {
      hideTimerRef.current = null;
      setOpen(false);
    }, 120);
  }, [clearHideTimer, clearShowTimer]);

  useEffect(
    () => () => {
      clearShowTimer();
      clearHideTimer();
    },
    [clearHideTimer, clearShowTimer],
  );

  return (
    <span
      ref={hoverPlacement.wrapperRef}
      className={styles.fileChipWrapper}
      data-sendbox-hover-anchor="file"
      onBlur={(event) => {
        const relatedTarget = event.relatedTarget instanceof Node ? event.relatedTarget : null;
        if (!event.currentTarget.contains(relatedTarget)) {
          scheduleClose();
        }
      }}
      onFocus={scheduleOpen}
      onMouseEnter={scheduleOpen}
      onMouseLeave={scheduleClose}
    >
      <span className={styles.fileChip}>
        <button
          className={styles.fileChipMain}
          type="button"
          aria-label={`打开文件引用 ${file.path}`}
          disabled={!onOpen}
          onClick={() => onOpen?.(file)}
        >
          <span className={styles.fileChipText}>{chipLabel}</span>
        </button>
        <button
          className={styles.fileChipRemove}
          type="button"
          aria-label={`移除文件引用 ${file.path}`}
          onClick={onRemove}
        >
          <X size={12} strokeWidth={2} />
        </button>
      </span>
      {open ? (
        <span
          ref={hoverPlacement.cardRef}
          className={styles.filePathHoverCard}
          data-file-path-hover-card="true"
          style={hoverPlacement.style}
          onMouseDown={(event) => event.preventDefault()}
          onMouseEnter={clearHideTimer}
          onMouseLeave={scheduleClose}
        >
          <span className={styles.filePathHoverTitle} data-file-path-hover-title="true">
            {file.path}
          </span>
          <span className={styles.filePathHoverMeta}>{fileKindLabel}</span>
        </span>
      ) : null}
    </span>
  );
}

interface HoverCardPlacement {
  wrapperRef: (node: HTMLSpanElement | null) => void;
  cardRef: (node: HTMLSpanElement | null) => void;
  style: CSSProperties | undefined;
}

function useHoverCardPlacement(open: boolean, preferredMaxWidth: number): HoverCardPlacement {
  const wrapperRef = useRef<HTMLSpanElement | null>(null);
  const cardRef = useRef<HTMLSpanElement | null>(null);
  const [style, setStyle] = useState<CSSProperties | undefined>();

  const setWrapperRef = useCallback((node: HTMLSpanElement | null) => {
    wrapperRef.current = node;
  }, []);

  const setCardRef = useCallback((node: HTMLSpanElement | null) => {
    cardRef.current = node;
  }, []);

  const updatePlacement = useCallback(() => {
    const wrapper = wrapperRef.current;
    const card = cardRef.current;
    if (!wrapper || !card) {
      return;
    }

    const wrapperRect = wrapper.getBoundingClientRect();
    const rootRect = wrapper.closest<HTMLElement>("[data-sendbox-root='true']")?.getBoundingClientRect();
    const boundaryLeft = Math.max(HOVER_CARD_EDGE_GAP, (rootRect?.left ?? 0) + HOVER_CARD_EDGE_GAP);
    const boundaryRight = Math.min(
      window.innerWidth - HOVER_CARD_EDGE_GAP,
      (rootRect?.right ?? window.innerWidth) - HOVER_CARD_EDGE_GAP,
    );
    const boundaryWidth = Math.max(96, boundaryRight - boundaryLeft);
    const maxWidth = Math.min(preferredMaxWidth, boundaryWidth);
    const measuredWidth = Math.min(Math.max(96, card.getBoundingClientRect().width || maxWidth), maxWidth);
    const anchorCenter = wrapperRect.left + wrapperRect.width / 2;
    const leftInViewport = clamp(anchorCenter - measuredWidth / 2, boundaryLeft, boundaryRight - measuredWidth);
    const arrowLeft = clamp(
      anchorCenter - leftInViewport,
      Math.min(HOVER_CARD_ARROW_PADDING, measuredWidth / 2),
      Math.max(HOVER_CARD_ARROW_PADDING, measuredWidth - HOVER_CARD_ARROW_PADDING),
    );

    setStyle({
      left: `${leftInViewport - wrapperRect.left}px`,
      maxWidth: `${maxWidth}px`,
      "--sendbox-hover-card-arrow-left": `${arrowLeft}px`,
      "--sendbox-hover-card-translate-x": "0px",
    } as CSSProperties);
  }, [preferredMaxWidth]);

  useLayoutEffect(() => {
    if (!open) {
      setStyle(undefined);
      return;
    }
    updatePlacement();
    window.addEventListener("resize", updatePlacement);
    window.addEventListener("scroll", updatePlacement, true);
    return () => {
      window.removeEventListener("resize", updatePlacement);
      window.removeEventListener("scroll", updatePlacement, true);
    };
  }, [open, updatePlacement]);

  return { wrapperRef: setWrapperRef, cardRef: setCardRef, style };
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}

interface ContentEditableInputProps {
  value: string;
  inputLabel: string;
  placeholder: string;
  disabled: boolean;
  className: string;
  refSetter: (node: HTMLDivElement | null) => void;
  onBlur: () => void;
  onChange: (event: FormEvent<HTMLDivElement>) => void;
  onCompositionEnd: (event: CompositionEvent<HTMLElement>) => void;
  onCompositionStart: (event: CompositionEvent<HTMLElement>) => void;
  onFocus: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
  onPaste: (event: ClipboardEvent<HTMLDivElement>) => void;
}

function ContentEditableInput({
  value,
  inputLabel,
  placeholder,
  disabled,
  className,
  refSetter,
  onBlur,
  onChange,
  onCompositionEnd,
  onCompositionStart,
  onFocus,
  onKeyDown,
  onPaste,
}: ContentEditableInputProps) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const setEditorRef = useCallback(
    (node: HTMLDivElement | null) => {
      editorRef.current = node;
      refSetter(node);
    },
    [refSetter],
  );

  useLayoutEffect(() => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }
    if (readEditorValue(editor) !== value) {
      renderEditorValue(editor, value);
    }
    editor.dataset.empty = value ? "false" : "true";
  }, [value]);

  return (
    <div
      ref={setEditorRef}
      className={`${className} ${styles.richInput}`}
      role="textbox"
      aria-label={inputLabel}
      aria-multiline="true"
      aria-disabled={disabled}
      aria-placeholder={placeholder}
      contentEditable={!disabled}
      data-empty={value ? "false" : "true"}
      data-placeholder={placeholder}
      suppressContentEditableWarning
      tabIndex={disabled ? -1 : 0}
      onBlur={onBlur}
      onCompositionEnd={onCompositionEnd}
      onCompositionStart={onCompositionStart}
      onFocus={onFocus}
      onInput={onChange}
      onKeyDown={onKeyDown}
      onPaste={onPaste}
    />
  );
}

const QUOTE_CARD_SHOW_DELAY_MS = 200;
const QUOTE_HOVER_CARD_MAX_WIDTH = 280;
const FILE_HOVER_CARD_MAX_WIDTH = 420;
const HOVER_CARD_EDGE_GAP = 12;
const HOVER_CARD_ARROW_PADDING = 16;

function renderEditorValue(editor: HTMLDivElement, value: string) {
  editor.replaceChildren(...(value ? [document.createTextNode(value)] : []));
}

function syncEditableChange(editor: HTMLElement, onChange: (value: string) => void) {
  const nextValue = readEditorValue(editor);
  editor.dataset.empty = nextValue ? "false" : "true";
  onChange(nextValue);
}

function readEditorValue(root: Node): string {
  if (!hasMeaningfulEditorContent(root)) {
    return "";
  }
  let value = "";
  root.childNodes.forEach((node) => {
    value += readEditorNodeValue(node);
  });
  return normalizeEditorText(value);
}

function readEditorNodeValue(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent ?? "";
  }
  if (!(node instanceof HTMLElement)) {
    return "";
  }
  if (node.tagName === "BR") {
    return "\n";
  }
  const childValue = readEditorValue(node);
  return isBlockEditorNode(node) && childValue ? `${childValue}\n` : childValue;
}

function isBlockEditorNode(node: HTMLElement): boolean {
  return node.tagName === "DIV" || node.tagName === "P";
}

function hasMeaningfulEditorContent(node: Node): boolean {
  if (node.nodeType === Node.TEXT_NODE) {
    return normalizeEditorText(node.textContent ?? "").length > 0;
  }
  if (!(node instanceof HTMLElement)) {
    return false;
  }
  if (node.tagName === "BR") {
    return false;
  }
  return Array.from(node.childNodes).some((child) => hasMeaningfulEditorContent(child));
}

function normalizeEditorText(text: string): string {
  return text.replace(/\u00a0/g, " ");
}

function resizeEditableInput(input: HTMLElement) {
  input.style.height = "0px";
  input.style.height = `${Math.min(Math.max(input.scrollHeight, 44), 188)}px`;
}

function scrollEditableToBottom(input: HTMLElement) {
  input.scrollTop = input.scrollHeight;
  window.requestAnimationFrame(() => {
    input.scrollTop = input.scrollHeight;
  });
}

function focusEditableInput(input: HTMLElement) {
  input.focus({ preventScroll: true });
  const selection = window.getSelection();
  if (!selection) {
    return;
  }
  const range = document.createRange();
  range.selectNodeContents(input);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

function pastePlainText(event: ClipboardEvent<HTMLElement>) {
  const text = event.clipboardData.getData("text/plain");
  event.preventDefault();
  insertPlainText(text);
}

function insertPlainText(text: string) {
  if (!text) {
    return;
  }
  if (typeof document.execCommand === "function" && document.execCommand("insertText", false, text)) {
    return;
  }
  const selection = window.getSelection();
  if (!selection?.rangeCount) {
    return;
  }
  const range = selection.getRangeAt(0);
  range.deleteContents();
  const textNode = document.createTextNode(text);
  range.insertNode(textNode);
  range.setStartAfter(textNode);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

async function copyToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  document.execCommand("copy", false, text);
}

function errorMessage(reason: unknown): string {
  if (reason instanceof Error && reason.message) {
    return reason.message;
  }
  if (reason && typeof reason === "object" && typeof (reason as { message?: unknown }).message === "string") {
    return (reason as { message: string }).message;
  }
  return "工作区搜索失败";
}
