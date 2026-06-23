import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";

import type { RuntimeBridge } from "@/runtime";

import { FilePreview } from "./FilePreview";
import { WorkspacePanel } from "./WorkspacePanel";
import styles from "./WorkspaceFileBrowser.module.css";

export interface WorkspaceFileBrowserProps {
  workspaceId?: string;
  sessionId?: string;
  label?: string;
  runtime: RuntimeBridge;
}

const DEFAULT_TREE_WIDTH = 260;
const MIN_TREE_WIDTH = 180;
const MAX_TREE_WIDTH = 520;
const MIN_PREVIEW_WIDTH = 280;
const FILE_PREVIEW_CLOSE_MS = 180;

interface ResizeState {
  pointerId: number;
  rootLeft: number;
  rootWidth: number;
  frame: number | null;
  pendingWidth: number;
}

export function WorkspaceFileBrowser({ workspaceId, sessionId, label, runtime }: WorkspaceFileBrowserProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const resizeRef = useRef<ResizeState | null>(null);
  const previewUnmountTimerRef = useRef<number | null>(null);
  const previewOpenFrameRef = useRef<number | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [mountedPreviewPath, setMountedPreviewPath] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [treeWidth, setTreeWidth] = useState(DEFAULT_TREE_WIDTH);
  const previewRequest = useMemo(
    () => (mountedPreviewPath ? ({ type: "file", path: mountedPreviewPath } as const) : null),
    [mountedPreviewPath],
  );
  const previewMounted = Boolean(previewRequest);

  const clearPreviewUnmountTimer = useCallback(() => {
    if (previewUnmountTimerRef.current === null) {
      return;
    }
    window.clearTimeout(previewUnmountTimerRef.current);
    previewUnmountTimerRef.current = null;
  }, []);

  const clearPreviewOpenFrame = useCallback(() => {
    if (previewOpenFrameRef.current === null) {
      return;
    }
    window.cancelAnimationFrame(previewOpenFrameRef.current);
    previewOpenFrameRef.current = null;
  }, []);

  const setPreviewWidth = useCallback((width: number) => {
    const root = rootRef.current;
    if (!root) {
      return;
    }
    root.style.setProperty("--workspace-file-tree-width", `${Math.round(width)}px`);
  }, []);

  const schedulePreviewWidth = useCallback(
    (width: number) => {
      const drag = resizeRef.current;
      if (!drag) {
        return;
      }
      drag.pendingWidth = width;
      if (drag.frame !== null) {
        return;
      }
      drag.frame = window.requestAnimationFrame(() => {
        const activeDrag = resizeRef.current;
        if (!activeDrag) {
          return;
        }
        activeDrag.frame = null;
        setPreviewWidth(activeDrag.pendingWidth);
      });
    },
    [setPreviewWidth],
  );

  const stopResize = useCallback(
    (event?: ReactPointerEvent<HTMLDivElement>) => {
      const drag = resizeRef.current;
      if (!drag) {
        return;
      }
      if (drag.frame !== null) {
        window.cancelAnimationFrame(drag.frame);
      }
      resizeRef.current = null;
      setPreviewWidth(drag.pendingWidth);
      setTreeWidth(Math.round(drag.pendingWidth));
      if (rootRef.current) {
        delete rootRef.current.dataset.resizing;
      }
      if (event) {
        event.currentTarget.releasePointerCapture?.(event.pointerId);
      }
    },
    [setPreviewWidth],
  );

  const openPreview = useCallback(
    (path: string) => {
      clearPreviewUnmountTimer();
      clearPreviewOpenFrame();
      setSelectedPath(path);
      setMountedPreviewPath(path);
      if (mountedPreviewPath) {
        setPreviewOpen(true);
        return;
      }
      setPreviewOpen(false);
      previewOpenFrameRef.current = window.requestAnimationFrame(() => {
        previewOpenFrameRef.current = null;
        setPreviewOpen(true);
      });
    },
    [clearPreviewOpenFrame, clearPreviewUnmountTimer, mountedPreviewPath],
  );

  const closePreview = useCallback(() => {
    clearPreviewUnmountTimer();
    clearPreviewOpenFrame();
    setSelectedPath(null);
    setPreviewOpen(false);
    previewUnmountTimerRef.current = window.setTimeout(() => {
      previewUnmountTimerRef.current = null;
      setMountedPreviewPath(null);
    }, FILE_PREVIEW_CLOSE_MS);
  }, [clearPreviewOpenFrame, clearPreviewUnmountTimer]);

  useEffect(
    () => () => {
      clearPreviewUnmountTimer();
      clearPreviewOpenFrame();
    },
    [clearPreviewOpenFrame, clearPreviewUnmountTimer],
  );

  const handleResizePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button > 0) {
      return;
    }
    const root = rootRef.current;
    if (!root) {
      return;
    }
    const rect = root.getBoundingClientRect();
    resizeRef.current = {
      pointerId: pointerIdValue(event),
      rootLeft: rect.left,
      rootWidth: rect.width,
      frame: null,
      pendingWidth: treeWidth,
    };
    root.dataset.resizing = "true";
    event.currentTarget.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  };

  const handleResizePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = resizeRef.current;
    if (!drag || drag.pointerId !== pointerIdValue(event)) {
      return;
    }
    const maxWidth = Math.max(MIN_TREE_WIDTH, Math.min(MAX_TREE_WIDTH, drag.rootWidth - MIN_PREVIEW_WIDTH));
    const nextWidth = clamp(event.clientX - drag.rootLeft, MIN_TREE_WIDTH, maxWidth);
    schedulePreviewWidth(nextWidth);
  };

  return (
    <section
      ref={rootRef}
      className={styles.browser}
      data-testid="workspace-file-browser"
      data-preview-mounted={previewMounted ? "true" : "false"}
      data-preview-layout-open={previewOpen ? "true" : "false"}
      data-preview-open={previewOpen ? "true" : "false"}
      aria-label="工作区文件浏览器"
      style={{ "--workspace-file-tree-width": `${treeWidth}px` } as CSSProperties}
    >
      <div className={styles.treePane} data-testid="workspace-file-browser-tree">
        <WorkspacePanel
          chrome="panel"
          label={label}
          runtime={runtime}
          workspaceId={workspaceId}
          sessionId={sessionId}
          selectedPath={selectedPath}
          onSelectFile={openPreview}
        />
      </div>
      {previewRequest ? (
        <>
          <div
            className={styles.resizeHandle}
            role="separator"
            aria-label="调整文件树宽度"
            aria-orientation="vertical"
            tabIndex={0}
            onPointerCancel={stopResize}
            onPointerDown={handleResizePointerDown}
            onPointerMove={handleResizePointerMove}
            onPointerUp={stopResize}
          />
          <div className={styles.previewPane} data-testid="workspace-file-browser-preview" aria-hidden={!previewOpen}>
            <FilePreview
              breadcrumbRootLabel={label}
              workspaceId={workspaceId}
              sessionId={sessionId}
              request={previewRequest}
              runtime={runtime}
              chrome="panel"
              onClose={closePreview}
            />
          </div>
        </>
      ) : null}
    </section>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function pointerIdValue(event: ReactPointerEvent<HTMLElement>): number {
  return Number.isFinite(event.pointerId) ? event.pointerId : 1;
}
