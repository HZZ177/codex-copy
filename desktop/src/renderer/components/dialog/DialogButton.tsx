import type { ButtonHTMLAttributes, ReactNode } from "react";

import styles from "./AppDialog.module.css";

export type DialogButtonTone = "secondary" | "primary" | "danger";

export interface DialogButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: DialogButtonTone;
  children: ReactNode;
}

export function DialogButton({ tone = "secondary", className = "", children, ...props }: DialogButtonProps) {
  const baseClassName = tone === "secondary" ? styles.secondaryAction : styles.primaryAction;
  return (
    <button
      className={[baseClassName, className].filter(Boolean).join(" ")}
      data-tone={tone === "danger" ? "danger" : undefined}
      {...props}
    >
      {children}
    </button>
  );
}
