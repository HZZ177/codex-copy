import { Check, ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { FloatingLayer, type FloatingPlacement } from "@/renderer/components/floating";

import styles from "./SettingsSelect.module.css";

export interface SettingsSelectOption<T extends string> {
  description?: string;
  label: string;
  value: T;
}

export interface SettingsSelectProps<T extends string> {
  ariaLabel: string;
  disabled?: boolean;
  onChange: (value: T) => void;
  options: Array<SettingsSelectOption<T>>;
  placeholder?: string;
  placement?: FloatingPlacement;
  value: T | null;
}

export function SettingsSelect<T extends string>({
  ariaLabel,
  disabled = false,
  onChange,
  options,
  placeholder = "请选择",
  placement = "bottom",
  value,
}: SettingsSelectProps<T>) {
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const selectedOption = options.find((option) => option.value === value) ?? null;
  const triggerLabel = selectedOption?.label ?? placeholder;

  useEffect(() => {
    if (disabled) {
      setOpen(false);
    }
  }, [disabled]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const chooseOption = (nextValue: T) => {
    setOpen(false);
    if (nextValue !== value) {
      onChange(nextValue);
    }
  };

  return (
    <div className={styles.root} data-open={open ? "true" : "false"} ref={rootRef}>
      <button
        aria-controls={open ? menuId : undefined}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={`${ariaLabel}：${triggerLabel}`}
        className={styles.trigger}
        disabled={disabled}
        type="button"
        onClick={() => setOpen((current) => !current)}
      >
        <span className={styles.triggerText}>
          <strong>{triggerLabel}</strong>
        </span>
        <ChevronDown aria-hidden="true" data-open={open ? "true" : "false"} size={16} />
      </button>

      {open ? (
        <FloatingLayer
          alignment="end"
          anchorRef={rootRef}
          className={styles.dropdown}
          floatingRef={menuRef}
          matchAnchorWidth
          placement={placement}
        >
          <div id={menuId} role="listbox" aria-label={`${ariaLabel}选项`}>
            {options.map((option) => {
              const active = option.value === value;
              return (
                <button
                  aria-selected={active}
                  className={styles.option}
                  data-active={active ? "true" : "false"}
                  key={option.value}
                  role="option"
                  type="button"
                  onClick={() => chooseOption(option.value)}
                >
                  <span>
                    <strong>{option.label}</strong>
                    {option.description ? <small>{option.description}</small> : null}
                  </span>
                  {active ? <Check aria-hidden="true" size={15} /> : null}
                </button>
              );
            })}
          </div>
        </FloatingLayer>
      ) : null}
    </div>
  );
}
