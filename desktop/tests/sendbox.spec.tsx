import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SendBox } from "@/renderer/components/chat/SendBox";
import { createQuoteMarker } from "@/renderer/utils/quoteMarkers";

describe("SendBox", () => {
  it("renders a Codex-like floating input shell without unavailable actions", () => {
    render(
      <SendBox
        value=""
        runtimeState="idle"
        canSend={false}
        canStop={false}
        statusText="回车发送"
        onChange={vi.fn()}
        onSend={vi.fn()}
        onStop={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("继续输入")).not.toBeNull();
    expect(screen.getByLabelText("继续输入").getAttribute("data-placeholder")).toBe("要求后续变更");
    expect(screen.getByLabelText("继续输入").getAttribute("contenteditable")).toBe("true");
    expect(screen.queryByRole("button", { name: "添加附件" })).toBeNull();
    expect(screen.queryByText("按需审批")).toBeNull();
    expect((screen.getByRole("button", { name: "发送" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("tracks focus state and submits when sending is allowed", () => {
    const onSend = vi.fn();
    render(
      <SendBox
        value="继续修改"
        runtimeState="idle"
        canSend
        canStop={false}
        onChange={vi.fn()}
        onSend={onSend}
        onStop={vi.fn()}
      />,
    );

    const input = screen.getByLabelText("继续输入");
    const form = input.closest("form");
    expect(form?.getAttribute("data-focused")).toBe("false");

    fireEvent.focus(input);
    expect(form?.getAttribute("data-focused")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it("keeps runtime controls immediately before the send button", () => {
    render(
      <SendBox
        value="继续修改"
        runtimeState="idle"
        canSend
        canStop={false}
        statusText="回车发送"
        rightControls={<button type="button" aria-label="选择模型">qwen-coder</button>}
        onChange={vi.fn()}
        onSend={vi.fn()}
        onStop={vi.fn()}
      />,
    );

    const status = screen.getByText("回车发送");
    const model = screen.getByRole("button", { name: "选择模型" });
    const send = screen.getByRole("button", { name: "发送" });

    expect(Boolean(status.compareDocumentPosition(model) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
    expect(Boolean(model.compareDocumentPosition(send) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
  });

  it("switches to stop button while running and prevents repeated send", () => {
    const onSend = vi.fn();
    const onStop = vi.fn();
    render(
      <SendBox
        value="继续修改"
        runtimeState="running"
        canSend={false}
        canStop
        onChange={vi.fn()}
        onSend={onSend}
        onStop={onStop}
      />,
    );

    expect(screen.queryByRole("button", { name: "发送" })).toBeNull();
    expect(screen.getByLabelText("继续输入").getAttribute("aria-disabled")).toBe("true");
    expect(screen.getByLabelText("继续输入").getAttribute("contenteditable")).toBe("false");
    fireEvent.submit(screen.getByRole("form", { name: "继续对话输入" }));
    expect(onSend).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "停止" }));
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it("disables stop while cancelling and restores send after failure", () => {
    const { rerender } = render(
      <SendBox
        value="继续修改"
        runtimeState="cancelling"
        canSend={false}
        canStop={false}
        onChange={vi.fn()}
        onSend={vi.fn()}
        onStop={vi.fn()}
      />,
    );

    expect((screen.getByRole("button", { name: "停止" }) as HTMLButtonElement).disabled).toBe(true);

    rerender(
      <SendBox
        value="继续修改"
        runtimeState="failed"
        canSend
        canStop={false}
        onChange={vi.fn()}
        onSend={vi.fn()}
        onStop={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "发送" })).not.toBeNull();
    expect((screen.getByRole("button", { name: "发送" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("keeps the composer height adaptive for long multiline input", () => {
    const props = {
      runtimeState: "idle" as const,
      canSend: true,
      canStop: false,
      onChange: vi.fn(),
      onSend: vi.fn(),
      onStop: vi.fn(),
    };
    const { rerender } = render(<SendBox value="短文本" {...props} />);
    const input = screen.getByLabelText("继续输入") as HTMLDivElement;

    Object.defineProperty(input, "scrollHeight", { configurable: true, value: 220 });
    rerender(<SendBox value={"第一行\n第二行\n第三行\n第四行"} {...props} />);
    expect(input.style.height).toBe("188px");

    Object.defineProperty(input, "scrollHeight", { configurable: true, value: 82 });
    rerender(<SendBox value={"第一行\n第二行"} {...props} />);
    expect(input.style.height).toBe("82px");
  });

  it("reports plain contenteditable text changes", () => {
    const onChange = vi.fn();
    render(
      <SendBox
        value=""
        runtimeState="idle"
        canSend={false}
        canStop={false}
        onChange={onChange}
        onSend={vi.fn()}
        onStop={vi.fn()}
      />,
    );

    const input = screen.getByLabelText("继续输入");
    input.textContent = "普通输入";
    fireEvent.input(input);

    expect(onChange).toHaveBeenCalledWith("普通输入");
  });

  it("restores the placeholder state after contenteditable content is cleared", () => {
    const onChange = vi.fn();
    render(
      <SendBox
        value="已输入"
        runtimeState="idle"
        canSend
        canStop={false}
        onChange={onChange}
        onSend={vi.fn()}
        onStop={vi.fn()}
      />,
    );

    const input = screen.getByLabelText("继续输入");
    input.replaceChildren(document.createElement("br"));
    fireEvent.input(input);

    expect(onChange).toHaveBeenCalledWith("");
    expect(input.getAttribute("data-empty")).toBe("true");
  });

  it("keeps whitespace-only content as non-empty input", () => {
    const onChange = vi.fn();
    render(
      <SendBox
        value=""
        runtimeState="idle"
        canSend={false}
        canStop={false}
        onChange={onChange}
        onSend={vi.fn()}
        onStop={vi.fn()}
      />,
    );

    const input = screen.getByLabelText("继续输入");
    input.textContent = "   ";
    fireEvent.input(input);

    expect(onChange).toHaveBeenCalledWith("   ");
    expect(input.getAttribute("data-empty")).toBe("false");
  });

  it("renders quoted draft markers as removable top context chips", async () => {
    const onChange = vi.fn();
    vi.stubGlobal("navigator", {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
    vi.useFakeTimers();
    try {
      render(
        <SendBox
          value={createQuoteMarker("这是一段选中的历史内容")}
          runtimeState="idle"
          canSend
          canStop={false}
          onChange={onChange}
          onSend={vi.fn()}
          onStop={vi.fn()}
        />,
      );

      const input = screen.getByLabelText("继续输入");
      expect(input.textContent).toBe("");
      expect(screen.getByLabelText("已添加上下文").textContent).toContain("引用片段");
      fireEvent.mouseOver(screen.getByText("引用片段"));
      act(() => {
        vi.advanceTimersByTime(199);
      });
      expect(screen.queryByText("这是一段选中的历史内容")).toBeNull();
      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(screen.getByText("这是一段选中的历史内容")).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }

    fireEvent.click(screen.getByRole("button", { name: "复制" }));
    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith("这是一段选中的历史内容");
    });

    fireEvent.click(screen.getByRole("button", { name: "删除" }));

    expect(onChange).toHaveBeenCalledWith("");
  });

  it("hides the quote card when the pointer leaves a top context chip", () => {
    vi.useFakeTimers();
    try {
      render(
        <SendBox
          value={createQuoteMarker("这是一段选中的历史内容")}
          runtimeState="idle"
          canSend
          canStop={false}
          onChange={vi.fn()}
          onSend={vi.fn()}
          onStop={vi.fn()}
        />,
      );

      const input = screen.getByLabelText("继续输入");
      fireEvent.mouseOver(screen.getByText("引用片段"));
      act(() => {
        vi.advanceTimersByTime(200);
      });

      expect(screen.getByText("这是一段选中的历史内容")).not.toBeNull();

      const chipWrapper = screen.getByLabelText("已添加上下文").firstElementChild;
      expect(chipWrapper).not.toBeNull();
      fireEvent.mouseLeave(chipWrapper as HTMLElement, { relatedTarget: input });

      act(() => {
        vi.advanceTimersByTime(120);
      });

      expect(screen.queryByText("这是一段选中的历史内容")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps top quote context when editing the visible composer text", () => {
    const marker = createQuoteMarker("这是一段选中的历史内容");
    const onChange = vi.fn();
    render(
      <SendBox
        value={`原文${marker}`}
        runtimeState="idle"
        canSend
        canStop={false}
        onChange={onChange}
        onSend={vi.fn()}
        onStop={vi.fn()}
      />,
    );

    const input = screen.getByLabelText("继续输入");
    expect(input.textContent).toBe("原文");
    expect(screen.getByLabelText("已添加上下文").textContent).toContain("引用片段");

    input.textContent = "更新后正文";
    fireEvent.input(input);

    expect(onChange).toHaveBeenCalledWith(`更新后正文${marker}`);
  });
});
