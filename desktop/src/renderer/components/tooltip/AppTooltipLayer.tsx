import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import styles from "./AppTooltipLayer.module.css";

type TooltipPlacement = "top" | "right" | "bottom" | "left";

interface TooltipState {
  label: string;
  left: number;
  top: number;
  placement: TooltipPlacement;
}

interface NativeTitleSnapshot {
  element: HTMLElement;
  title: string;
}

export interface AppTooltipLayerProps {
  scopeSelector: string;
  defaultPlacement?: TooltipPlacement;
  delayMs?: number;
}

const TOOLTIP_TARGET_SELECTOR = [
  "[data-tooltip-label]",
  "[data-tooltip='true']",
].join(",");

const DEFAULT_DELAY_MS = 420;

export function AppTooltipLayer({
  scopeSelector,
  defaultPlacement = "top",
  delayMs = DEFAULT_DELAY_MS,
}: AppTooltipLayerProps) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const targetRef = useRef<HTMLElement | null>(null);
  const showTimerRef = useRef<number | null>(null);
  const nativeTitleRef = useRef<NativeTitleSnapshot | null>(null);

  const clearShowTimer = useCallback(() => {
    if (showTimerRef.current !== null) {
      window.clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    }
  }, []);

  const restoreNativeTitle = useCallback(() => {
    const snapshot = nativeTitleRef.current;
    if (!snapshot) {
      return;
    }
    snapshot.element.setAttribute("title", snapshot.title);
    nativeTitleRef.current = null;
  }, []);

  const hideTooltip = useCallback(() => {
    clearShowTimer();
    restoreNativeTitle();
    targetRef.current = null;
    setTooltip(null);
  }, [clearShowTimer, restoreNativeTitle]);

  const showTooltip = useCallback(
    (target: HTMLElement) => {
      const label = tooltipLabel(target);
      if (!label) {
        hideTooltip();
        return;
      }
      if (targetRef.current === target) {
        return;
      }
      clearShowTimer();
      restoreNativeTitle();
      const nativeTitle = target.getAttribute("title");
      if (nativeTitle) {
        nativeTitleRef.current = { element: target, title: nativeTitle };
        target.removeAttribute("title");
      }
      targetRef.current = target;
      showTimerRef.current = window.setTimeout(() => {
        if (targetRef.current !== target) {
          return;
        }
        setTooltip(positionTooltip(target, label, tooltipPlacement(target, defaultPlacement)));
        showTimerRef.current = null;
      }, delayMs);
    },
    [clearShowTimer, defaultPlacement, delayMs, hideTooltip, restoreNativeTitle],
  );

  useEffect(() => {
    const targetFromEvent = (eventTarget: EventTarget | null): HTMLElement | null => {
      if (!(eventTarget instanceof Element)) {
        return null;
      }
      const target = eventTarget.closest(TOOLTIP_TARGET_SELECTOR);
      if (!(target instanceof HTMLElement)) {
        return null;
      }
      if (!target.closest(scopeSelector) || target.dataset.tooltipDisabled === "true") {
        return null;
      }
      return target;
    };

    const handlePointerOver = (event: PointerEvent) => {
      const target = targetFromEvent(event.target);
      if (!target) {
        return;
      }
      showTooltip(target);
    };
    const handlePointerOut = (event: PointerEvent) => {
      const activeTarget = targetRef.current;
      if (!activeTarget) {
        return;
      }
      const relatedTarget = event.relatedTarget;
      if (relatedTarget instanceof Node && activeTarget.contains(relatedTarget)) {
        return;
      }
      hideTooltip();
    };
    const handleFocusIn = (event: FocusEvent) => {
      const target = targetFromEvent(event.target);
      if (target) {
        showTooltip(target);
      }
    };
    const handleFocusOut = () => hideTooltip();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        hideTooltip();
      }
    };

    document.addEventListener("pointerover", handlePointerOver, true);
    document.addEventListener("pointerout", handlePointerOut, true);
    document.addEventListener("focusin", handleFocusIn, true);
    document.addEventListener("focusout", handleFocusOut, true);
    document.addEventListener("keydown", handleKeyDown, true);
    document.addEventListener("scroll", hideTooltip, true);
    window.addEventListener("resize", hideTooltip);
    return () => {
      document.removeEventListener("pointerover", handlePointerOver, true);
      document.removeEventListener("pointerout", handlePointerOut, true);
      document.removeEventListener("focusin", handleFocusIn, true);
      document.removeEventListener("focusout", handleFocusOut, true);
      document.removeEventListener("keydown", handleKeyDown, true);
      document.removeEventListener("scroll", hideTooltip, true);
      window.removeEventListener("resize", hideTooltip);
      hideTooltip();
    };
  }, [hideTooltip, scopeSelector, showTooltip]);

  if (!tooltip) {
    return null;
  }

  return createPortal(
    <div
      className={styles.tooltip}
      role="tooltip"
      data-placement={tooltip.placement}
      style={{ left: tooltip.left, top: tooltip.top }}
    >
      {tooltip.label}
    </div>,
    document.body,
  );
}

function tooltipLabel(target: HTMLElement) {
  const explicitLabel = target.dataset.tooltipLabel?.trim();
  if (explicitLabel) {
    return explicitLabel;
  }

  const explicitTooltip = target.dataset.tooltip === "true";
  const visibleText = target.textContent?.trim();
  if (!explicitTooltip && visibleText) {
    return "";
  }

  return target.getAttribute("aria-label")?.trim() || target.getAttribute("title")?.trim() || "";
}

function tooltipPlacement(target: HTMLElement, fallback: TooltipPlacement): TooltipPlacement {
  const placement = target.dataset.tooltipPlacement;
  return placement === "top" || placement === "right" || placement === "bottom" || placement === "left"
    ? placement
    : fallback;
}

function positionTooltip(target: HTMLElement, label: string, placement: TooltipPlacement): TooltipState {
  const rect = target.getBoundingClientRect();
  const horizontalCenter = Math.round(rect.left + rect.width / 2);
  const verticalCenter = Math.round(rect.top + rect.height / 2);
  if (placement === "right") {
    return { label, left: Math.round(rect.right), top: verticalCenter, placement };
  }
  if (placement === "left") {
    return { label, left: Math.round(rect.left), top: verticalCenter, placement };
  }
  if (placement === "bottom") {
    return { label, left: horizontalCenter, top: Math.round(rect.bottom), placement };
  }
  return { label, left: horizontalCenter, top: Math.round(rect.top), placement };
}
