import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { FollowOutput, VirtuosoHandle } from "react-virtuoso";

const AT_BOTTOM_THRESHOLD_PX = 100;
const FOLLOW_BOTTOM_THRESHOLD_PX = 4;
type VirtuosoScrollBehavior = "auto" | "smooth";

export interface UseVirtuosoAutoScrollResult {
  virtuosoRef: RefObject<VirtuosoHandle | null>;
  showScrollToBottom: boolean;
  followOutput: FollowOutput;
  setScrollerRef: (ref: HTMLElement | Window | null) => void;
  handleAtBottomStateChange: (atBottom: boolean) => void;
  handleTotalListHeightChanged: () => void;
  scrollToBottom: (behavior?: ScrollBehavior) => void;
}

export function useVirtuosoAutoScroll(itemCount: number): UseVirtuosoAutoScrollResult {
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const scrollerRef = useRef<HTMLElement | null>(null);
  const [scroller, setScroller] = useState<HTMLElement | null>(null);
  const atBottomRef = useRef(true);
  const userPinnedRef = useRef(false);
  const userInputActiveRef = useRef(false);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);

  const updateBottomState = useCallback(() => {
    const scroller = scrollerRef.current;
    if (!scroller) {
      setShowScrollToBottom(false);
      return true;
    }

    const bottomGap = getBottomGap(scroller);
    const atBottom = bottomGap <= FOLLOW_BOTTOM_THRESHOLD_PX;
    atBottomRef.current = atBottom;

    if (atBottom) {
      userPinnedRef.current = false;
      userInputActiveRef.current = false;
    } else if (userInputActiveRef.current) {
      userPinnedRef.current = true;
    }

    setShowScrollToBottom(bottomGap > AT_BOTTOM_THRESHOLD_PX);
    return atBottom;
  }, []);

  const setScrollerRef = useCallback(
    (ref: HTMLElement | Window | null) => {
      const element = ref instanceof HTMLElement ? ref : null;
      scrollerRef.current = element;
      setScroller(element);
      updateBottomState();
    },
    [updateBottomState],
  );

  const scrollToBottom = useCallback(
    (behavior: ScrollBehavior = "smooth") => {
      if (itemCount <= 0) {
        return;
      }

      userPinnedRef.current = false;
      userInputActiveRef.current = false;
      atBottomRef.current = true;
      setShowScrollToBottom(false);

      const scrollBehavior = toVirtuosoScrollBehavior(behavior);
      const scroller = scrollerRef.current;
      if (scroller && scrollBehavior === "auto") {
        scroller.scrollTop = bottomScrollTop(scroller);
        return;
      }

      if (scroller && typeof scroller.scrollTo === "function") {
        scroller.scrollTo({ top: bottomScrollTop(scroller), behavior: scrollBehavior });
        return;
      }

      virtuosoRef.current?.scrollToIndex({
        align: "end",
        behavior: scrollBehavior,
        index: itemCount - 1,
      });
    },
    [itemCount],
  );

  const handleAtBottomStateChange = useCallback((atBottom: boolean) => {
    atBottomRef.current = atBottom;
    if (atBottom) {
      userPinnedRef.current = false;
      userInputActiveRef.current = false;
    }
    setShowScrollToBottom(!atBottom);
  }, []);

  const handleTotalListHeightChanged = useCallback(() => {
    if (!userPinnedRef.current && atBottomRef.current) {
      scrollToBottom("auto");
      return;
    }
    updateBottomState();
  }, [scrollToBottom, updateBottomState]);

  const followOutput = useCallback(() => {
    // Keep the bottom spacer visible by letting handleTotalListHeightChanged
    // drive scrolling to the scroller's real bottom.
    return false;
  }, []);

  useEffect(() => {
    if (!scroller) {
      return;
    }

    const handleScroll = () => {
      updateBottomState();
    };
    const handleUserInput = () => {
      userInputActiveRef.current = true;
    };

    scroller.addEventListener("scroll", handleScroll, { passive: true });
    scroller.addEventListener("wheel", handleUserInput, { passive: true });
    scroller.addEventListener("pointerdown", handleUserInput);
    return () => {
      scroller.removeEventListener("scroll", handleScroll);
      scroller.removeEventListener("wheel", handleUserInput);
      scroller.removeEventListener("pointerdown", handleUserInput);
    };
  }, [scroller, updateBottomState]);

  useEffect(() => {
    if (itemCount === 0) {
      setShowScrollToBottom(false);
      atBottomRef.current = true;
      userPinnedRef.current = false;
      userInputActiveRef.current = false;
      return;
    }

    if (!userPinnedRef.current && atBottomRef.current) {
      scrollToBottom("auto");
    }
  }, [itemCount, scrollToBottom]);

  return {
    virtuosoRef,
    showScrollToBottom,
    followOutput,
    setScrollerRef,
    handleAtBottomStateChange,
    handleTotalListHeightChanged,
    scrollToBottom,
  };
}

function getBottomGap(scroller: HTMLElement): number {
  return Math.max(0, bottomScrollTop(scroller) - scroller.scrollTop);
}

function bottomScrollTop(scroller: HTMLElement): number {
  return Math.max(0, scroller.scrollHeight - scroller.clientHeight);
}

function toVirtuosoScrollBehavior(behavior: ScrollBehavior): VirtuosoScrollBehavior {
  return behavior === "smooth" && !prefersReducedMotion() ? "smooth" : "auto";
}

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
