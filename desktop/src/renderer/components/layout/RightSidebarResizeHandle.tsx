import {
  useCallback,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

import {
  DEFAULT_RIGHT_SIDEBAR_RATIO,
  MAX_RIGHT_SIDEBAR_RATIO,
  MIN_RIGHT_SIDEBAR_RATIO,
  clampRightSidebarRatio,
} from "@/renderer/hooks/layout/layoutStore";

import styles from "./RightSidebarResizeHandle.module.css";
import { useRafPanelResize } from "./useRafPanelResize";

interface RightSidebarResizeHandleProps {
  disabled?: boolean;
  ratio: number;
  getAvailableWidth: () => number;
  onResizePreview?: (ratio: number) => void;
  onResize: (ratio: number) => void;
}

const KEYBOARD_STEP = 0.01;

export function RightSidebarResizeHandle({
  disabled = false,
  ratio,
  getAvailableWidth,
  onResizePreview,
  onResize,
}: RightSidebarResizeHandleProps) {
  const getDragRatio = useCallback(
    (startRatio: number, startX: number, clientX: number) =>
      clampRightSidebarRatio(startRatio - (clientX - startX) / Math.max(1, getAvailableWidth())),
    [getAvailableWidth],
  );
  const { dragging, startDrag, finishDrag } = useRafPanelResize({
    disabled,
    width: ratio,
    getWidth: getDragRatio,
    onPreview: onResizePreview,
    onCommit: onResize,
  });

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (disabled) {
      return;
    }
    let nextRatio: number | null = null;
    if (event.key === "ArrowLeft") {
      nextRatio = ratio + KEYBOARD_STEP;
    } else if (event.key === "ArrowRight") {
      nextRatio = ratio - KEYBOARD_STEP;
    } else if (event.key === "Home") {
      nextRatio = MIN_RIGHT_SIDEBAR_RATIO;
    } else if (event.key === "End") {
      nextRatio = MAX_RIGHT_SIDEBAR_RATIO;
    }
    if (nextRatio === null) {
      return;
    }
    event.preventDefault();
    onResize(clampRightSidebarRatio(nextRatio));
  };

  const resetWidth = () => {
    if (disabled) {
      return;
    }
    finishDrag();
    onResizePreview?.(DEFAULT_RIGHT_SIDEBAR_RATIO);
    onResize(DEFAULT_RIGHT_SIDEBAR_RATIO);
  };

  return (
    <div
      aria-label="调整右侧栏宽度"
      aria-orientation="vertical"
      aria-valuemax={Math.round(MAX_RIGHT_SIDEBAR_RATIO * 100)}
      aria-valuemin={Math.round(MIN_RIGHT_SIDEBAR_RATIO * 100)}
      aria-valuenow={Math.round(ratio * 100)}
      className={styles.handle}
      data-disabled={disabled ? "true" : "false"}
      data-dragging={dragging ? "true" : "false"}
      onDoubleClick={resetWidth}
      onKeyDown={handleKeyDown}
      onPointerDown={startDrag}
      role="separator"
      tabIndex={disabled ? -1 : 0}
      title="拖动调整宽度，双击恢复默认宽度"
    />
  );
}
