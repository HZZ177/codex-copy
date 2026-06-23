import {
  useCallback,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { ChevronsLeftRight } from "lucide-react";

import {
  DEFAULT_RIGHT_SIDEBAR_RATIO,
  MAX_RIGHT_SIDEBAR_RATIO,
  MIN_RIGHT_SIDEBAR_RATIO,
  clampRightSidebarRatio,
} from "@/renderer/hooks/layout/layoutStore";
import type { RightSidebarPlacement } from "@/renderer/hooks/layout/layoutStore";

import styles from "./RightSidebarResizeHandle.module.css";
import { useRafPanelResize } from "./useRafPanelResize";

interface RightSidebarResizeHandleProps {
  disabled?: boolean;
  ratio: number;
  placement: RightSidebarPlacement;
  getAvailableWidth: () => number;
  onResizePreview?: (ratio: number) => void;
  onResize: (ratio: number) => void;
  onSwapPlacement: () => void;
}

const KEYBOARD_STEP = 0.01;

export function RightSidebarResizeHandle({
  disabled = false,
  ratio,
  placement,
  getAvailableWidth,
  onResizePreview,
  onResize,
  onSwapPlacement,
}: RightSidebarResizeHandleProps) {
  const getDragRatio = useCallback(
    (startRatio: number, startX: number, clientX: number) => {
      const direction = placement === "right" ? -1 : 1;
      return clampRightSidebarRatio(startRatio + direction * ((clientX - startX) / Math.max(1, getAvailableWidth())));
    },
    [getAvailableWidth, placement],
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
      nextRatio = placement === "right" ? ratio + KEYBOARD_STEP : ratio - KEYBOARD_STEP;
    } else if (event.key === "ArrowRight") {
      nextRatio = placement === "right" ? ratio - KEYBOARD_STEP : ratio + KEYBOARD_STEP;
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

  const placementLabel = placement === "left" ? "左侧栏" : "右侧栏";

  return (
    <div className={styles.root} data-disabled={disabled ? "true" : "false"} data-placement={placement}>
      <div
        aria-label={`调整${placementLabel}宽度`}
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
      {!disabled ? (
        <button
          aria-label="交换对话区和侧边栏位置"
          className={styles.swapButton}
          onClick={onSwapPlacement}
          onPointerDown={(event) => event.stopPropagation()}
          title="交换对话区和侧边栏位置"
          type="button"
        >
          <ChevronsLeftRight size={11} strokeWidth={2.25} />
        </button>
      ) : null}
    </div>
  );
}
