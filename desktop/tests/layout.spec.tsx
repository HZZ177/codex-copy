import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";

import { Layout } from "@/renderer/components/layout/Layout";
import { LayoutStateProvider } from "@/renderer/hooks/layout/LayoutStateProvider";
import { MessageText } from "@/renderer/pages/conversation/messages";
import { PreviewProvider, usePreview } from "@/renderer/providers/PreviewProvider";
import type { ConversationMessage } from "@/renderer/stores/conversationStore";
import { ThemeProvider } from "@/renderer/providers/ThemeProvider";

function renderLayout(ui: ReactElement) {
  return render(
    <ThemeProvider>
      <LayoutStateProvider>{ui}</LayoutStateProvider>
    </ThemeProvider>,
  );
}

function renderLayoutWithPreview(ui: ReactElement) {
  return render(
    <ThemeProvider>
      <LayoutStateProvider>
        <PreviewProvider>{ui}</PreviewProvider>
      </LayoutStateProvider>
    </ThemeProvider>,
  );
}

describe("Layout", () => {
  it("renders the Keydex-like shell without removed product entries", () => {
    renderLayout(
      <Layout title="测试会话">
        <div>内容区</div>
      </Layout>,
    );

    expect(screen.getByTestId("app-shell").dataset.sidebar).toBe("expanded");
    expect(screen.getByTestId("app-shell").dataset.rightSidebar).toBe("closed");
    expect(screen.getByText("测试会话")).not.toBeNull();
    expect(screen.getByLabelText("展开右侧栏")).not.toBeNull();
    expect(screen.getByText("新对话")).not.toBeNull();
    expect(screen.queryByText("Team")).toBeNull();
    expect(screen.queryByText("Cron")).toBeNull();
    expect(screen.queryByText("自动化")).toBeNull();
  });

  it("toggles sidebar collapse state", () => {
    renderLayout(
      <Layout>
        <div>内容区</div>
      </Layout>,
    );

    const shell = screen.getByTestId("app-shell");
    expect(shell.dataset.sidebarMotion).toBe("false");
    fireEvent.click(screen.getByLabelText("折叠侧边栏"));
    expect(shell.dataset.sidebar).toBe("collapsed");
    expect(shell.dataset.sidebarMotion).toBe("true");
    fireEvent.click(screen.getByLabelText("展开侧边栏"));
    expect(shell.dataset.sidebar).toBe("expanded");
    expect(shell.dataset.sidebarMotion).toBe("true");
  });

  it("resizes the shared sidebar width from the shell handle", () => {
    renderLayout(
      <Layout>
        <div>内容区</div>
      </Layout>,
    );

    const shell = screen.getByTestId("app-shell");
    const handle = screen.getByRole("separator", { name: "调整侧边栏宽度" });

    fireEvent.keyDown(handle, { key: "ArrowRight" });

    expect(shell.getAttribute("style")).toContain("--sidebar-width: 298px");
    expect(shell.dataset.sidebarMotion).toBe("false");

    fireEvent.doubleClick(handle);

    expect(shell.getAttribute("style")).toContain("--sidebar-width: 286px");
  });

  it("toggles, maximizes and resizes the conversation right sidebar", () => {
    renderLayout(
      <Layout>
        <div>内容区</div>
      </Layout>,
    );

    const shell = screen.getByTestId("app-shell");
    expect(shell.dataset.rightSidebarMotion).toBe("false");

    fireEvent.click(screen.getByLabelText("展开右侧栏"));

    expect(shell.dataset.rightSidebar).toBe("open");
    expect(shell.dataset.rightSidebarMode).toBe("split");
    expect(shell.dataset.rightSidebarPlacement).toBe("right");
    expect(shell.dataset.rightSidebarMotion).toBe("true");
    expect(screen.getByRole("complementary", { name: "右侧栏" })).not.toBeNull();
    expect(screen.getByRole("tablist", { name: "侧边栏窗口" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "新建侧边栏页面" })).not.toBeNull();
    expect(screen.getByTestId("right-sidebar-initial-page")).not.toBeNull();
    expect(screen.getByText("暂无侧边内容")).not.toBeNull();
    expect(screen.queryByRole("heading", { name: "侧边栏" })).toBeNull();

    const handle = screen.getByRole("separator", { name: "调整右侧栏宽度" });
    fireEvent.keyDown(handle, { key: "ArrowLeft" });
    expect(shell.getAttribute("style")).toContain("--right-sidebar-ratio: 0.46");
    expect(shell.getAttribute("style")).toContain("--right-sidebar-width: 339px");

    fireEvent.doubleClick(handle);
    expect(shell.getAttribute("style")).toContain("--right-sidebar-ratio: 0.45");
    expect(shell.getAttribute("style")).toContain("--right-sidebar-width: 332px");

    fireEvent.click(screen.getByLabelText("展开右侧栏到对话区域"));
    expect(shell.dataset.rightSidebarMode).toBe("maximized");
    expect(screen.getByRole("separator", { name: "调整右侧栏宽度" }).getAttribute("data-disabled")).toBe("true");

    fireEvent.click(screen.getByLabelText("缩小右侧栏"));
    expect(shell.dataset.rightSidebarMode).toBe("split");
    expect(screen.getByRole("separator", { name: "调整右侧栏宽度" }).getAttribute("data-disabled")).toBe("false");

    fireEvent.click(screen.getByLabelText("折叠右侧栏"));
    expect(shell.dataset.rightSidebar).toBe("closed");
    expect(shell.dataset.rightSidebarMode).toBe("split");
    expect(shell.dataset.rightSidebarMotion).toBe("true");
    expect(screen.queryByRole("complementary", { name: "右侧栏" })).toBeNull();
  });

  it("swaps the conversation area and side panel across the split handle", () => {
    renderLayout(
      <Layout>
        <div>内容区</div>
      </Layout>,
    );

    const shell = screen.getByTestId("app-shell");
    fireEvent.click(screen.getByLabelText("展开右侧栏"));

    expect(shell.dataset.rightSidebarPlacement).toBe("right");
    expect(screen.getByRole("complementary", { name: "右侧栏" })).not.toBeNull();

    fireEvent.click(screen.getByLabelText("交换对话区和侧边栏位置"));

    expect(shell.dataset.rightSidebarPlacement).toBe("left");
    expect(screen.getByRole("complementary", { name: "左侧栏" })).not.toBeNull();
    expect(screen.queryByRole("complementary", { name: "右侧栏" })).toBeNull();
    expect(screen.getByLabelText("展开左侧栏到对话区域")).not.toBeNull();
    expect(screen.getByLabelText("折叠左侧栏")).not.toBeNull();

    const leftHandle = screen.getByRole("separator", { name: "调整左侧栏宽度" });
    fireEvent.keyDown(leftHandle, { key: "ArrowRight" });
    expect(shell.getAttribute("style")).toContain("--right-sidebar-ratio: 0.46");

    fireEvent.keyDown(leftHandle, { key: "ArrowLeft" });
    expect(shell.getAttribute("style")).toContain("--right-sidebar-ratio: 0.45");

    fireEvent.click(screen.getByLabelText("折叠左侧栏"));
    expect(shell.dataset.rightSidebar).toBe("closed");
    expect(screen.getByLabelText("展开左侧栏")).not.toBeNull();

    fireEvent.click(screen.getByLabelText("展开左侧栏"));
    expect(shell.dataset.rightSidebar).toBe("open");
    expect(shell.dataset.rightSidebarPlacement).toBe("left");

    fireEvent.click(screen.getByLabelText("交换对话区和侧边栏位置"));

    expect(shell.dataset.rightSidebarPlacement).toBe("right");
    expect(screen.getByRole("complementary", { name: "右侧栏" })).not.toBeNull();
    expect(screen.getByRole("separator", { name: "调整右侧栏宽度" })).not.toBeNull();
  });

  it("collapses the right sidebar from its panel controls", () => {
    renderLayout(
      <Layout>
        <div>内容区</div>
      </Layout>,
    );

    const shell = screen.getByTestId("app-shell");
    fireEvent.click(screen.getByLabelText("展开右侧栏"));
    expect(shell.dataset.rightSidebar).toBe("open");

    fireEvent.click(screen.getByLabelText("折叠右侧栏"));
    expect(shell.dataset.rightSidebar).toBe("closed");
  });

  it("collapses the right sidebar when navigating to the new conversation page", () => {
    const onNavigate = vi.fn();
    renderLayout(
      <Layout onNavigate={onNavigate}>
        <div>内容区</div>
      </Layout>,
    );

    const shell = screen.getByTestId("app-shell");
    fireEvent.click(screen.getByLabelText("展开右侧栏"));
    expect(shell.dataset.rightSidebar).toBe("open");

    fireEvent.click(screen.getByRole("button", { name: "新对话" }));

    expect(onNavigate).toHaveBeenCalledWith("/guid?focus=prompt");
    expect(shell.dataset.rightSidebar).toBe("closed");
    expect(screen.queryByTestId("right-sidebar-initial-page")).toBeNull();
  });

  it("renders preview entries as top-level closable right sidebar tabs", async () => {
    renderLayoutWithPreview(
      <>
        <RightSidebarPreviewHarness />
        <Layout contentMode="full">
          <div>内容区</div>
        </Layout>
      </>,
    );

    const shell = screen.getByTestId("app-shell");

    fireEvent.click(screen.getByRole("button", { name: "打开 HTML 窗口" }));

    expect(shell.dataset.rightSidebar).toBe("open");
    expect(screen.getByRole("tablist", { name: "侧边栏窗口" })).not.toBeNull();
    expect(screen.getByRole("tab", { name: "HTML 窗口" }).getAttribute("aria-selected")).toBe("true");
    expect(((await screen.findByTitle("HTML 文件预览")) as HTMLIFrameElement).getAttribute("srcdoc")).toContain(
      "HTML 窗口",
    );

    fireEvent.click(screen.getByRole("button", { name: "打开 Markdown 窗口" }));

    expect(screen.getAllByRole("tab")).toHaveLength(2);
    expect(screen.getByRole("tab", { name: "Markdown 窗口" }).getAttribute("aria-selected")).toBe("true");
    expect(await screen.findByRole("heading", { level: 1, name: "Markdown 窗口" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "新建侧边栏页面" })).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "新建侧边栏页面" }));

    expect(screen.getAllByRole("tab")).toHaveLength(3);
    expect(screen.getByRole("tab", { name: "HTML 窗口" }).getAttribute("aria-selected")).toBe("false");
    expect(screen.getByRole("tab", { name: "Markdown 窗口" }).getAttribute("aria-selected")).toBe("false");
    expect(screen.getByRole("tab", { name: "新tab" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByTestId("right-sidebar-initial-page")).not.toBeNull();
    expect(screen.getByText("暂无侧边内容")).not.toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "Markdown 窗口" }));

    expect(screen.getAllByRole("tab")).toHaveLength(3);
    expect(screen.getByRole("tab", { name: "新tab" }).getAttribute("aria-selected")).toBe("false");
    expect(screen.getByRole("tab", { name: "Markdown 窗口" }).getAttribute("aria-selected")).toBe("true");
    expect(await screen.findByRole("heading", { level: 1, name: "Markdown 窗口" })).not.toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "HTML 窗口" }));

    expect(screen.getByRole("tab", { name: "HTML 窗口" }).getAttribute("aria-selected")).toBe("true");
    expect(((await screen.findByTitle("HTML 文件预览")) as HTMLIFrameElement).getAttribute("srcdoc")).toContain(
      "HTML 窗口",
    );

    fireEvent.click(screen.getByRole("button", { name: "关闭侧边栏窗口 HTML 窗口" }));

    expect(screen.queryByRole("tab", { name: "HTML 窗口" })).toBeNull();
    expect(screen.getByRole("tab", { name: "Markdown 窗口" }).getAttribute("aria-selected")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "关闭侧边栏窗口 Markdown 窗口" }));

    expect(shell.dataset.rightSidebar).toBe("open");
    expect(screen.getAllByRole("tab")).toHaveLength(1);
    expect(screen.getByRole("tab", { name: "新tab" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByTestId("right-sidebar-initial-page")).not.toBeNull();
    expect(screen.getByText("暂无侧边内容")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "关闭侧边栏窗口 新tab" }));

    expect(shell.dataset.rightSidebar).toBe("closed");
    expect(screen.queryAllByRole("tab")).toHaveLength(0);
    expect(screen.queryByTestId("right-sidebar-initial-page")).toBeNull();
  });

  it("keeps newly added empty right sidebar pages as duplicate display names", () => {
    renderLayout(
      <Layout contentMode="full">
        <div>内容区</div>
      </Layout>,
    );

    fireEvent.click(screen.getByLabelText("展开右侧栏"));
    const addPageButton = screen.getByRole("button", { name: "新建侧边栏页面" });

    fireEvent.click(addPageButton);
    fireEvent.click(addPageButton);

    expect(screen.getAllByRole("tab", { name: "新tab" })).toHaveLength(2);
    expect(screen.queryByRole("tab", { name: "新tab 2" })).toBeNull();

    fireEvent.click(screen.getAllByRole("button", { name: "关闭侧边栏窗口 新tab" })[1]);
    fireEvent.click(addPageButton);

    expect(screen.getAllByRole("tab", { name: "新tab" })).toHaveLength(2);
    expect(screen.queryByRole("tab", { name: "新tab 3" })).toBeNull();
  });

  it("routes code block side-preview clicks to existing right sidebar tabs and toggles the active panel", async () => {
    renderLayoutWithPreview(
      <>
        <RightSidebarPreviewHarness />
        <Layout contentMode="full">
          <MessageText
            message={message("assistant", "```markdown\n# Markdown 预览\n\n正文\n```", "completed")}
          />
        </Layout>
      </>,
    );

    const shell = screen.getByTestId("app-shell");
    const codePreviewButton = screen.getByRole("button", { name: "在预览面板打开 Markdown 预览" });

    expect(codePreviewButton.getAttribute("aria-pressed")).toBe("false");
    expect(codePreviewButton.querySelector(".lucide-panel-right-open")).not.toBeNull();
    fireEvent.click(codePreviewButton);
    await waitFor(() => {
      expect(shell.dataset.rightSidebar).toBe("open");
      expect(codePreviewButton.getAttribute("aria-pressed")).toBe("true");
      expect(codePreviewButton.querySelector(".lucide-panel-right-close")).not.toBeNull();
    });
    expect(screen.getByRole("tab", { name: "Markdown 预览" }).getAttribute("aria-selected")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "打开 HTML 窗口" }));
    expect(screen.getByRole("tab", { name: "HTML 窗口" }).getAttribute("aria-selected")).toBe("true");
    await waitFor(() => {
      expect(codePreviewButton.getAttribute("aria-pressed")).toBe("false");
      expect(codePreviewButton.querySelector(".lucide-panel-right-open")).not.toBeNull();
    });

    fireEvent.click(codePreviewButton);
    expect(screen.getAllByRole("tab")).toHaveLength(2);
    expect(screen.getByRole("tab", { name: "Markdown 预览" }).getAttribute("aria-selected")).toBe("true");
    await waitFor(() => {
      expect(codePreviewButton.getAttribute("aria-pressed")).toBe("true");
      expect(codePreviewButton.querySelector(".lucide-panel-right-close")).not.toBeNull();
    });

    fireEvent.click(codePreviewButton);
    await waitFor(() => {
      expect(shell.dataset.rightSidebar).toBe("closed");
      expect(codePreviewButton.getAttribute("aria-pressed")).toBe("false");
      expect(codePreviewButton.querySelector(".lucide-panel-right-open")).not.toBeNull();
    });

    fireEvent.click(codePreviewButton);
    await waitFor(() => {
      expect(shell.dataset.rightSidebar).toBe("open");
      expect(codePreviewButton.getAttribute("aria-pressed")).toBe("true");
      expect(codePreviewButton.querySelector(".lucide-panel-right-close")).not.toBeNull();
    });
    expect(screen.getByRole("tab", { name: "Markdown 预览" }).getAttribute("aria-selected")).toBe("true");
  });
});

function RightSidebarPreviewHarness() {
  const preview = usePreview();

  return (
    <div>
      <button
        type="button"
        onClick={() =>
          preview.openPreview({
            type: "content",
            title: "HTML 窗口",
            content: "<main><h1>HTML 窗口</h1></main>",
            contentType: "html",
          })
        }
      >
        打开 HTML 窗口
      </button>
      <button
        type="button"
        onClick={() =>
          preview.openPreview({
            type: "content",
            title: "Markdown 窗口",
            content: "# Markdown 窗口",
            contentType: "markdown",
          })
        }
      >
        打开 Markdown 窗口
      </button>
    </div>
  );
}

function message(
  kind: ConversationMessage["kind"],
  content: string,
  status: ConversationMessage["status"],
): ConversationMessage {
  return {
    id: "message-1",
    threadId: "thread-1",
    turnId: "turn-1",
    itemId: "item-1",
    kind,
    status,
    content,
    payload: {},
    createdAt: "2026-06-17T10:00:00Z",
    updatedAt: "2026-06-17T10:01:00Z",
  };
}
