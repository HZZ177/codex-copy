import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

const MESSAGE_SCROLL_SELECTOR = '[data-testid="message-list-scroll"]';
const DEFAULT_LOCK_DURATION_MS = 360;
export const EXPANSION_SCROLL_LOCK_ATTR = "data-expansion-scroll-lock";

interface ScrollAnchorSnapshot {
  scroller: HTMLElement;
  target: HTMLElement;
  top: number;
  previousOverflowAnchor: string;
}

export function useExpansionScrollAnchor(lockDurationMs = DEFAULT_LOCK_DURATION_MS) {
  const anchorRef = useRef<ScrollAnchorSnapshot | null>(null);
  const unlockTimerRef = useRef<number | null>(null);
  const [captureVersion, setCaptureVersion] = useState(0);

  const releaseScrollLock = useCallback(() => {
    if (unlockTimerRef.current !== null) {
      window.clearTimeout(unlockTimerRef.current);
      unlockTimerRef.current = null;
    }
    const anchor = anchorRef.current;
    if (anchor?.scroller.isConnected) {
      anchor.scroller.removeAttribute(EXPANSION_SCROLL_LOCK_ATTR);
      anchor.scroller.style.overflowAnchor = anchor.previousOverflowAnchor;
    }
    anchorRef.current = null;
  }, []);

  const captureExpansionAnchor = useCallback(
    (target: HTMLElement | null) => {
      if (!target) {
        return;
      }
      const scroller = resolveScrollContainer(target);
      if (!(scroller instanceof HTMLElement)) {
        return;
      }
      const scrollerRect = scroller.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      if (unlockTimerRef.current !== null) {
        window.clearTimeout(unlockTimerRef.current);
        unlockTimerRef.current = null;
      }
      anchorRef.current = {
        scroller,
        target,
        top: targetRect.top - scrollerRect.top,
        previousOverflowAnchor: scroller.style.overflowAnchor,
      };
      scroller.setAttribute(EXPANSION_SCROLL_LOCK_ATTR, "true");
      scroller.style.overflowAnchor = "none";
      unlockTimerRef.current = window.setTimeout(releaseScrollLock, lockDurationMs);
      setCaptureVersion((version) => version + 1);
    },
    [lockDurationMs, releaseScrollLock],
  );

  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor || !anchor.target.isConnected || !anchor.scroller.isConnected) {
      return undefined;
    }

    const nextTop = anchor.target.getBoundingClientRect().top - anchor.scroller.getBoundingClientRect().top;
    const delta = nextTop - anchor.top;
    if (Math.abs(delta) >= 0.5) {
      anchor.scroller.scrollTop += delta;
    }
    return undefined;
  }, [captureVersion]);

  useEffect(() => releaseScrollLock, [releaseScrollLock]);

  return captureExpansionAnchor;
}

function resolveScrollContainer(target: HTMLElement): HTMLElement | null {
  const scrollable = findScrollableAncestor(target);
  if (scrollable) {
    return scrollable;
  }
  const messageScroller = target.closest(MESSAGE_SCROLL_SELECTOR);
  return messageScroller instanceof HTMLElement ? messageScroller : null;
}

function findScrollableAncestor(target: HTMLElement): HTMLElement | null {
  let current = target.parentElement;
  while (current) {
    const overflowY = window.getComputedStyle(current).overflowY;
    if (
      (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") &&
      current.scrollHeight > current.clientHeight + 1
    ) {
      return current;
    }
    current = current.parentElement;
  }
  return null;
}
