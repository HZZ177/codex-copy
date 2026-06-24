import { CirclePlus, MessageSquarePlus } from "lucide-react";
import { createPortal } from "react-dom";

import type { SelectionPosition } from "./useTextSelection";
import styles from "./SelectionToolbar.module.css";

export interface SelectionToolbarProps {
  selectedText: string;
  position: SelectionPosition | null;
  onQuote?: (text: string) => void;
  onAnnotate?: (text: string) => void;
  onClear: () => void;
}

export function SelectionToolbar({
  selectedText,
  position,
  onQuote,
  onAnnotate,
  onClear,
}: SelectionToolbarProps) {
  if (!selectedText || !position || (!onQuote && !onAnnotate)) {
    return null;
  }

  const left = clamp(position.x, 16, window.innerWidth - 16);
  const top = clamp(position.y - 8, 12, window.innerHeight - 12);

  return createPortal(
    <div
      className={styles.toolbar}
      role="toolbar"
      aria-label="选中文本操作"
      style={{ left, top }}
      onMouseDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      {onQuote ? (
        <button
          className={styles.action}
          type="button"
          aria-label="添加选中文本到对话"
          title="添加到对话"
          onClick={() => {
            onQuote(selectedText);
            onClear();
          }}
        >
          <CirclePlus size={13} strokeWidth={2.1} />
          <span>添加到对话</span>
        </button>
      ) : null}
      {onAnnotate ? (
        <button
          className={styles.action}
          type="button"
          aria-label="为选中文本添加批注"
          title="添加批注"
          onClick={() => {
            onAnnotate(selectedText);
            onClear();
          }}
        >
          <MessageSquarePlus size={13} strokeWidth={2.1} />
          <span>添加批注</span>
        </button>
      ) : null}
    </div>,
    document.body,
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}
