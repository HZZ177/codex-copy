import { useEffect, useRef, useState } from "react";

import { calculateDynamicStreamStep } from "@/renderer/hooks/useDynamicStreamBuffer";
import {
  createRuntimeTypingSpeedSourceId,
  reportRuntimeTypingSpeed,
} from "@/renderer/hooks/useRuntimeTypingSpeed";

export interface UseTypingAnimationOptions {
  content: string;
  enabled?: boolean;
  completeImmediately?: boolean;
  fastDrain?: boolean;
  resetKey?: string;
}

export function useTypingAnimation({
  content,
  enabled = true,
  completeImmediately = false,
  fastDrain = false,
  resetKey = "",
}: UseTypingAnimationOptions) {
  const initialContent = initialDisplayedContent(content, enabled, completeImmediately, resetKey);
  const [displayedContent, setDisplayedContent] = useState(initialContent);
  const [isAnimating, setIsAnimating] = useState(false);
  const frameRef = useRef<number | null>(null);
  const contentRef = useRef(content);
  const displayedRef = useRef(initialContent);
  const lastTimestampRef = useRef<number | null>(null);
  const speedSourceIdRef = useRef(createRuntimeTypingSpeedSourceId());
  const carryRef = useRef(0);
  const fastDrainRef = useRef(fastDrain);
  const resetKeyRef = useRef(resetKey);

  const commitDisplayedContent = (nextContent: string) => {
    displayedRef.current = nextContent;
    rememberDisplayedContent(resetKeyRef.current, nextContent);
    setDisplayedContent(nextContent);
  };

  const cancelFrame = () => {
    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    lastTimestampRef.current = null;
    carryRef.current = 0;
    reportRuntimeTypingSpeed(speedSourceIdRef.current, 0);
  };

  useEffect(() => {
    contentRef.current = content;
    if (fastDrainRef.current !== fastDrain) {
      fastDrainRef.current = fastDrain;
      carryRef.current = 0;
    }

    if (resetKeyRef.current !== resetKey) {
      resetKeyRef.current = resetKey;
      cancelFrame();
      commitDisplayedContent(initialDisplayedContent(content, enabled, completeImmediately, resetKey));
    }

    if (completeImmediately || prefersReducedMotion()) {
      cancelFrame();
      commitDisplayedContent(content);
      setIsAnimating(false);
      return;
    }

    if (content === displayedRef.current) {
      return;
    }

    const diff = content.length - displayedRef.current.length;
    if (diff < 0 || !content.startsWith(displayedRef.current)) {
      cancelFrame();
      commitDisplayedContent(content);
      setIsAnimating(false);
      return;
    }

    if (!enabled && diff <= 0) {
      cancelFrame();
      commitDisplayedContent(content);
      setIsAnimating(false);
      return;
    }

    setIsAnimating(true);

    const animate = (timestamp: number) => {
      const targetContent = contentRef.current;
      const currentContent = displayedRef.current;
      const backlog = targetContent.length - currentContent.length;
      if (backlog <= 0) {
        frameRef.current = null;
        lastTimestampRef.current = null;
        reportRuntimeTypingSpeed(speedSourceIdRef.current, 0);
        setIsAnimating(false);
        return;
      }

      const lastTimestamp = lastTimestampRef.current ?? timestamp;
      const elapsed = timestamp - lastTimestamp;
      if (elapsed > 0) {
        const step = calculateDynamicStreamStep(
          elapsed,
          backlog,
          carryRef.current,
          fastDrainRef.current ? FAST_DRAIN_STREAM_STEP_OPTIONS : undefined,
        );
        reportRuntimeTypingSpeed(
          speedSourceIdRef.current,
          step.effectiveCharsPerSecond,
          Math.max(0, backlog - step.chars),
        );
        carryRef.current = step.carry;
        if (step.chars > 0) {
          commitDisplayedContent(targetContent.slice(0, currentContent.length + step.chars));
        }
        lastTimestampRef.current = timestamp;
      }

      if (displayedRef.current.length < targetContent.length) {
        frameRef.current = window.requestAnimationFrame(animate);
        return;
      }

      frameRef.current = null;
      lastTimestampRef.current = null;
      reportRuntimeTypingSpeed(speedSourceIdRef.current, 0);
      setIsAnimating(false);
    };

    if (frameRef.current === null) {
      lastTimestampRef.current = performance.now();
      frameRef.current = window.requestAnimationFrame(animate);
    }
  }, [completeImmediately, content, enabled, fastDrain, resetKey]);

  useEffect(() => cancelFrame, []);

  return { displayedContent, isAnimating };
}

const INITIAL_STREAM_BACKLOG_CHARS = 420;
const INITIAL_STREAM_PREFIX_CHARS = 24;
const MAX_DISPLAY_CACHE_SIZE = 80;
const FAST_DRAIN_STREAM_STEP_OPTIONS = {
  minCharsPerSecond: 800,
  maxCharsPerSecond: 12000,
  comfortableBacklog: 1,
  drainTargetSeconds: 0.7,
};
const displayedContentByKey = new Map<string, string>();

function initialDisplayedContent(
  content: string,
  enabled: boolean,
  completeImmediately: boolean,
  resetKey: string,
): string {
  if (!enabled || completeImmediately || prefersReducedMotion()) {
    return content;
  }
  const cached = resetKey ? displayedContentByKey.get(resetKey) : undefined;
  if (cached !== undefined && content.startsWith(cached)) {
    return cached;
  }
  if (content.length <= INITIAL_STREAM_BACKLOG_CHARS) {
    return content;
  }
  const displayedLength = Math.max(INITIAL_STREAM_PREFIX_CHARS, content.length - INITIAL_STREAM_BACKLOG_CHARS);
  return content.slice(0, displayedLength);
}

function rememberDisplayedContent(resetKey: string, content: string) {
  if (!resetKey) {
    return;
  }
  displayedContentByKey.delete(resetKey);
  displayedContentByKey.set(resetKey, content);
  while (displayedContentByKey.size > MAX_DISPLAY_CACHE_SIZE) {
    const oldestKey = displayedContentByKey.keys().next().value;
    if (!oldestKey) {
      break;
    }
    displayedContentByKey.delete(oldestKey);
  }
}

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
