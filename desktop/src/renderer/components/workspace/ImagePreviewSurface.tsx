import { RotateCcw, RotateCw, X, ZoomIn, ZoomOut } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { createPortal } from "react-dom";

import styles from "./ImagePreviewSurface.module.css";

const IMAGE_MIN_SCALE = 0.25;
const IMAGE_MAX_SCALE = 5;
const IMAGE_SCALE_STEP = 0.25;
const IMAGE_ROTATE_STEP = 90;

interface ImagePanOffset {
  x: number;
  y: number;
}

interface ImageDragState {
  offsetX: number;
  offsetY: number;
  pointerId: number;
  startX: number;
  startY: number;
}

export interface ImagePreviewSurfaceProps {
  src?: string | null;
  alt?: string;
  title?: string;
  sourceLabel?: string;
  mediaType?: string | null;
  size?: number | null;
  className?: string;
  unavailableText?: string;
  showMeta?: boolean;
}

export function ImagePreviewSurface({
  src,
  alt = "",
  title = "",
  sourceLabel = "",
  mediaType = null,
  size = null,
  className = "",
  unavailableText = "图片未加载",
  showMeta = true,
}: ImagePreviewSurfaceProps) {
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [offset, setOffset] = useState<ImagePanOffset>({ x: 0, y: 0 });
  const dragRef = useRef<ImageDragState | null>(null);

  const setClampedScale = (value: number | ((current: number) => number)) => {
    setScale((current) => {
      const next = clampImageScale(typeof value === "function" ? value(current) : value);
      if (next <= 1) {
        setOffset({ x: 0, y: 0 });
      }
      return next;
    });
  };

  const zoomBy = (delta: number) => {
    setClampedScale((current) => current + delta);
  };

  const rotateBy = (delta: number) => {
    setRotation((current) => normalizeImageRotation(current + delta));
  };

  const resetView = () => {
    setScale(1);
    setRotation(0);
    setOffset({ x: 0, y: 0 });
  };

  const handleWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    if (Math.abs(event.deltaY) === 0) {
      return;
    }
    event.preventDefault();
    zoomBy(event.deltaY < 0 ? IMAGE_SCALE_STEP : -IMAGE_SCALE_STEP);
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button > 0 || scale <= 1) {
      return;
    }
    dragRef.current = {
      pointerId: pointerIdValue(event),
      startX: pointerCoordinate(event.clientX),
      startY: pointerCoordinate(event.clientY),
      offsetX: offset.x,
      offsetY: offset.y,
    };
    event.currentTarget.dataset.dragging = "true";
    event.currentTarget.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== pointerIdValue(event)) {
      return;
    }
    setOffset({
      x: drag.offsetX + pointerCoordinate(event.clientX) - drag.startX,
      y: drag.offsetY + pointerCoordinate(event.clientY) - drag.startY,
    });
  };

  const clearDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== pointerIdValue(event)) {
      return;
    }
    dragRef.current = null;
    delete event.currentTarget.dataset.dragging;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };

  const scaleLabel = formatImageScale(scale);
  const displayAlt = alt || title || sourceLabel || "图片预览";
  const imageStyle = {
    "--image-scale": scale,
    "--image-rotation": `${rotation}deg`,
    "--image-offset-x": `${offset.x}px`,
    "--image-offset-y": `${offset.y}px`,
  } as CSSProperties;

  return (
    <figure className={[styles.imagePane, className].filter(Boolean).join(" ")}>
      {src ? (
        <>
          <div
            className={styles.imageControls}
            aria-label="图片视图控制"
            data-file-preview-selection-excluded="true"
            onPointerDown={(event) => event.stopPropagation()}
            onWheel={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              aria-label="缩小图片"
              title="缩小图片"
              disabled={scale <= IMAGE_MIN_SCALE}
              onClick={() => zoomBy(-IMAGE_SCALE_STEP)}
            >
              <ZoomOut size={15} />
            </button>
            <span className={styles.imageScaleValue} aria-label={`当前缩放 ${scaleLabel}`}>
              {scaleLabel}
            </span>
            <button
              type="button"
              aria-label="放大图片"
              title="放大图片"
              disabled={scale >= IMAGE_MAX_SCALE}
              onClick={() => zoomBy(IMAGE_SCALE_STEP)}
            >
              <ZoomIn size={15} />
            </button>
            <button
              type="button"
              aria-label="逆时针旋转图片"
              title="逆时针旋转图片"
              onClick={() => rotateBy(-IMAGE_ROTATE_STEP)}
            >
              <RotateCcw size={15} />
            </button>
            <button
              type="button"
              aria-label="顺时针旋转图片"
              title="顺时针旋转图片"
              onClick={() => rotateBy(IMAGE_ROTATE_STEP)}
            >
              <RotateCw size={15} />
            </button>
            <button type="button" aria-label="重置图片视图" title="重置图片视图" onClick={resetView}>
              <RotateCcw size={15} />
            </button>
          </div>
          <div
            className={styles.imageCanvas}
            aria-label="图片预览画布"
            data-draggable={scale > 1 ? "true" : "false"}
            style={imageStyle}
            onPointerCancel={clearDrag}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={clearDrag}
            onWheel={handleWheel}
          >
            <img className={styles.imageFrame} src={src} alt={displayAlt} draggable={false} />
          </div>
        </>
      ) : (
        <div className={styles.imageStatus}>{unavailableText}</div>
      )}
      {showMeta && (mediaType || typeof size === "number") ? (
        <figcaption className={styles.imageMeta}>
          {mediaType ? <span>{mediaType}</span> : null}
          {typeof size === "number" ? <span>{formatBytes(size)}</span> : null}
        </figcaption>
      ) : null}
    </figure>
  );
}

export interface ImagePreviewDialogProps extends ImagePreviewSurfaceProps {
  onClose: () => void;
}

export function ImagePreviewDialog({
  onClose,
  title = "",
  alt = "",
  ...surfaceProps
}: ImagePreviewDialogProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const label = title || alt || "图片预览";

  useEffect(() => {
    dialogRef.current?.focus();
    const handleDocumentKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };

    document.addEventListener("keydown", handleDocumentKeyDown, true);
    return () => document.removeEventListener("keydown", handleDocumentKeyDown, true);
  }, [onClose]);

  return createPortal(
    <div
      ref={dialogRef}
      className={styles.dialogOverlay}
      role="dialog"
      aria-modal="true"
      aria-label={label}
      tabIndex={-1}
      onMouseDown={onClose}
      onKeyDownCapture={(event) => {
        if (event.key !== "Escape") {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }}
    >
      <div className={styles.dialogPanel} onMouseDown={(event) => event.stopPropagation()}>
        <button className={styles.dialogClose} type="button" aria-label="关闭图片预览" onClick={onClose}>
          <X size={16} />
        </button>
        <ImagePreviewSurface
          {...surfaceProps}
          alt={alt}
          title={title}
          className={styles.dialogImagePane}
          showMeta={surfaceProps.showMeta ?? false}
        />
      </div>
    </div>,
    document.body,
  );
}

function clampImageScale(value: number): number {
  return Math.min(IMAGE_MAX_SCALE, Math.max(IMAGE_MIN_SCALE, Math.round(value * 100) / 100));
}

function formatImageScale(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function normalizeImageRotation(value: number): number {
  const normalized = value % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

function pointerIdValue(event: ReactPointerEvent<HTMLElement>): number {
  return event.pointerId ?? 0;
}

function pointerCoordinate(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function formatBytes(size: number): string {
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(size < 10 * 1024 ? 1 : 0)} KB`;
  }
  return `${(size / 1024 / 1024).toFixed(size < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}
