import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";

import styles from "./LineChangeTicker.module.css";

const LINE_CHANGE_UPDATE_INTERVAL_MS = 800;
const LINE_CHANGE_DIGIT_ANIMATION_MS = 680;

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
      {label ? <span className={styles.label}>{label}</span> : null}
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
  const animationKeyRef = useRef(0);
  const timeoutRef = useRef<number | null>(null);
  const [digits, setDigits] = useState<RollingDigitState[]>(() => idleDigits(valueText));

  useEffect(() => {
    if (valueText === activeValueRef.current) {
      return;
    }

    const previousText = activeValueRef.current.padStart(valueText.length, " ").slice(-valueText.length);
    activeValueRef.current = valueText;
    animationKeyRef.current += 1;
    clearRollingDigitTimer(timeoutRef);
    setDigits(rollingDigits(previousText, valueText, animationKeyRef.current));
    timeoutRef.current = window.setTimeout(() => {
      timeoutRef.current = null;
      setDigits(idleDigits(valueText));
    }, LINE_CHANGE_DIGIT_ANIMATION_MS);

    return () => {
      clearRollingDigitTimer(timeoutRef);
    };
  }, [valueText]);

  return (
    <span className={styles.number}>
      {digits.map((digit, index) => (
        <RollingDigit digit={digit} key={`${index}:${digit.animationKey}`} />
      ))}
    </span>
  );
}

interface RollingDigitState {
  animationKey: string;
  current: string;
  direction: RollingDirection;
  phase: "idle" | "rolling";
  previous: string;
  sequence: string[];
  steps: number;
}

type RollingDirection = "down" | "up";

function RollingDigit({ digit }: { digit: RollingDigitState }) {
  const changed = digit.phase !== "idle";
  const digitStyle = {
    "--line-change-roll-steps": digit.steps,
  } as CSSProperties;

  return (
    <span
      className={styles.digit}
      data-changed={changed ? "true" : "false"}
      data-direction={digit.direction}
      data-phase={digit.phase}
      data-testid="line-change-digit"
      style={digitStyle}
    >
      <span className={styles.digitWindow}>
        {changed ? (
          <span className={styles.digitTrack} data-testid="line-change-digit-track">
            {digit.sequence.map((glyph, index) => (
              <span className={styles.digitTrackGlyph} key={`${index}:${glyph}`}>
                {glyph}
              </span>
            ))}
          </span>
        ) : (
          <span className={styles.digitGlyph} data-position="static">
            {digit.current}
          </span>
        )}
      </span>
    </span>
  );
}

function rollingDigits(previousText: string, currentText: string, animationKey: number): RollingDigitState[] {
  const currentDigits = currentText.split("");
  return currentDigits.map((current, index) => {
    const previous = previousText[index] ?? current;
    const previousGlyph = previous.trim() ? previous : "\u00a0";
    const changed = current !== previous;
    const direction = changed ? digitDirection() : "down";
    const roll = changed ? rollingDigitSequence(previousGlyph, current, direction) : idleDigitSequence(current);

    return {
      animationKey: changed ? `${animationKey}:${previousGlyph}:${current}` : `idle:${index}:${current}`,
      current,
      direction,
      previous: previousGlyph,
      phase: changed ? "rolling" : "idle",
      sequence: roll.sequence,
      steps: roll.steps,
    };
  });
}

function idleDigits(valueText: string): RollingDigitState[] {
  const currentDigits = valueText.split("");
  return currentDigits.map((current, index) => ({
    animationKey: `idle:${index}:${current}`,
    current,
    direction: "down",
    previous: current,
    phase: "idle",
    sequence: [current],
    steps: 0,
  }));
}

function digitDirection(): RollingDirection {
  return Math.random() < 0.5 ? "up" : "down";
}

function idleDigitSequence(current: string): { sequence: string[]; steps: number } {
  return {
    sequence: [current],
    steps: 0,
  };
}

function rollingDigitSequence(
  previous: string,
  current: string,
  direction: RollingDirection,
): { sequence: string[]; steps: number } {
  if (!isDecimalDigit(previous) || !isDecimalDigit(current)) {
    return direction === "up"
      ? { sequence: [previous, current], steps: 1 }
      : { sequence: [current, previous], steps: 1 };
  }

  const values = [previous];
  const target = Number(current);
  let cursor = Number(previous);
  while (cursor !== target) {
    cursor = direction === "up" ? (cursor + 1) % 10 : (cursor + 9) % 10;
    values.push(String(cursor));
  }

  return direction === "up"
    ? { sequence: values, steps: values.length - 1 }
    : { sequence: values.slice().reverse(), steps: values.length - 1 };
}

function isDecimalDigit(value: string): boolean {
  return value.length === 1 && value >= "0" && value <= "9";
}

function clearRollingDigitTimer(timeoutRef: { current: number | null }) {
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
