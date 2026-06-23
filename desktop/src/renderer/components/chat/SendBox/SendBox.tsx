import { ArrowUp, SendHorizontal, Square } from "lucide-react";
import {
  type ClipboardEvent,
  type CompositionEvent,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
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
import { AtFileMenu, getAtQuery, replaceAtQuery } from "@/renderer/components/chat/AtFileMenu";
import {
  defaultSlashCommands,
  filterSlashCommands,
  getSlashQuery,
  replaceSlashQuery,
  SlashCommandMenu,
  type SlashCommand,
} from "@/renderer/components/chat/SlashCommandMenu";
import {
  parseQuoteMarkers,
  quoteMarkerPreview,
  removeQuoteMarkerAtIndex,
} from "@/renderer/utils/quoteMarkers";

import styles from "./SendBox.module.css";
import {
  fileSelectionReducer,
  initialFileSelectionState,
  selectedFileFromFile,
  selectedFileFromWorkspace,
} from "./fileSelection";
import { useCompositionInput } from "./useCompositionInput";

export interface SendBoxProps {
  value: string;
  runtimeState: ConversationRuntimeState;
  canSend: boolean;
  canStop: boolean;
  placeholder?: string;
  ariaLabel?: string;
  inputLabel?: string;
  statusText?: string;
  controls?: ReactNode;
  rightControls?: ReactNode;
  contextBar?: ReactNode;
  disabled?: boolean;
  variant?: "conversation" | "codex";
  allowFileSelection?: boolean;
  leftHint?: ReactNode;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  onSlashCommand?: (command: SlashCommand) => void;
  onSearchWorkspace?: (query: string) => Promise<WorkspaceSearchResult[]>;
}

export function SendBox({
  value,
  runtimeState,
  canSend,
  canStop,
  placeholder = "要求后续变更",
  ariaLabel = "继续对话输入",
  inputLabel = "继续输入",
  statusText = "回车发送",
  controls,
  rightControls,
  contextBar,
  disabled = false,
  variant = "conversation",
  allowFileSelection = true,
  leftHint = null,
  onChange,
  onSend,
  onStop,
  onSlashCommand,
  onSearchWorkspace,
}: SendBoxProps) {
  const inputRef = useRef<HTMLDivElement | null>(null);
  const [focused, setFocused] = useState(false);
  const [slashActiveIndex, setSlashActiveIndex] = useState(0);
  const [dismissedSlashValue, setDismissedSlashValue] = useState<string | null>(null);
  const [atActiveIndex, setAtActiveIndex] = useState(0);
  const [dismissedAtValue, setDismissedAtValue] = useState<string | null>(null);
  const [atResults, setAtResults] = useState<WorkspaceSearchResult[]>([]);
  const [atLoading, setAtLoading] = useState(false);
  const [atError, setAtError] = useState<string | null>(null);
  const [fileSelection, dispatchFileSelection] = useReducer(
    fileSelectionReducer,
    initialFileSelectionState,
  );
  const busy = isBusy(runtimeState);
  const inputDisabled = disabled || busy;
  const SendIcon = variant === "codex" ? ArrowUp : SendHorizontal;
  const slashQuery = getSlashQuery(value);
  const slashCommands = useMemo(
    () => (slashQuery === null ? [] : filterSlashCommands(defaultSlashCommands, slashQuery)),
    [slashQuery],
  );
  const slashOpen = slashQuery !== null && dismissedSlashValue !== value && !busy;
  const atQuery = getAtQuery(value);
  const atOpen =
    allowFileSelection && Boolean(onSearchWorkspace) && atQuery !== null && dismissedAtValue !== value && !busy && !slashOpen;
  const composition = useCompositionInput({
    disabled: inputDisabled || !canSend,
    onSubmit: onSend,
  });

  useEffect(() => {
    setSlashActiveIndex(0);
  }, [slashQuery]);

  useEffect(() => {
    setAtActiveIndex(0);
  }, [atQuery]);

  useEffect(() => {
    let active = true;
    if (!atOpen) {
      setAtResults([]);
      setAtLoading(false);
      setAtError(null);
      return;
    }
    if (!atQuery) {
      setAtResults([]);
      setAtLoading(false);
      setAtError(null);
      return;
    }
    if (!onSearchWorkspace) {
      setAtResults([]);
      setAtLoading(false);
      setAtError(null);
      return;
    }
    setAtLoading(true);
    setAtError(null);
    void onSearchWorkspace(atQuery)
      .then((results) => {
        if (!active) {
          return;
        }
        setAtResults(results);
      })
      .catch((reason: unknown) => {
        if (!active) {
          return;
        }
        setAtResults([]);
        setAtError(errorMessage(reason));
      })
      .finally(() => {
        if (active) {
          setAtLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [atOpen, atQuery, onSearchWorkspace]);

  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input) {
      return;
    }
    input.style.height = "0px";
    input.style.height = `${Math.min(Math.max(input.scrollHeight, 44), 188)}px`;
  }, [value]);

  const selectSlashCommand = (command: SlashCommand) => {
    onSlashCommand?.(command);
    if (command.id === "clear") {
      onChange("");
      return;
    }
    onChange(replaceSlashQuery(value, `${command.label} `));
  };

  const selectFile = (result: WorkspaceSearchResult) => {
    dispatchFileSelection({ type: "add", file: selectedFileFromWorkspace(result) });
    onChange(replaceAtQuery(value, result));
  };

  const removeFile = (path: string) => {
    dispatchFileSelection({ type: "remove", path });
    onChange(value.replace(`@${path} `, "").replace(`@${path}`, ""));
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
    syncEditableChange(event.currentTarget, onChange);
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
        setDismissedSlashValue(value);
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
        setAtActiveIndex((index) => Math.min(index + 1, Math.max(atResults.length - 1, 0)));
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setAtActiveIndex((index) => Math.max(index - 1, 0));
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setDismissedAtValue(value);
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
      syncEditableChange(event.currentTarget, onChange);
      return;
    }
    composition.handleKeyDown(event);
  };

  const handleEditorInput = useCallback(
    (event: FormEvent<HTMLDivElement>) => {
      syncEditableChange(event.currentTarget, onChange);
    },
    [onChange],
  );

  const handleQuoteRemove = useCallback(
    (quoteIndex: number) => {
      onChange(removeQuoteMarkerAtIndex(value, quoteIndex));
    },
    [onChange, value],
  );

  return (
    <form
      className={styles.root}
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
        if (!busy) {
          onSend();
        }
      }}
    >
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
        onQuoteRemove={handleQuoteRemove}
      />

      {slashOpen ? (
        <SlashCommandMenu commands={slashCommands} activeIndex={slashActiveIndex} onSelect={selectSlashCommand} />
      ) : null}
      {atOpen ? (
        <AtFileMenu
          results={atResults}
          activeIndex={atActiveIndex}
          loading={atLoading}
          error={atError}
          query={atQuery ?? ""}
          onSelect={selectFile}
        />
      ) : null}

      {fileSelection.files.length ? (
        <div className={styles.fileChips} aria-label="已选择文件">
          {fileSelection.files.map((file) => (
            <button
              className={styles.fileChip}
              type="button"
              aria-label={`移除文件 ${file.path}`}
              key={file.path}
              onClick={() => removeFile(file.path)}
            >
              <span>{file.path}</span>
            </button>
          ))}
        </div>
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
              <Square size={13} />
            </button>
          ) : (
            <button className={styles.sendButton} type="submit" aria-label="发送" disabled={!canSend}>
              <SendIcon size={variant === "codex" ? 19 : 17} />
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
  onPaste: (event: ClipboardEvent<HTMLElement>) => void;
  onQuoteRemove: (quoteIndex: number) => void;
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
  onQuoteRemove,
}: ContentEditableInputProps) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const showCardTimerRef = useRef<number | null>(null);
  const hideCardTimerRef = useRef<number | null>(null);
  const [activeCard, setActiveCard] = useState<{
    index: number;
    text: string;
    left: number;
    top: number;
  } | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const setEditorRef = useCallback(
    (node: HTMLDivElement | null) => {
      editorRef.current = node;
      refSetter(node);
    },
    [refSetter],
  );

  useEffect(
    () => () => {
      if (showCardTimerRef.current !== null) {
        window.clearTimeout(showCardTimerRef.current);
      }
      if (hideCardTimerRef.current !== null) {
        window.clearTimeout(hideCardTimerRef.current);
      }
    },
    [],
  );

  useLayoutEffect(() => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }
    if (readQuoteEditorValue(editor) !== value) {
      renderQuoteEditorValue(editor, value);
    }
    editor.dataset.empty = value ? "false" : "true";
  }, [value]);

  const clearShowCardTimer = useCallback(() => {
    if (showCardTimerRef.current === null) {
      return;
    }
    window.clearTimeout(showCardTimerRef.current);
    showCardTimerRef.current = null;
  }, []);

  const clearHideCardTimer = useCallback(() => {
    if (hideCardTimerRef.current === null) {
      return;
    }
    window.clearTimeout(hideCardTimerRef.current);
    hideCardTimerRef.current = null;
  }, []);

  const scheduleHideCard = useCallback(() => {
    clearShowCardTimer();
    clearHideCardTimer();
    hideCardTimerRef.current = window.setTimeout(() => {
      hideCardTimerRef.current = null;
      setActiveCard(null);
      setCopiedIndex(null);
    }, 120);
  }, [clearHideCardTimer, clearShowCardTimer]);

  const showQuoteCard = useCallback(
    (target: Element | null) => {
      const chip = target?.closest("[data-quote-index]");
      const editor = editorRef.current;
      if (!(chip instanceof HTMLElement) || !editor) {
        return;
      }
      const quoteIndex = Number(chip.dataset.quoteIndex);
      const quoteText = chip.dataset.quoteText ?? "";
      const root = editor.closest("form");
      if (!Number.isFinite(quoteIndex) || !quoteText || !(root instanceof HTMLElement)) {
        return;
      }
      clearHideCardTimer();
      const chipRect = chip.getBoundingClientRect();
      const rootRect = root.getBoundingClientRect();
      setActiveCard({
        index: quoteIndex,
        text: quoteText,
        left: chipRect.left + chipRect.width / 2 - rootRect.left,
        top: chipRect.top - rootRect.top - 8,
      });
    },
    [clearHideCardTimer],
  );

  const scheduleShowQuoteCard = useCallback(
    (target: Element | null) => {
      clearShowCardTimer();
      clearHideCardTimer();
      showCardTimerRef.current = window.setTimeout(() => {
        showCardTimerRef.current = null;
        showQuoteCard(target);
      }, QUOTE_CARD_SHOW_DELAY_MS);
    },
    [clearHideCardTimer, clearShowCardTimer, showQuoteCard],
  );

  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target instanceof Element ? event.target : null;
    const remove = target?.closest("[data-quote-remove]");
    if (!remove) {
      return;
    }
    const chip = remove.closest("[data-quote-index]");
    if (!(chip instanceof HTMLElement)) {
      return;
    }
    const quoteIndex = Number(chip.dataset.quoteIndex);
    if (!Number.isFinite(quoteIndex)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    onQuoteRemove(quoteIndex);
    setActiveCard(null);
    editorRef.current?.focus();
  };

  const handleMouseOver = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target instanceof Element ? event.target.closest("[data-quote-index]") : null;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const relatedTarget = event.relatedTarget instanceof Element ? event.relatedTarget : null;
    if (relatedTarget?.closest("[data-quote-index]") === target) {
      return;
    }
    scheduleShowQuoteCard(target);
  };

  const handleMouseOut = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target instanceof Element ? event.target.closest("[data-quote-index]") : null;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const relatedTarget = event.relatedTarget instanceof Element ? event.relatedTarget : null;
    if (relatedTarget?.closest("[data-quote-index]") === target || relatedTarget?.closest("[data-quote-hover-card]")) {
      return;
    }
    clearShowCardTimer();
    scheduleHideCard();
  };

  const handleCopyQuote = async () => {
    if (!activeCard) {
      return;
    }
    await copyToClipboard(activeCard.text);
    setCopiedIndex(activeCard.index);
    window.setTimeout(() => setCopiedIndex((index) => (index === activeCard.index ? null : index)), 1200);
  };

  const handleDeleteActiveQuote = () => {
    if (!activeCard) {
      return;
    }
    onQuoteRemove(activeCard.index);
    setActiveCard(null);
    editorRef.current?.focus();
  };

  return (
    <>
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
        onClick={handleClick}
        onCompositionEnd={onCompositionEnd}
        onCompositionStart={onCompositionStart}
        onFocus={onFocus}
        onInput={onChange}
        onKeyDown={onKeyDown}
        onMouseLeave={scheduleHideCard}
        onMouseOut={handleMouseOut}
        onMouseOver={handleMouseOver}
        onPaste={onPaste}
      />
      {activeCard ? (
        <div
          className={styles.quoteHoverCard}
          data-quote-hover-card="true"
          style={{ left: activeCard.left, top: activeCard.top }}
          onMouseDown={(event) => event.preventDefault()}
          onMouseEnter={clearHideCardTimer}
          onMouseLeave={scheduleHideCard}
        >
          <div className={styles.quoteHoverBody}>{activeCard.text}</div>
          <div className={styles.quoteHoverActions}>
            <button type="button" onClick={handleCopyQuote}>
              {copiedIndex === activeCard.index ? "已复制" : "复制"}
            </button>
            <button type="button" data-danger="true" onClick={handleDeleteActiveQuote}>
              删除
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}

const QUOTE_CARD_SHOW_DELAY_MS = 200;
const QUOTE_CARET_GUARD = "\u200b";

function renderQuoteEditorValue(editor: HTMLDivElement, value: string) {
  let quoteIndex = 0;
  const nodes: Node[] = [];
  parseQuoteMarkers(value).forEach((segment) => {
    if (segment.type === "text") {
      nodes.push(document.createTextNode(segment.value));
      return;
    }
    const chip = document.createElement("span");
    const label = document.createElement("span");
    const remove = document.createElement("span");
    const preview = quoteMarkerPreview(segment.value);
    chip.className = styles.quoteInputChip;
    chip.contentEditable = "false";
    chip.dataset.quoteIndex = String(quoteIndex);
    chip.dataset.quoteMarker = segment.marker;
    chip.dataset.quoteText = segment.value;
    chip.setAttribute("aria-label", `引用片段：${preview}`);
    label.className = styles.quoteInputChipLabel;
    label.textContent = "引用片段";
    remove.className = styles.quoteInputChipRemove;
    remove.dataset.quoteRemove = "true";
    remove.setAttribute("aria-label", "删除引用片段");
    remove.setAttribute("role", "button");
    remove.textContent = "×";
    chip.append(label, remove);
    quoteIndex += 1;
    nodes.push(chip, document.createTextNode(QUOTE_CARET_GUARD));
  });
  editor.replaceChildren(...nodes);
}

function syncEditableChange(editor: HTMLElement, onChange: (value: string) => void) {
  onChange(readQuoteEditorValue(editor));
}

function readQuoteEditorValue(root: Node): string {
  let value = "";
  root.childNodes.forEach((node) => {
    value += readQuoteEditorNodeValue(node);
  });
  return value.replace(/\u00a0/g, " ").split(QUOTE_CARET_GUARD).join("");
}

function readQuoteEditorNodeValue(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent ?? "";
  }
  if (!(node instanceof HTMLElement)) {
    return "";
  }
  if (node.dataset.quoteMarker) {
    return node.dataset.quoteMarker;
  }
  if (node.tagName === "BR") {
    return "\n";
  }
  const childValue = readQuoteEditorValue(node);
  return isBlockEditorNode(node) && childValue ? `${childValue}\n` : childValue;
}

function isBlockEditorNode(node: HTMLElement): boolean {
  return node.tagName === "DIV" || node.tagName === "P";
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
