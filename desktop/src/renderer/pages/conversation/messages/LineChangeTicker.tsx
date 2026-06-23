import { useEffect, useMemo, useRef, useState } from "react";

import styles from "./LineChangeTicker.module.css";

const LINE_CHANGE_UPDATE_INTERVAL_MS = 500;
const LINE_CHANGE_DIGIT_ANIMATION_MS = 560;

export interface LineChangeTickerProps {
  className?: string;
  label: string;
  added?: number;
  removed?: number;
  unit?: string;
}

export function LineChangeTicker({ className, label, added = 0, removed = 0, unit = "行" }: LineChangeTickerProps) {
  const displayed = useThrottledLineDeltas({ added, removed }, LINE_CHANGE_UPDATE_INTERVAL_MS);
  const accessibleText = useMemo(() => {
    const parts = [label];
    if (displayed.added > 0) {
      parts.push(`新增 ${displayed.added} ${unit}`);
    }
    if (displayed.removed > 0) {
      parts.push(`减少 ${displayed.removed} ${unit}`);
    }
    return parts.join(" ");
  }, [displayed.added, displayed.removed, label, unit]);

  return (
    <span
      className={className ? `${styles.ticker} ${className}` : styles.ticker}
      aria-label={accessibleText}
      data-testid="line-change-ticker"
    >
      <span className={styles.label}>{label}</span>
      {displayed.added > 0 ? <LineDelta kind="added" sign="+" value={displayed.added} unit={unit} /> : null}
      {displayed.removed > 0 ? <LineDelta kind="removed" sign="-" value={displayed.removed} unit={unit} /> : null}
    </span>
  );
}

interface LineDeltas {
  added: number;
  removed: number;
}

function useThrottledLineDeltas(next: LineDeltas, intervalMs: number): LineDeltas {
  const normalizedNext = {
    added: normalizeDelta(next.added),
    removed: normalizeDelta(next.removed),
  };
  const [displayed, setDisplayed] = useState<LineDeltas>(() => normalizedNext);
  const displayedRef = useRef<LineDeltas>(normalizedNext);
  const pendingRef = useRef<LineDeltas>(normalizedNext);
  const lastCommitAtRef = useRef(Date.now());
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    pendingRef.current = normalizedNext;

    if (sameDeltas(normalizedNext, displayedRef.current)) {
      return;
    }

    const commit = () => {
      timeoutRef.current = null;
      const pending = pendingRef.current;
      displayedRef.current = pending;
      lastCommitAtRef.current = Date.now();
      setDisplayed(pending);
    };

    const elapsed = Date.now() - lastCommitAtRef.current;
    if (elapsed >= intervalMs) {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
      }
      commit();
      return;
    }

    if (timeoutRef.current === null) {
      timeoutRef.current = window.setTimeout(commit, intervalMs - elapsed);
    }
  }, [intervalMs, normalizedNext.added, normalizedNext.removed]);

  useEffect(
    () => () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
      }
    },
    [],
  );

  return displayed;
}

function LineDelta({
  kind,
  sign,
  value,
  unit,
}: {
  kind: "added" | "removed";
  sign: "+" | "-";
  value: number;
  unit: string;
}) {
  return (
    <span className={styles.delta} data-kind={kind} aria-hidden="true">
      <span className={styles.sign}>{sign}</span>
      <RollingNumber value={value} />
      <span className={styles.unit}>{unit}</span>
    </span>
  );
}

function RollingNumber({ value }: { value: number }) {
  const valueText = String(Math.max(0, value));
  const activeValueRef = useRef(valueText);
  const frameRef = useRef<number | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const [digits, setDigits] = useState<RollingDigitState[]>(() => idleDigits(valueText));

  useEffect(() => {
    if (valueText === activeValueRef.current) {
      return;
    }

    const previousText = activeValueRef.current.padStart(valueText.length, " ").slice(-valueText.length);
    activeValueRef.current = valueText;
    clearRollingDigitTimers(frameRef, timeoutRef);
    setDigits(prepareDigits(previousText, valueText));

    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      setDigits((currentDigits) =>
        currentDigits.map((digit) => (digit.phase === "prepare" ? { ...digit, phase: "rolling" } : digit)),
      );
      timeoutRef.current = window.setTimeout(() => {
        timeoutRef.current = null;
        setDigits(idleDigits(valueText));
      }, LINE_CHANGE_DIGIT_ANIMATION_MS);
    });

    return () => {
      clearRollingDigitTimers(frameRef, timeoutRef);
    };
  }, [valueText]);

  return (
    <span className={styles.number}>
      {digits.map((digit, index) => (
        <RollingDigit digit={digit} key={index} />
      ))}
    </span>
  );
}

interface RollingDigitState {
  current: string;
  phase: "idle" | "prepare" | "rolling";
  previous: string;
}

function RollingDigit({ digit }: { digit: RollingDigitState }) {
  const changed = digit.phase !== "idle";
  return (
    <span
      className={styles.digit}
      data-changed={changed ? "true" : "false"}
      data-phase={digit.phase}
      data-testid="line-change-digit"
    >
      <span className={styles.digitWindow}>
        {changed ? (
          <>
            <span className={styles.digitGlyph} data-position="previous">
              {digit.previous}
            </span>
            <span className={styles.digitGlyph} data-position="current">
              {digit.current}
            </span>
          </>
        ) : (
          <span className={styles.digitGlyph} data-position="static">
            {digit.current}
          </span>
        )}
      </span>
    </span>
  );
}

function prepareDigits(previousText: string, currentText: string): RollingDigitState[] {
  return currentText.split("").map((current, index) => {
    const previous = previousText[index] ?? current;
    const previousGlyph = previous.trim() ? previous : "\u00a0";
    return {
      current,
      previous: previousGlyph,
      phase: current === previous ? "idle" : "prepare",
    };
  });
}

function idleDigits(valueText: string): RollingDigitState[] {
  return valueText.split("").map((current) => ({
    current,
    previous: current,
    phase: "idle",
  }));
}

function clearRollingDigitTimers(
  frameRef: { current: number | null },
  timeoutRef: { current: number | null },
) {
  if (frameRef.current !== null) {
    window.cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
  }
  if (timeoutRef.current !== null) {
    window.clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
  }
}

function normalizeDelta(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function sameDeltas(left: LineDeltas, right: LineDeltas): boolean {
  return left.added === right.added && left.removed === right.removed;
}
