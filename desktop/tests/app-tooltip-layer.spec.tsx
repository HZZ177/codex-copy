import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppTooltipLayer } from "@/renderer/components/tooltip";

describe("AppTooltipLayer", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows scoped button labels with the custom tooltip layer", () => {
    vi.useFakeTimers();
    render(
      <div data-tooltip-scope="true">
        <AppTooltipLayer scopeSelector="[data-tooltip-scope='true']" delayMs={20} />
        <button type="button" aria-label="复制消息" data-tooltip-label="复制消息">
          copy
        </button>
      </div>,
    );

    fireEvent.pointerOver(screen.getByRole("button", { name: "复制消息" }));
    act(() => vi.advanceTimersByTime(20));

    expect(screen.getByRole("tooltip").textContent).toBe("复制消息");
  });

  it("suppresses native titles while hovering and restores them after hide", () => {
    vi.useFakeTimers();
    render(
      <div data-tooltip-scope="true">
        <AppTooltipLayer scopeSelector="[data-tooltip-scope='true']" delayMs={20} />
        <button type="button" aria-label="定位当前文件" data-tooltip="true" title="定位当前文件">
          locate
        </button>
      </div>,
    );

    const button = screen.getByRole("button", { name: "定位当前文件" });
    fireEvent.pointerOver(button);
    expect(button.getAttribute("title")).toBeNull();

    act(() => vi.advanceTimersByTime(20));
    expect(screen.getByRole("tooltip").textContent).toBe("定位当前文件");

    fireEvent.pointerOut(button);
    expect(screen.queryByRole("tooltip")).toBeNull();
    expect(button.getAttribute("title")).toBe("定位当前文件");
  });

  it("prefers explicit functional labels over contextual accessible names", () => {
    vi.useFakeTimers();
    render(
      <div data-tooltip-scope="true">
        <AppTooltipLayer scopeSelector="[data-tooltip-scope='true']" delayMs={20} />
        <button type="button" aria-label="置顶 初次问候与自我介绍 分支" data-tooltip-label="置顶">
          <span aria-hidden="true">pin</span>
        </button>
      </div>,
    );

    fireEvent.pointerOver(screen.getByRole("button", { name: "置顶 初次问候与自我介绍 分支" }));
    act(() => vi.advanceTimersByTime(20));

    expect(screen.getByRole("tooltip").textContent).toBe("置顶");
  });

  it("does not infer contextual labels for visible text buttons without an explicit tooltip", () => {
    vi.useFakeTimers();
    render(
      <div data-tooltip-scope="true">
        <AppTooltipLayer scopeSelector="[data-tooltip-scope='true']" delayMs={20} />
        <button type="button" aria-label="置顶 初次问候与自我介绍 分支">
          置顶
        </button>
      </div>,
    );

    fireEvent.pointerOver(screen.getByRole("button", { name: "置顶 初次问候与自我介绍 分支" }));
    act(() => vi.advanceTimersByTime(20));

    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("does not infer labels from aria-label without an explicit tooltip opt-in", () => {
    vi.useFakeTimers();
    render(
      <div data-tooltip-scope="true">
        <AppTooltipLayer scopeSelector="[data-tooltip-scope='true']" delayMs={20} />
        <button type="button" aria-label="展开工具详情">
          <span aria-hidden="true">⌄</span>
        </button>
      </div>,
    );

    fireEvent.pointerOver(screen.getByRole("button", { name: "展开工具详情" }));
    act(() => vi.advanceTimersByTime(20));

    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("keeps edge tooltips inside the viewport", () => {
    vi.useFakeTimers();
    const originalInnerWidth = window.innerWidth;
    const originalInnerHeight = window.innerHeight;
    const originalRect = HTMLElement.prototype.getBoundingClientRect;
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 800 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 600 });
    HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
      const element = this as HTMLElement;
      if (element.getAttribute("role") === "tooltip") {
        const left = Number.parseFloat(element.style.left || "0");
        const top = Number.parseFloat(element.style.top || "0");
        return domRect({
          left: left - 60,
          right: left + 60,
          top: top - 24,
          bottom: top - 4,
          width: 120,
          height: 20,
        });
      }
      if (element.dataset.edgeTarget === "true") {
        return domRect({ left: 780, right: 800, top: 100, bottom: 120, width: 20, height: 20 });
      }
      return originalRect.call(this);
    };

    try {
      render(
        <div data-tooltip-scope="true">
          <AppTooltipLayer scopeSelector="[data-tooltip-scope='true']" delayMs={20} />
          <button type="button" aria-label="打开文件" data-edge-target="true" data-tooltip-label="打开文件">
            open
          </button>
        </div>,
      );

      fireEvent.pointerOver(screen.getByRole("button", { name: "打开文件" }));
      act(() => vi.advanceTimersByTime(20));

      const tooltip = screen.getByRole("tooltip");
      expect(tooltip.textContent).toBe("打开文件");
      expect(Number.parseFloat(tooltip.style.left)).toBe(732);
    } finally {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: originalInnerWidth });
      Object.defineProperty(window, "innerHeight", { configurable: true, value: originalInnerHeight });
      HTMLElement.prototype.getBoundingClientRect = originalRect;
    }
  });
});

function domRect({
  left,
  right,
  top,
  bottom,
  width,
  height,
}: {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
}): DOMRect {
  return {
    left,
    right,
    top,
    bottom,
    width,
    height,
    x: left,
    y: top,
    toJSON: () => ({}),
  };
}
