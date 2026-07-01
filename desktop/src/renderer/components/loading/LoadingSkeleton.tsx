import styles from "./LoadingSkeleton.module.css";

interface LoadingSkeletonProps {
  "aria-label"?: string;
  className?: string;
  label?: string;
  lineCount?: number;
  stackClassName?: string;
  testId?: string;
  width?: "default" | "compact";
}

export function LoadingSkeleton({
  "aria-label": ariaLabel,
  className,
  label,
  lineCount = 4,
  stackClassName,
  testId,
  width = "default",
}: LoadingSkeletonProps) {
  return (
    <div
      className={joinClassNames(styles.root, className)}
      data-testid={testId}
      role="status"
      aria-label={ariaLabel ?? label}
    >
      {label ? (
        <span className={styles.inlineStatus} aria-hidden="true">
          <span className={styles.inlineDot} />
          <span className={styles.inlineLabel}>{label}</span>
        </span>
      ) : (
        <LoadingSkeletonStack className={stackClassName} lineCount={lineCount} width={width} />
      )}
    </div>
  );
}

interface LoadingSkeletonStackProps {
  className?: string;
  lineCount?: number;
  width?: "default" | "compact";
}

export function LoadingSkeletonStack({
  className,
  lineCount = 4,
  width = "default",
}: LoadingSkeletonStackProps) {
  return (
    <div className={joinClassNames(styles.stack, className)} data-width={width} aria-hidden="true">
      {Array.from({ length: lineCount }, (_, index) => (
        <span className={styles.line} key={index} />
      ))}
    </div>
  );
}

function joinClassNames(...classNames: Array<string | undefined>): string | undefined {
  const value = classNames.filter(Boolean).join(" ");
  return value || undefined;
}
