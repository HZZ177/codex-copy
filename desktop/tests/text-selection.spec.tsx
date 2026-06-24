import { act, cleanup, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useTextSelection } from "@/renderer/pages/conversation/messages/useTextSelection";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("useTextSelection", () => {
  it("shares global selection work across mounted containers", async () => {
    render(
      <>
        <SelectionHost id="first">First markdown block</SelectionHost>
        <SelectionHost id="second">Second markdown block</SelectionHost>
      </>,
    );

    const toString = vi.fn(() => "Second markdown block");
    const getBoundingClientRect = vi.fn(() => rect());
    mockSelection(screen.getByTestId("second-content"), toString, getBoundingClientRect);

    await act(async () => {
      document.dispatchEvent(new MouseEvent("mouseup"));
      await nextTick();
    });

    expect(toString).toHaveBeenCalledTimes(1);
    expect(getBoundingClientRect).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("first-selection").textContent).toBe("");
    expect(screen.getByTestId("second-selection").textContent).toBe("Second markdown block");
  });
});

function SelectionHost({ id, children }: { id: string; children: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const selection = useTextSelection(ref, true);
  return (
    <section>
      <div ref={ref} data-testid={`${id}-content`}>
        {children}
      </div>
      <output data-testid={`${id}-selection`}>{selection.selectedText}</output>
    </section>
  );
}

function mockSelection(
  container: Element,
  toString: () => string,
  getBoundingClientRect: () => DOMRect,
): void {
  const range = document.createRange();
  range.selectNodeContents(container);
  range.getBoundingClientRect = getBoundingClientRect;
  range.getClientRects = () => emptyDomRectList();
  vi.spyOn(window, "getSelection").mockReturnValue({
    toString,
    rangeCount: 1,
    getRangeAt: () => range,
    removeAllRanges: vi.fn(),
  } as unknown as Selection);
}

function rect(): DOMRect {
  return {
    x: 120,
    y: 140,
    left: 120,
    top: 140,
    right: 220,
    bottom: 160,
    width: 100,
    height: 20,
    toJSON: () => ({}),
  } as DOMRect;
}

function emptyDomRectList(): DOMRectList {
  return {
    length: 0,
    item: () => null,
    [Symbol.iterator]: function* () {
      return;
    },
  } as DOMRectList;
}

function nextTick(): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, 0);
  });
}
