import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

export interface SelectionPosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TextSelectionOptions {
  enabled?: boolean;
  excludeSelector?: string;
}

export function useTextSelection(
  containerRef: RefObject<HTMLElement | null>,
  enabledOrOptions: boolean | TextSelectionOptions = true,
) {
  const enabled = typeof enabledOrOptions === "boolean" ? enabledOrOptions : enabledOrOptions.enabled ?? true;
  const excludeSelector = typeof enabledOrOptions === "boolean" ? undefined : enabledOrOptions.excludeSelector;
  const [selectedText, setSelectedText] = useState("");
  const [selectionPosition, setSelectionPosition] = useState<SelectionPosition | null>(null);
  const deferredUpdateRef = useRef<number | null>(null);

  const clearSelection = useCallback(() => {
    setSelectedText("");
    setSelectionPosition(null);
    window.getSelection()?.removeAllRanges();
  }, []);

  const updateSelection = useCallback(() => {
    const selection = window.getSelection();
    const text = selection?.toString().trim() ?? "";
    const container = containerRef.current;

    if (!container || !selection || selection.rangeCount === 0 || !text) {
      setSelectedText("");
      setSelectionPosition(null);
      return;
    }

    const range = selection.getRangeAt(0);
    if (
      !container.contains(range.commonAncestorContainer) ||
      rangeTouchesExcludedElement(range, container, excludeSelector)
    ) {
      setSelectedText("");
      setSelectionPosition(null);
      return;
    }

    const rect = selectionRect(range);
    const x = rect.width > 0 ? rect.left + rect.width / 2 : rect.left;
    const y = rect.top;
    setSelectedText(text);
    setSelectionPosition({
      x,
      y,
      width: rect.width,
      height: rect.height,
    });
  }, [containerRef, excludeSelector]);

  useEffect(() => {
    if (!enabled) {
      setSelectedText("");
      setSelectionPosition(null);
      return;
    }

    const hideSelectionToolbar = () => {
      setSelectedText("");
      setSelectionPosition(null);
    };

    const deferredUpdate = () => {
      if (deferredUpdateRef.current !== null) {
        window.clearTimeout(deferredUpdateRef.current);
      }
      deferredUpdateRef.current = window.setTimeout(() => {
        deferredUpdateRef.current = null;
        updateSelection();
      }, 0);
    };
    document.addEventListener("mousedown", hideSelectionToolbar);
    document.addEventListener("mouseup", deferredUpdate);
    document.addEventListener("keyup", updateSelection);
    window.addEventListener("resize", updateSelection);
    window.addEventListener("scroll", updateSelection, true);

    return () => {
      if (deferredUpdateRef.current !== null) {
        window.clearTimeout(deferredUpdateRef.current);
        deferredUpdateRef.current = null;
      }
      document.removeEventListener("mousedown", hideSelectionToolbar);
      document.removeEventListener("mouseup", deferredUpdate);
      document.removeEventListener("keyup", updateSelection);
      window.removeEventListener("resize", updateSelection);
      window.removeEventListener("scroll", updateSelection, true);
    };
  }, [enabled, updateSelection]);

  return { selectedText, selectionPosition, clearSelection };
}

function rangeTouchesExcludedElement(
  range: Range,
  container: HTMLElement,
  excludeSelector: string | undefined,
): boolean {
  if (!excludeSelector) {
    return false;
  }
  return [range.commonAncestorContainer, range.startContainer, range.endContainer]
    .filter((node): node is Node => Boolean(node))
    .some((node) => nodeTouchesExcludedElement(node, container, excludeSelector));
}

function nodeTouchesExcludedElement(node: Node, container: HTMLElement, excludeSelector: string): boolean {
  const element = node instanceof Element ? node : node.parentElement;
  const excluded = element?.closest(excludeSelector);
  return Boolean(excluded && container.contains(excluded));
}

function selectionRect(range: Range): DOMRect {
  const rect = range.getBoundingClientRect();
  if (rect.width > 0 || rect.height > 0) {
    return rect;
  }
  const firstRect = range.getClientRects().item(0);
  return firstRect ?? rect;
}
