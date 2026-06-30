import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { APP_ADD_WORKSPACE_FILE_TO_CHAT_EVENT } from "@/renderer/events/workspaceFileContext";
import { AppContextMenuProvider } from "@/renderer/providers/AppContextMenuProvider";

describe("AppContextMenuProvider", () => {
  const writeText = vi.fn();
  const readText = vi.fn();

  beforeEach(() => {
    writeText.mockResolvedValue(undefined);
    readText.mockResolvedValue("");
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        readText,
        writeText,
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("prevents the browser context menu and shows the app menu", () => {
    render(
      <AppContextMenuProvider>
        <main aria-label="页面内容">workspace</main>
      </AppContextMenuProvider>,
    );

    const target = screen.getByLabelText("页面内容");
    const event = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: 30,
      clientY: 36,
    });
    fireEvent(target, event);

    expect(event.defaultPrevented).toBe(true);
    expect(screen.getByRole("menu", { name: "页面右键菜单" })).not.toBeNull();
    expect((screen.getByRole("menuitem", { name: "暂无可用操作" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("copies selected text from an input", async () => {
    render(
      <AppContextMenuProvider>
        <input aria-label="输入区" defaultValue="hello world" />
      </AppContextMenuProvider>,
    );

    const input = screen.getByLabelText("输入区") as HTMLInputElement;
    input.setSelectionRange(0, 5);
    fireEvent.contextMenu(input, { clientX: 12, clientY: 18 });
    fireEvent.click(screen.getByRole("menuitem", { name: "复制" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith("hello"));
  });

  it("pastes clipboard text into an input and emits input", async () => {
    readText.mockResolvedValue(" pasted");
    const onInput = vi.fn();

    render(
      <AppContextMenuProvider>
        <input aria-label="输入区" defaultValue="hello" onInput={onInput} />
      </AppContextMenuProvider>,
    );

    const input = screen.getByLabelText("输入区") as HTMLInputElement;
    input.setSelectionRange(5, 5);
    fireEvent.contextMenu(input, { clientX: 12, clientY: 18 });
    fireEvent.click(screen.getByRole("menuitem", { name: "粘贴" }));

    await waitFor(() => expect(input.value).toBe("hello pasted"));
    expect(onInput).toHaveBeenCalledTimes(1);
  });

  it("recognizes contenteditable textbox areas", () => {
    render(
      <AppContextMenuProvider>
        <div
          aria-label="富文本输入"
          contentEditable
          data-sendbox-input="true"
          role="textbox"
          suppressContentEditableWarning
        >
          hello
        </div>
      </AppContextMenuProvider>,
    );

    fireEvent.contextMenu(screen.getByRole("textbox", { name: "富文本输入" }), {
      clientX: 12,
      clientY: 18,
    });

    expect(screen.getByRole("menu", { name: "页面右键菜单" }).dataset.contextKind).toBe("editable");
    expect(screen.getByRole("menuitem", { name: "粘贴" })).not.toBeNull();
    expect(screen.getByRole("menuitem", { name: "全选" })).not.toBeNull();
  });

  it("copies selected page text", async () => {
    render(
      <AppContextMenuProvider>
        <p>
          <span data-testid="selected-text">selected text</span>
        </p>
      </AppContextMenuProvider>,
    );

    const text = screen.getByTestId("selected-text");
    const range = document.createRange();
    range.selectNodeContents(text);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);

    fireEvent.contextMenu(text, { clientX: 12, clientY: 18 });
    expect(screen.getByRole("menu", { name: "页面右键菜单" }).dataset.contextKind).toBe("selection");
    fireEvent.click(screen.getByRole("menuitem", { name: "复制" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith("selected text"));
  });

  it("leaves explicitly native context menu areas alone", () => {
    render(
      <AppContextMenuProvider>
        <div aria-label="原生区域" data-native-context-menu="true">
          native
        </div>
      </AppContextMenuProvider>,
    );

    const target = screen.getByLabelText("原生区域");
    const event = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: 30,
      clientY: 36,
    });
    fireEvent(target, event);

    expect(event.defaultPrevented).toBe(false);
    expect(screen.queryByRole("menu", { name: "页面右键菜单" })).toBeNull();
  });

  it("shows file actions for workspace files and copies both path forms", async () => {
    render(
      <AppContextMenuProvider>
        <button
          type="button"
          data-workspace-entry-absolute-path={String.raw`D:\repo\src\main.ts`}
          data-workspace-entry-kind="file"
          data-workspace-entry-name="main.ts"
          data-workspace-entry-path="src/main.ts"
          data-workspace-root={String.raw`D:\repo`}
        >
          main.ts
        </button>
      </AppContextMenuProvider>,
    );

    const file = screen.getByRole("button", { name: "main.ts" });
    fireEvent.contextMenu(file, { clientX: 12, clientY: 18 });

    const menu = screen.getByRole("menu", { name: "页面右键菜单" });
    expect(menu.dataset.contextKind).toBe("workspace-file");
    const labels = within(menu).getAllByRole("menuitem").map((item) => item.textContent);
    expect(labels).toEqual([
      "复制文件",
      "打开于",
      "资源管理器",
      "复制绝对路径",
      "复制工作区相对路径",
      "添加到聊天",
    ]);

    fireEvent.click(screen.getByRole("menuitem", { name: "复制绝对路径" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(String.raw`D:\repo\src\main.ts`));

    fireEvent.contextMenu(file, { clientX: 12, clientY: 18 });
    fireEvent.click(screen.getByRole("menuitem", { name: "复制工作区相对路径" }));
    await waitFor(() => expect(writeText).toHaveBeenLastCalledWith("src/main.ts"));
  });

  it("dispatches workspace file add-to-chat requests from file actions", async () => {
    const listener = vi.fn();
    const handleEvent = (event: Event) => listener((event as CustomEvent).detail);
    document.addEventListener(APP_ADD_WORKSPACE_FILE_TO_CHAT_EVENT, handleEvent);

    try {
      render(
        <AppContextMenuProvider>
          <button
            type="button"
            data-workspace-entry-absolute-path={String.raw`D:\repo\README.md`}
            data-workspace-entry-kind="file"
            data-workspace-entry-name="README.md"
            data-workspace-entry-path="README.md"
            data-workspace-id="ws-1"
            data-workspace-root={String.raw`D:\repo`}
            data-workspace-session-id="ses-1"
          >
            README.md
          </button>
        </AppContextMenuProvider>,
      );

      fireEvent.contextMenu(screen.getByRole("button", { name: "README.md" }), { clientX: 12, clientY: 18 });
      fireEvent.click(screen.getByRole("menuitem", { name: "添加到聊天" }));

      await waitFor(() => expect(listener).toHaveBeenCalledWith({
        absolutePath: String.raw`D:\repo\README.md`,
        file: {
          path: "README.md",
          name: "README.md",
          type: "file",
          source: "workspace",
        },
        sessionId: "ses-1",
        workspaceId: "ws-1",
        workspaceRoot: String.raw`D:\repo`,
      }));
    } finally {
      document.removeEventListener(APP_ADD_WORKSPACE_FILE_TO_CHAT_EVENT, handleEvent);
    }
  });

  it("shows no actions for workspace directories", () => {
    render(
      <AppContextMenuProvider>
        <button
          type="button"
          data-workspace-entry-absolute-path={String.raw`D:\repo\src`}
          data-workspace-entry-kind="directory"
          data-workspace-entry-name="src"
          data-workspace-entry-path="src"
          data-workspace-root={String.raw`D:\repo`}
        >
          src
        </button>
      </AppContextMenuProvider>,
    );

    fireEvent.contextMenu(screen.getByRole("button", { name: "src" }), { clientX: 12, clientY: 18 });

    expect(screen.getByRole("menu", { name: "页面右键菜单" }).dataset.contextKind).toBe("workspace-directory");
    expect((screen.getByRole("menuitem", { name: "暂无可用操作" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole("menuitem", { name: "复制绝对路径" })).toBeNull();
  });
});
