import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { selectedQuoteFromText } from "../src/renderer/components/chat/SendBox";
import type { RuntimeModelSelection } from "../src/renderer/components/model";
import {
  ConversationComposer,
  conversationComposerStatusText,
  isConversationBusy,
} from "../src/renderer/pages/conversation/ConversationComposer";

describe("ConversationComposer", () => {
  it("keeps the shared SendBox implementation and allows surface-specific chrome", () => {
    render(
      <ConversationComposer
        value=""
        runtimeState="idle"
        canSend={false}
        canStop={false}
        connectionReady
        modelSelection={modelSelection()}
        workspaceSkills={[]}
        selectedSkill={null}
        externalFileRequest={null}
        externalQuoteRequest={null}
        controls={<button type="button">展开消息</button>}
        className="compact-composer"
        placeholder="工作台输入"
        ariaLabel="工作台助手表单"
        inputLabel="工作台助手输入"
        onChange={vi.fn()}
        onSkillChange={vi.fn()}
        onSend={vi.fn()}
        onStop={vi.fn()}
      />,
    );

    const form = screen.getByRole("form", { name: "工作台助手表单" });
    expect(form.getAttribute("data-sendbox-root")).toBe("true");
    expect(form.className).toContain("compact-composer");
    expect(screen.getByRole("textbox", { name: "工作台助手输入" }).getAttribute("data-placeholder")).toBe("工作台输入");
    expect(screen.getByRole("button", { name: "展开消息" })).not.toBeNull();
    expect((screen.getByRole("button", { name: "发送" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("routes text changes and send actions through the supplied handlers", async () => {
    const onChange = vi.fn();
    const onSend = vi.fn();
    render(
      <ConversationComposer
        value=""
        runtimeState="idle"
        canSend
        canStop={false}
        connectionReady
        modelSelection={modelSelection()}
        workspaceSkills={[]}
        selectedSkill={null}
        externalFileRequest={null}
        externalQuoteRequest={null}
        onChange={onChange}
        onSkillChange={vi.fn()}
        onSend={onSend}
        onStop={vi.fn()}
      />,
    );

    const input = screen.getByRole("textbox", { name: "继续输入" });
    input.textContent = "hello";
    fireEvent.input(input);
    expect(onChange).toHaveBeenLastCalledWith("hello");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "发送" }));
    });
    expect(onSend).toHaveBeenCalledWith([], []);
  });

  it("does not render Workbench dock controls unless the surface supplies them", () => {
    render(
      <ConversationComposer
        value=""
        runtimeState="idle"
        canSend={false}
        canStop={false}
        connectionReady
        modelSelection={modelSelection()}
        workspaceSkills={[]}
        selectedSkill={null}
        externalFileRequest={null}
        externalQuoteRequest={null}
        onChange={vi.fn()}
        onSkillChange={vi.fn()}
        onSend={vi.fn()}
        onStop={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: "展开工作台消息层" })).toBeNull();
    expect(screen.queryByRole("button", { name: "将工作台助手展开到右侧" })).toBeNull();
  });

  it("renders external file and quote chips through the shared SendBox", async () => {
    const quote = selectedQuoteFromText("引用片段内容", {
      source: "annotation",
      file: {
        path: "docs/guide.md",
        name: "guide.md",
        lineStart: 4,
        lineEnd: 4,
      },
    });
    if (!quote) {
      throw new Error("quote not created");
    }
    render(
      <ConversationComposer
        value=""
        runtimeState="idle"
        canSend={false}
        canStop={false}
        connectionReady
        modelSelection={modelSelection()}
        workspaceSkills={[]}
        selectedSkill={null}
        externalFileRequest={{
          requestId: 1,
          file: { path: "src/main.ts", name: "main.ts", type: "file", source: "workspace" },
        }}
        externalQuoteRequest={{ requestId: 1, quote }}
        onSearchWorkspace={vi.fn().mockResolvedValue([])}
        onChange={vi.fn()}
        onSkillChange={vi.fn()}
        onSend={vi.fn()}
        onStop={vi.fn()}
      />,
    );

    expect(await screen.findByLabelText("已添加上下文")).not.toBeNull();
    expect(screen.getByLabelText("已添加上下文").textContent).toContain("main.ts");
    expect(screen.getByLabelText("已添加上下文").textContent).toContain("guide.md · L4");
  });

  it("keeps status and busy semantics shared between Agent and Workbench surfaces", () => {
    expect(isConversationBusy("running")).toBe(true);
    expect(isConversationBusy("cancelling")).toBe(true);
    expect(isConversationBusy("idle")).toBe(false);
    expect(conversationComposerStatusText("idle", false)).toBe("正在连接后端");
    expect(conversationComposerStatusText("failed", true)).toBe("可以修改后重新发送");
    expect(conversationComposerStatusText("running", true)).toBe("");
  });
});

function modelSelection(): RuntimeModelSelection {
  return {
    selectedModel: "qwen-coder",
    setSelectedModel: vi.fn(),
    modelOptions: ["qwen-coder"],
    modelLoadState: "ready",
    modelError: null,
  };
}
