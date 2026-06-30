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
});
