import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { RuntimeModelSelector } from "@/renderer/components/model";

describe("RuntimeModelSelector", () => {
  it("selects models with arrow keys from the search field", async () => {
    const onModelChange = vi.fn();

    render(
      <RuntimeModelSelector
        model="qwen-coder"
        modelOptions={["qwen-coder", "deepseek-coder", "kimi-k2"]}
        modelLoadState="ready"
        modelError={null}
        onModelChange={onModelChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "选择模型" }));
    const search = screen.getByLabelText("筛选模型");

    await waitFor(() => {
      expect(screen.getByRole("option", { name: "qwen-coder" }).getAttribute("data-active")).toBe("true");
    });

    fireEvent.keyDown(search, { key: "ArrowDown" });
    expect(screen.getByRole("option", { name: "deepseek-coder" }).getAttribute("data-active")).toBe("true");

    fireEvent.keyDown(search, { key: "Enter" });

    expect(onModelChange).toHaveBeenCalledWith("deepseek-coder");
    expect(screen.queryByRole("listbox", { name: "模型" })).toBeNull();
  });

  it("wraps model keyboard navigation from the first option to the last", async () => {
    const onModelChange = vi.fn();

    render(
      <RuntimeModelSelector
        model="qwen-coder"
        modelOptions={["qwen-coder", "deepseek-coder", "kimi-k2"]}
        modelLoadState="ready"
        modelError={null}
        onModelChange={onModelChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "选择模型" }));
    const search = screen.getByLabelText("筛选模型");

    await waitFor(() => {
      expect(screen.getByRole("option", { name: "qwen-coder" }).getAttribute("data-active")).toBe("true");
    });

    fireEvent.keyDown(search, { key: "ArrowUp" });
    expect(screen.getByRole("option", { name: "kimi-k2" }).getAttribute("data-active")).toBe("true");

    fireEvent.keyDown(search, { key: "Enter" });

    expect(onModelChange).toHaveBeenCalledWith("kimi-k2");
  });
});
