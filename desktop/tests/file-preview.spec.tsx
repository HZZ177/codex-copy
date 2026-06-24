import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useEffect, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import mermaid, { type ParseResult, type RenderResult } from "mermaid";

import type { RuntimeBridge } from "@/runtime";
import { FilePreview } from "@/renderer/components/workspace";
import { PreviewProvider, usePreview } from "@/renderer/providers/PreviewProvider";

const mermaidParseResult: ParseResult = { diagramType: "flowchart-v2", config: {} };
const mermaidRenderResult: RenderResult = {
  diagramType: "flowchart-v2",
  svg: '<svg role="img" aria-label="测试图表" width="100%" style="max-width: 320px;" viewBox="0 0 2400 1200"></svg>',
};

vi.mock("mermaid", () => ({
  default: {
    initialize: vi.fn(),
    parse: vi.fn().mockResolvedValue({ diagramType: "flowchart-v2", config: {} }),
    render: vi.fn().mockResolvedValue({
      diagramType: "flowchart-v2",
      svg: '<svg role="img" aria-label="测试图表" width="100%" style="max-width: 320px;" viewBox="0 0 2400 1200"></svg>',
    }),
  },
}));

let restoreElementMetrics: (() => void) | null = null;

afterEach(() => {
  restoreElementMetrics?.();
  restoreElementMetrics = null;
});

describe("FilePreview", () => {
  beforeEach(() => {
    vi.stubGlobal("navigator", {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
    vi.mocked(mermaid.parse).mockResolvedValue(mermaidParseResult);
    vi.mocked(mermaid.render).mockResolvedValue(mermaidRenderResult);
  });

  it("reads text file content through workspace runtime", async () => {
    const runtime = fakeRuntime({
      readFile: vi.fn().mockResolvedValue({
        path: "README.md",
        content: "# Hello\n",
        encoding: "utf-8",
      }),
    });

    render(<FilePreview request={{ type: "file", path: "README.md" }} sessionId="ses-1" runtime={runtime} />);

    expect(await screen.findByLabelText("预览内容")).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Hello" })).not.toBeNull();
    expect(runtime.workspace.readFile).toHaveBeenCalledWith({ sessionId: "ses-1" }, "README.md");
  });

  it("renders code files with CodeMirror source viewer and line numbers", async () => {
    const runtime = fakeRuntime({
      readFile: vi.fn().mockResolvedValue({
        path: "src/App.tsx",
        content: "const value = 1;\nexport default value;\n",
        encoding: "utf-8",
      }),
    });

    render(<FilePreview request={{ type: "file", path: "src/App.tsx" }} sessionId="ses-1" runtime={runtime} />);

    const sourceViewer = await screen.findByTestId("file-source-viewer");
    expect(sourceViewer.getAttribute("data-renderer")).toBe("codemirror");
    await waitFor(() => {
      expect(sourceViewer.textContent).toContain("const");
      expect(sourceViewer.textContent).toContain("1");
      expect(sourceViewer.textContent).toContain("2");
    });
  });

  it("renders enlarged centered fold controls in CodeMirror source viewer", async () => {
    const runtime = fakeRuntime({
      readFile: vi.fn().mockResolvedValue({
        path: "src/App.tsx",
        content: "function run() {\n  const value = 1;\n  return value;\n}\n",
        encoding: "utf-8",
      }),
    });

    render(<FilePreview request={{ type: "file", path: "src/App.tsx" }} sessionId="ses-1" runtime={runtime} />);

    const sourceViewer = await screen.findByTestId("file-source-viewer");
    await waitFor(() => {
      const foldButton = sourceViewer.querySelector(".cm-fileFoldMarker[data-open='true']");
      expect(foldButton).not.toBeNull();
      expect(foldButton?.getAttribute("title")).toBe("折叠代码块");
    });
  });

  it("uses the low-cost plain source renderer for very large files", async () => {
    const content = Array.from({ length: 2101 }, (_, index) => `line ${index + 1}`).join("\n");
    const runtime = fakeRuntime({
      readFile: vi.fn().mockResolvedValue({
        path: "logs/huge.log",
        content,
        encoding: "utf-8",
      }),
    });

    render(<FilePreview request={{ type: "file", path: "logs/huge.log" }} sessionId="ses-1" runtime={runtime} />);

    const sourceViewer = await screen.findByTestId("file-source-viewer");
    expect(sourceViewer.getAttribute("data-renderer")).toBe("plain");
    expect(sourceViewer.textContent).toContain("2101");
    expect(sourceViewer.textContent).toContain("line 2101");
  });

  it("switches markdown preview back to source", async () => {
    const runtime = fakeRuntime({
      readFile: vi.fn().mockResolvedValue({
        path: "guide.md",
        content: "# Guide\n\n- item",
        encoding: "utf-8",
      }),
    });

    render(<FilePreview request={{ type: "file", path: "guide.md" }} sessionId="ses-1" runtime={runtime} />);

    expect(await screen.findByRole("heading", { name: "Guide" })).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /源码/ }));

    expect(screen.getByLabelText("预览内容").textContent).toContain("# Guide");
  });

  it("shows markdown source and rendered preview side by side", async () => {
    const runtime = fakeRuntime({
      readFile: vi.fn().mockResolvedValue({
        path: "guide.md",
        content: "# Guide\n\n正文",
        encoding: "utf-8",
      }),
    });

    render(<FilePreview request={{ type: "file", path: "guide.md" }} sessionId="ses-1" runtime={runtime} />);

    expect(await screen.findByRole("heading", { name: "Guide" })).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "分屏" }));

    expect(screen.getByTestId("preview-split-pane")).not.toBeNull();
    expect(screen.getByLabelText("源码内容").textContent).toContain("# Guide");
    expect(screen.getByLabelText("渲染预览").textContent).toContain("正文");
    expect(screen.getByRole("button", { name: "分屏" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("renders html files in a sandboxed preview frame", async () => {
    const runtime = fakeRuntime({
      readFile: vi.fn().mockResolvedValue({
        path: "index.html",
        content: "<main><h1>页面预览</h1><script>window.parent.postMessage('x','*')</script></main>",
        encoding: "utf-8",
      }),
    });

    render(<FilePreview request={{ type: "file", path: "index.html" }} sessionId="ses-1" runtime={runtime} />);

    const frame = (await screen.findByTitle("HTML 文件预览")) as HTMLIFrameElement;
    expect(frame.getAttribute("sandbox")).toBe("");
    expect(frame.getAttribute("srcdoc")).toContain("页面预览");
  });

  it("renders direct html content into the sandboxed frame without an empty first document", () => {
    const html = "<style>h1 { color: rgb(220, 38, 38); }</style><main><h1>面板样式</h1></main>";

    render(
      <FilePreview
        chrome="panel"
        request={{
          type: "content",
          title: "HTML 预览",
          content: html,
          contentType: "html",
        }}
      />,
    );

    const frame = screen.getByTitle("HTML 文件预览") as HTMLIFrameElement;
    expect(frame.getAttribute("sandbox")).toBe("");
    expect(frame.getAttribute("srcdoc")).toContain("<style>h1 { color: rgb(220, 38, 38); }</style>");
    expect(frame.getAttribute("srcdoc")).toContain("面板样式");
    expect(frame.getAttribute("srcdoc")).not.toContain("文件为空");
  });

  it("shows html source and sandboxed preview in split mode", async () => {
    const runtime = fakeRuntime({
      readFile: vi.fn().mockResolvedValue({
        path: "index.html",
        content: "<main><h1>页面预览</h1></main>",
        encoding: "utf-8",
      }),
    });

    render(<FilePreview request={{ type: "file", path: "index.html" }} sessionId="ses-1" runtime={runtime} />);

    expect(await screen.findByTitle("HTML 文件预览")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "分屏" }));

    const frame = screen.getByTitle("HTML 文件预览") as HTMLIFrameElement;
    expect(screen.getByLabelText("源码内容").textContent).toContain("<main>");
    expect(frame.getAttribute("sandbox")).toBe("");
    expect(frame.getAttribute("srcdoc")).toContain("页面预览");
  });

  it("renders image files through workspace media runtime", async () => {
    const runtime = fakeRuntime({
      readMedia: vi.fn().mockResolvedValue({
        path: "assets/pixel.png",
        media_type: "image/png",
        size: 68,
        data_url: "data:image/png;base64,abc",
      }),
    });

    render(<FilePreview request={{ type: "file", path: "assets/pixel.png" }} sessionId="ses-1" runtime={runtime} />);

    const image = (await screen.findByAltText("pixel.png")) as HTMLImageElement;
    expect(image.getAttribute("src")).toBe("data:image/png;base64,abc");
    expect(screen.getByText("image/png")).not.toBeNull();
    expect(screen.getByText("68 B")).not.toBeNull();
    expect(runtime.workspace.readMedia).toHaveBeenCalledWith({ sessionId: "ses-1" }, "assets/pixel.png");
    expect(runtime.workspace.readFile).not.toHaveBeenCalled();
  });

  it("renders direct markdown content requests without workspace runtime", async () => {
    render(
      <FilePreview
        request={{ type: "content", title: "消息片段", content: "# 片段标题\n\n正文", contentType: "markdown" }}
      />,
    );

    expect(await screen.findByRole("heading", { name: "片段标题" })).not.toBeNull();
    expect(screen.getByTitle("消息内容")).not.toBeNull();
    expect(screen.queryByText(/Markdown 预览/)).toBeNull();
  });

  it("renders long breadcrumb paths as separate visible segments", () => {
    render(
      <FilePreview
        breadcrumbRootLabel="D:/repo/keydex"
        request={{
          type: "content",
          title: "长路径源码",
          content: "export const value = 1;",
          contentType: "code",
          sourcePath:
            "backend/services/really-long-directory-name-that-can-ellipsis/tests/test_entrypoints_with_long_name.ts",
        }}
      />,
    );

    expect(
      screen.getByTitle(
        "keydex / backend / services / really-long-directory-name-that-can-ellipsis / tests / test_entrypoints_with_long_name.ts",
      ),
    ).not.toBeNull();
    expect(screen.getByText("keydex")).not.toBeNull();
    expect(screen.getByText("backend")).not.toBeNull();
    expect(screen.getByText("services")).not.toBeNull();
    expect(screen.getByText("really-long-directory-name-that-can-ellipsis")).not.toBeNull();
    expect(screen.getByText("tests")).not.toBeNull();
    expect(screen.getByText("test_entrypoints_with_long_name.ts")).not.toBeNull();
  });

  it("renders json content as a formatted source viewer", async () => {
    const json = '{"users":[{"name":"Ada","role":"admin"}],"enabled":true}';
    render(
      <FilePreview
        chrome="panel"
        request={{ type: "content", title: "JSON 预览", content: json, contentType: "json" }}
      />,
    );

    expect(screen.getByTitle("消息内容")).not.toBeNull();
    expect(screen.queryByRole("heading", { level: 2, name: "JSON 预览" })).toBeNull();
    expect(screen.queryByText("JSON 查看")).toBeNull();
    expect(screen.queryByTestId("json-tree-viewer")).toBeNull();
    expect(screen.queryByRole("searchbox", { name: "查找 JSON" })).toBeNull();
    expect(screen.queryByRole("button", { name: "预览" })).toBeNull();

    const sourceViewer = screen.getByTestId("file-source-viewer");
    expect(sourceViewer.getAttribute("data-renderer")).toBe("codemirror");
    expect(sourceViewer.textContent).toContain("users");
    expect(sourceViewer.textContent).toContain("Ada");
    expect(sourceViewer.textContent).toContain("enabled");

    fireEvent.click(screen.getByRole("button", { name: "复制预览内容" }));
    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(json);
    });
  });

  it("renders mermaid content as native panel chrome", async () => {
    mockElementMetrics({ clientWidth: 1200, clientHeight: 600 });

    render(
      <FilePreview
        chrome="panel"
        request={{
          type: "content",
          title: "Mermaid 图表预览",
          content: "graph TD\nA[开始] --> B[结束]",
          contentType: "mermaid",
        }}
      />,
    );

    expect(screen.queryByText("正在渲染 Mermaid...")).toBeNull();
    expect(screen.getByTitle("消息内容")).not.toBeNull();
    expect(screen.queryByRole("heading", { level: 2, name: "Mermaid 图表预览" })).toBeNull();
    expect(screen.queryByText(/Mermaid 预览/)).toBeNull();
    expect(screen.queryByRole("button", { name: "分屏" })).toBeNull();
    expect(screen.queryByRole("button", { name: "全屏显示 Mermaid" })).toBeNull();
    expect(screen.queryByRole("button", { name: /在预览面板打开/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "关闭右侧栏" })).toBeNull();

    const pane = await screen.findByTestId("preview-mermaid-pane");
    await waitFor(() => {
      expect(pane.innerHTML).toContain("测试图表");
    });
    const chart = screen.getByLabelText("Mermaid 图表") as HTMLDivElement;
    const svg = chart.querySelector("svg");
    expect(svg?.getAttribute("width")).toBe("2400");
    expect(svg?.getAttribute("height")).toBe("1200");
    expect(svg?.getAttribute("style")).toBeNull();
    await waitFor(() => {
      expect(chart.style.getPropertyValue("--mermaid-scale")).toBe("0.47");
    });
    expect(chart.style.getPropertyValue("--mermaid-render-width")).toBe("1128px");
    expect(chart.style.getPropertyValue("--mermaid-render-height")).toBe("564px");
    expect(vi.mocked(mermaid.initialize)).toHaveBeenCalledWith(expect.objectContaining({
      flowchart: {
        useMaxWidth: false,
      },
    }));
    const controls = screen.getByLabelText("Mermaid 视图控制");
    const [zoomOutButton, zoomInButton, resetButton] = within(controls).getAllByRole("button");
    expect(controls).not.toBeNull();
    expect(within(controls).getByText("47%")).not.toBeNull();

    fireEvent.click(zoomInButton);
    expect(chart.style.getPropertyValue("--mermaid-scale")).toBe("0.57");
    expect(chart.style.getPropertyValue("--mermaid-render-width")).toBe("1368px");
    expect(chart.style.getPropertyValue("--mermaid-render-height")).toBe("684px");
    expect(within(controls).getByText("57%")).not.toBeNull();

    fireEvent.click(zoomOutButton);
    expect(chart.style.getPropertyValue("--mermaid-scale")).toBe("0.47");
    expect(within(controls).getByText("47%")).not.toBeNull();

    fireEvent.click(resetButton);
    expect(chart.style.getPropertyValue("--mermaid-scale")).toBe("0.47");
    expect(within(controls).getByText("47%")).not.toBeNull();

    for (let index = 0; index < 80; index += 1) {
      fireEvent.click(zoomInButton);
    }
    expect(chart.style.getPropertyValue("--mermaid-scale")).toBe("3");
    expect(within(controls).getByText("300%")).not.toBeNull();

    for (let index = 0; index < 80; index += 1) {
      fireEvent.click(zoomOutButton);
    }
    expect(chart.style.getPropertyValue("--mermaid-scale")).toBe("0.05");
    expect(within(controls).getByText("5%")).not.toBeNull();
  });

  it("fits mermaid previews after the side panel reports its real size", async () => {
    const metrics = { clientWidth: 0, clientHeight: 0 };
    mockElementMetrics(metrics);

    render(
      <FilePreview
        chrome="panel"
        request={{
          type: "content",
          title: "Mermaid 图表预览",
          content: "graph TD\nA[开始] --> B[结束]",
          contentType: "mermaid",
        }}
      />,
    );

    const pane = await screen.findByTestId("preview-mermaid-pane");
    await waitFor(() => {
      expect(pane.innerHTML).toContain("测试图表");
    });
    const chart = screen.getByLabelText("Mermaid 图表") as HTMLDivElement;
    expect(chart.style.getPropertyValue("--mermaid-scale")).toBe("1");

    metrics.clientWidth = 1200;
    metrics.clientHeight = 600;

    await waitFor(() => {
      expect(chart.style.getPropertyValue("--mermaid-scale")).toBe("0.47");
    });
    expect(chart.style.getPropertyValue("--mermaid-render-width")).toBe("1128px");
    expect(chart.style.getPropertyValue("--mermaid-render-height")).toBe("564px");
    expect(within(screen.getByLabelText("Mermaid 视图控制")).getByText("47%")).not.toBeNull();
  });

  it("keeps mermaid auto-fit when complex svg content is not valid XML", async () => {
    mockElementMetrics({ clientWidth: 1200, clientHeight: 600 });
    vi.mocked(mermaid.render).mockResolvedValueOnce({
      diagramType: "flowchart-v2",
      svg: '<svg role="img" aria-label="复杂图表" width="100%" style="max-width: 2400px;" viewBox="0 0 2400 1200"><text>&notAnXmlEntity;</text></svg>',
    });

    render(
      <FilePreview
        chrome="panel"
        request={{
          type: "content",
          title: "Mermaid 图表预览",
          content: "graph TD\nA[开始] --> B[结束]",
          contentType: "mermaid",
        }}
      />,
    );

    const pane = await screen.findByTestId("preview-mermaid-pane");
    await waitFor(() => {
      expect(pane.innerHTML).toContain("复杂图表");
    });
    const chart = screen.getByLabelText("Mermaid 图表") as HTMLDivElement;
    await waitFor(() => {
      expect(chart.style.getPropertyValue("--mermaid-scale")).toBe("0.47");
    });
    expect(chart.style.getPropertyValue("--mermaid-render-width")).toBe("1128px");
    expect(chart.style.getPropertyValue("--mermaid-render-height")).toBe("564px");
    expect(within(screen.getByLabelText("Mermaid 视图控制")).getByText("47%")).not.toBeNull();
  });

  it("supports wheel zoom and drag panning for mermaid panel previews", async () => {
    const addEventListener = vi.spyOn(HTMLDivElement.prototype, "addEventListener");
    render(
      <FilePreview
        chrome="panel"
        request={{
          type: "content",
          title: "Mermaid 图表预览",
          content: "graph TD\nA[开始] --> B[结束]",
          contentType: "mermaid",
        }}
      />,
    );

    const chart = (await screen.findByLabelText("Mermaid 图表")) as HTMLDivElement;
    await waitFor(() => {
      expect(addEventListener).toHaveBeenCalledWith("wheel", expect.any(Function), { passive: false });
    });

    fireEvent.wheel(chart, { clientX: 120, clientY: 140, deltaY: -120 });
    await waitFor(() => {
      expect(chart.style.getPropertyValue("--mermaid-scale")).toBe("1.1");
    });
    expect(within(screen.getByLabelText("Mermaid 视图控制")).getByText("110%")).not.toBeNull();

    chart.scrollLeft = 40;
    chart.scrollTop = 50;
    fireEvent(chart, pointerEvent("pointerdown", { button: 0, clientX: 120, clientY: 140, pointerId: 7 }));
    fireEvent(chart, pointerEvent("pointermove", { clientX: 90, clientY: 100, pointerId: 7 }));

    expect(chart.scrollLeft).toBe(70);
    expect(chart.scrollTop).toBe(90);
    expect(chart.dataset.dragging).toBe("true");

    fireEvent(chart, pointerEvent("pointerup", { pointerId: 7 }));
    expect(chart.dataset.dragging).toBeUndefined();

    addEventListener.mockRestore();
  });

  it("renders markdown code fences in panel chrome without message code-block controls", async () => {
    render(
      <FilePreview
        chrome="panel"
        request={{
          type: "content",
          title: "Markdown 片段",
          content: "```ts\nconsole.log('panel')\n```",
          contentType: "markdown",
        }}
      />,
    );

    expect(screen.getByTitle("消息内容")).not.toBeNull();
    expect(screen.queryByRole("heading", { level: 2, name: "Markdown 片段" })).toBeNull();
    expect(await screen.findByText("console.log('panel')")).not.toBeNull();
    expect(screen.getByRole("button", { name: "复制预览内容" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: "复制代码" })).toBeNull();
    expect(screen.queryByRole("button", { name: /在预览面板打开/ })).toBeNull();
  });

  it("keeps mermaid diagrams bounded when rendered inside markdown previews", async () => {
    mockElementMetrics({ clientWidth: 640, clientHeight: 320 });

    render(
      <FilePreview
        chrome="panel"
        request={{
          type: "content",
          title: "Markdown diagram",
          content: "# Diagram\n\n```mermaid\ngraph TD\nA[Start] --> B[Finish]\n```\n\nAfter",
          contentType: "markdown",
        }}
      />,
    );

    const pane = await screen.findByTestId("preview-mermaid-pane");
    expect(pane.getAttribute("data-layout")).toBe("document");
    await waitFor(() => {
      expect(pane.querySelector("svg")).not.toBeNull();
    });

    const chart = pane.querySelector('[data-interactive="true"]') as HTMLDivElement | null;
    expect(chart).not.toBeNull();
    await waitFor(() => {
      expect(chart?.style.getPropertyValue("--mermaid-scale")).toBe("0.24");
    });
    expect(chart?.style.getPropertyValue("--mermaid-render-width")).toBe("576px");
    expect(chart?.style.getPropertyValue("--mermaid-render-height")).toBe("288px");
  });

  it("quotes selected preview text through the floating selection toolbar", async () => {
    const onQuoteSelection = vi.fn();
    const runtime = fakeRuntime({
      readFile: vi.fn().mockResolvedValue({
        path: "guide.md",
        content: "# 片段标题\n\n正文内容",
        encoding: "utf-8",
      }),
    });
    render(
      <FilePreview
        request={{ type: "file", path: "guide.md" }}
        sessionId="ses-1"
        runtime={runtime}
        onQuoteSelection={onQuoteSelection}
      />,
    );

    const body = await screen.findByLabelText("预览内容");
    const selection = await showSelectionToolbar(body, "正文内容");
    fireEvent.click(await screen.findByRole("button", { name: "添加选中文本到对话" }));

    expect(onQuoteSelection).toHaveBeenCalledWith({
      path: "guide.md",
      selectedText: "正文内容",
      lineStart: 3,
      lineEnd: 3,
    });
    expect(selection.removeAllRanges).toHaveBeenCalled();
    selection.restore();
  });

  it("keeps markdown tables scrollable in preview content", () => {
    const { container } = render(
      <FilePreview
        request={{
          type: "content",
          title: "表格片段",
          content: "| 很长的列 A | 很长的列 B |\n| --- | --- |\n| 内容 | 内容 |",
          contentType: "markdown",
        }}
      />,
    );

    expect(container.querySelector(".codex-markdown-table-scroll")).not.toBeNull();
    expect(screen.getByRole("table")).not.toBeNull();
  });

  it("resolves relative markdown images through workspace media runtime", async () => {
    const runtime = fakeRuntime({
      readMedia: vi.fn().mockResolvedValue({
        path: "docs/assets/pixel.png",
        media_type: "image/png",
        size: 68,
        data_url: "data:image/png;base64,abc",
      }),
    });

    render(
      <FilePreview
        request={{
          type: "content",
          title: "图片片段",
          content: "![示例图片](assets/pixel.png)",
          contentType: "markdown",
          sourcePath: "docs/guide.md",
        }}
        sessionId="ses-1"
        runtime={runtime}
      />,
    );

    const image = (await screen.findByAltText("示例图片")) as HTMLImageElement;
    expect(image.getAttribute("src")).toBe("data:image/png;base64,abc");
    expect(runtime.workspace.readMedia).toHaveBeenCalledWith({ sessionId: "ses-1" }, "docs/assets/pixel.png");
  });

  it("switches and closes preview history tabs from the shared preview provider", () => {
    render(
      <PreviewProvider>
        <PreviewTabsHarness />
      </PreviewProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "打开 HTML" }));
    fireEvent.click(screen.getByRole("button", { name: "打开 Markdown" }));

    expect(screen.getByRole("tablist", { name: "预览历史" })).not.toBeNull();
    expect(screen.getAllByRole("tab")).toHaveLength(2);
    expect(screen.getByRole("tab", { name: "Markdown 片段" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("heading", { level: 1, name: "Markdown 片段" })).not.toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "HTML 片段" }));

    expect(screen.getByRole("tab", { name: "HTML 片段" }).getAttribute("aria-selected")).toBe("true");
    expect((screen.getByTitle("HTML 文件预览") as HTMLIFrameElement).getAttribute("srcdoc")).toContain("HTML 片段");

    fireEvent.click(screen.getByRole("button", { name: "关闭预览 HTML 片段" }));

    expect(screen.queryByRole("tab", { name: "HTML 片段" })).toBeNull();
    expect(screen.getByRole("heading", { level: 1, name: "Markdown 片段" })).not.toBeNull();
  });

  it("keeps preview requests scoped to the active host session", () => {
    render(
      <PreviewProvider>
        <PreviewScopeHarness />
      </PreviewProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "打开当前会话预览" }));
    expect(screen.getByTestId("preview-request").textContent).toBe("ses-a:ses-a 预览");
    expect(screen.getByTestId("preview-entry-count").textContent).toBe("1");

    fireEvent.click(screen.getByRole("button", { name: "切到 ses-b" }));

    expect(screen.getByTestId("preview-request").textContent).toBe("empty");
    expect(screen.getByTestId("preview-entry-count").textContent).toBe("0");

    fireEvent.click(screen.getByRole("button", { name: "打开当前会话预览" }));
    expect(screen.getByTestId("preview-request").textContent).toBe("ses-b:ses-b 预览");

    fireEvent.click(screen.getByRole("button", { name: "切到 ses-a" }));

    expect(screen.getByTestId("preview-request").textContent).toBe("ses-a:ses-a 预览");
    expect(screen.getByTestId("preview-entry-count").textContent).toBe("1");
  });

  it("shows backend errors for oversized or binary files", async () => {
    const runtime = fakeRuntime({
      readFile: vi.fn().mockRejectedValue(new Error("文件过大，暂不预览")),
    });

    render(<FilePreview request={{ type: "file", path: "large.log" }} sessionId="ses-1" runtime={runtime} />);

    expect((await screen.findByRole("alert")).textContent).toBe("文件过大，暂不预览");
  });

  it("renders diff request without reading workspace file", () => {
    const runtime = fakeRuntime();

    render(
      <FilePreview
        request={{ type: "diff", path: "src/main.py", diff: "@@\n-print('old')\n+print('new')" }}
        sessionId="ses-1"
        runtime={runtime}
      />,
    );

    expect(screen.getByTitle("src / main.py")).not.toBeNull();
    expect(screen.queryByText(/Diff 预览/)).toBeNull();
    expect(screen.getByLabelText("预览内容").textContent).toContain("+print('new')");
    expect(screen.getByLabelText("Diff 渲染内容")).not.toBeNull();
    expect(runtime.workspace.readFile).not.toHaveBeenCalled();
  });

  it("copies preview source content", async () => {
    const clipboard = navigator.clipboard.writeText as unknown as ReturnType<typeof vi.fn>;
    const runtime = fakeRuntime({
      readFile: vi.fn().mockResolvedValue({
        path: "notes.txt",
        content: "可复制内容",
        encoding: "utf-8",
      }),
    });

    render(<FilePreview request={{ type: "file", path: "notes.txt" }} sessionId="ses-1" runtime={runtime} />);

    await screen.findByLabelText("预览内容");
    fireEvent.click(screen.getByRole("button", { name: "复制预览内容" }));

    await waitFor(() => {
      expect(clipboard).toHaveBeenCalledWith("可复制内容");
    });
    expect(screen.getByText("已复制")).not.toBeNull();
  });
  it("creates edits and deletes file-level annotations", async () => {
    const annotation = fileAnnotation({
      id: "ann-file",
      path: "README.md",
      comment: "Need more context",
    });
    const updated = { ...annotation, comment: "Updated annotation" };
    const runtime = fakeRuntime({
      readFile: vi.fn().mockResolvedValue({
        path: "README.md",
        content: "# Hello\n",
        encoding: "utf-8",
      }),
      listAnnotations: vi.fn().mockResolvedValue([]),
      createAnnotation: vi.fn().mockResolvedValue(annotation),
      updateAnnotation: vi.fn().mockResolvedValue(updated),
      deleteAnnotation: vi.fn().mockResolvedValue(undefined),
    });

    render(<FilePreview request={{ type: "file", path: "README.md" }} sessionId="ses-1" runtime={runtime} />);

    await screen.findByLabelText("预览内容");
    fireEvent.click(screen.getByRole("button", { name: /文件批注/ }));
    fireEvent.click(screen.getByRole("button", { name: "添加文件批注" }));
    fireEvent.change(screen.getByRole("textbox", { name: "添加文件级批注" }), {
      target: { value: "Need more context" },
    });
    fireEvent.click(screen.getByRole("button", { name: "添加文件批注" }));

    await waitFor(() => {
      expect(runtime.workspace.createAnnotation).toHaveBeenCalledWith(
        { sessionId: "ses-1" },
        expect.objectContaining({
          path: "README.md",
          anchor_type: "file",
          comment: "Need more context",
        }),
      );
    });
    expect(await screen.findByText("Need more context")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "编辑批注" }));
    fireEvent.change(screen.getByRole("textbox", { name: "编辑批注" }), {
      target: { value: "Updated annotation" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(runtime.workspace.updateAnnotation).toHaveBeenCalledWith(
        { sessionId: "ses-1" },
        "ann-file",
        { comment: "Updated annotation" },
      );
    });
    expect(await screen.findByText("Updated annotation")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "删除批注" }));
    await waitFor(() => {
      expect(runtime.workspace.deleteAnnotation).toHaveBeenCalledWith({ sessionId: "ses-1" }, "ann-file");
    });
    await waitFor(() => {
      expect(screen.queryByText("Updated annotation")).toBeNull();
    });
  });

  it("creates selected rendered-text annotations with inferred source line numbers", async () => {
    const annotation = fileAnnotation({
      id: "ann-selection",
      path: "guide.md",
      anchor_type: "selection",
      selected_text: "Target text",
      line_start: 3,
      line_end: 3,
      column_start: 1,
      column_end: 12,
      comment: "Explain this paragraph",
    });
    const runtime = fakeRuntime({
      readFile: vi.fn().mockResolvedValue({
        path: "guide.md",
        content: "# Guide\n\nTarget text",
        encoding: "utf-8",
      }),
      listAnnotations: vi.fn().mockResolvedValue([]),
      createAnnotation: vi.fn().mockResolvedValue(annotation),
    });

    render(<FilePreview request={{ type: "file", path: "guide.md" }} sessionId="ses-1" runtime={runtime} />);

    const body = await screen.findByLabelText("预览内容");
    const selection = await showSelectionToolbar(body, "Target text");
    fireEvent.click(await screen.findByRole("button", { name: "为选中文本添加批注" }));
    fireEvent.change(screen.getByRole("textbox", { name: "添加选区批注" }), {
      target: { value: "Explain this paragraph" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存批注" }));

    await waitFor(() => {
      expect(runtime.workspace.createAnnotation).toHaveBeenCalledWith(
        { sessionId: "ses-1" },
        expect.objectContaining({
          path: "guide.md",
          anchor_type: "selection",
          selected_text: "Target text",
          line_start: 3,
          line_end: 3,
          column_start: 1,
          column_end: 12,
          comment: "Explain this paragraph",
        }),
      );
    });
    await waitFor(() => {
      expect(document.querySelector('[data-preview-annotation-id="ann-selection"]')).not.toBeNull();
    });
    expect(screen.queryByLabelText("新增选区批注")).toBeNull();
    expect(screen.getByRole("button", { name: "文件批注 1" })).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "文件批注 1" }));
    expect(await screen.findByLabelText("文件批注")).not.toBeNull();
    expect(within(screen.getByLabelText("文件批注")).getByText("Target text")).not.toBeNull();
    expect(within(screen.getByLabelText("文件批注")).getByText("L3")).not.toBeNull();
    selection.restore();
  });

  it("creates rendered cross-block annotations with inferred markdown source ranges", async () => {
    const annotation = fileAnnotation({
      id: "ann-cross",
      path: "guide.md",
      anchor_type: "selection",
      selected_text: "Target text",
      line_start: 3,
      line_end: 5,
      column_start: 9,
      column_end: 5,
      comment: "Explain this range",
    });
    const runtime = fakeRuntime({
      readFile: vi.fn().mockResolvedValue({
        path: "guide.md",
        content: "# Guide\n\nFirst **Target**\n\ntext end",
        encoding: "utf-8",
      }),
      listAnnotations: vi.fn().mockResolvedValue([]),
      createAnnotation: vi.fn().mockResolvedValue(annotation),
    });

    render(<FilePreview request={{ type: "file", path: "guide.md" }} sessionId="ses-1" runtime={runtime} />);

    const body = await screen.findByLabelText("预览内容");
    const selection = await showSelectionToolbar(body, "Target text");
    fireEvent.click(await screen.findByRole("button", { name: "为选中文本添加批注" }));
    fireEvent.change(screen.getByRole("textbox", { name: "添加选区批注" }), {
      target: { value: "Explain this range" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存批注" }));

    await waitFor(() => {
      expect(runtime.workspace.createAnnotation).toHaveBeenCalledWith(
        { sessionId: "ses-1" },
        expect.objectContaining({
          path: "guide.md",
          anchor_type: "selection",
          selected_text: "Target text",
          line_start: 3,
          line_end: 5,
          column_start: 9,
          column_end: 5,
          comment: "Explain this range",
        }),
      );
    });
    selection.restore();
  });

  it("marks rendered-text selection annotations and opens a popover from the mark", async () => {
    const annotation = fileAnnotation({
      id: "ann-selection",
      path: "guide.md",
      anchor_type: "selection",
      selected_text: "Target text",
      comment: "Explain this paragraph",
    });
    const runtime = fakeRuntime({
      readFile: vi.fn().mockResolvedValue({
        path: "guide.md",
        content: "# Guide\n\nTarget text",
        encoding: "utf-8",
      }),
      listAnnotations: vi.fn().mockResolvedValue([annotation]),
    });

    render(<FilePreview request={{ type: "file", path: "guide.md" }} sessionId="ses-1" runtime={runtime} />);

    await screen.findByRole("heading", { name: "Guide" });
    await waitFor(() => {
      expect(document.querySelector('[data-preview-annotation-id="ann-selection"]')).not.toBeNull();
    });

    fireEvent.click(document.querySelector('[data-preview-annotation-id="ann-selection"]') as Element);

    const popover = await screen.findByLabelText("选区批注");
    expect(popover).not.toBeNull();
    expect(screen.getByText("Explain this paragraph")).not.toBeNull();
    expect(within(popover).queryByRole("button", { name: "定位批注片段" })).toBeNull();
    const actions = popover.querySelector<HTMLElement>('[data-layout="annotation"]');
    expect(actions).not.toBeNull();
    const actionButtons = within(actions as HTMLElement).getAllByRole("button");
    expect(actionButtons[0]?.getAttribute("aria-label")).toBe("删除批注");
    expect(actionButtons[actionButtons.length - 1]?.getAttribute("aria-label")).toBe("关闭批注浮窗");

    fireEvent.pointerDown(screen.getByLabelText("预览内容"));
    await waitFor(() => {
      expect(screen.queryByLabelText("选区批注")).toBeNull();
    });
  });

  it("marks cross-block rendered-text selection annotations", async () => {
    const annotation = fileAnnotation({
      id: "ann-cross",
      path: "guide.md",
      anchor_type: "selection",
      selected_text: "Target text",
      comment: "Explain this range",
    });
    const runtime = fakeRuntime({
      readFile: vi.fn().mockResolvedValue({
        path: "guide.md",
        content: "# Guide\n\nFirst **Target**\n\ntext end",
        encoding: "utf-8",
      }),
      listAnnotations: vi.fn().mockResolvedValue([annotation]),
    });

    render(<FilePreview request={{ type: "file", path: "guide.md" }} sessionId="ses-1" runtime={runtime} />);

    await screen.findByRole("heading", { name: "Guide" });
    await waitFor(() => {
      expect(document.querySelectorAll('[data-preview-annotation-id="ann-cross"]').length).toBe(2);
    });
    const markers = Array.from(document.querySelectorAll('[data-preview-annotation-id="ann-cross"]'));
    expect(markers.map((marker) => marker.textContent)).toEqual(["Target", "text"]);
  });

  it("marks rendered cross-block annotations in source view with markdown syntax between selected words", async () => {
    const annotation = fileAnnotation({
      id: "ann-cross-source",
      path: "guide.md",
      anchor_type: "selection",
      selected_text: "Target text",
      comment: "Explain this range",
    });
    const runtime = fakeRuntime({
      readFile: vi.fn().mockResolvedValue({
        path: "guide.md",
        content: "# Guide\n\nFirst **Target**\n\ntext end",
        encoding: "utf-8",
      }),
      listAnnotations: vi.fn().mockResolvedValue([annotation]),
    });

    render(<FilePreview request={{ type: "file", path: "guide.md" }} sessionId="ses-1" runtime={runtime} />);

    await screen.findByRole("heading", { name: "Guide" });
    fireEvent.click(screen.getByRole("button", { name: "源码" }));
    expect(await screen.findByTestId("file-source-viewer")).not.toBeNull();
    await waitFor(() => {
      expect(document.querySelector('[data-file-annotation-id="ann-cross-source"]')).not.toBeNull();
    });
  });

  it("marks source markdown selection annotations in rendered preview", async () => {
    const annotation = fileAnnotation({
      id: "ann-source-markdown",
      path: "guide.md",
      anchor_type: "selection",
      selected_text: "**Target**\n\ntext",
      line_start: 3,
      line_end: 5,
      column_start: 7,
      column_end: 5,
      comment: "Explain this range",
    });
    const runtime = fakeRuntime({
      readFile: vi.fn().mockResolvedValue({
        path: "guide.md",
        content: "# Guide\n\nFirst **Target**\n\ntext end",
        encoding: "utf-8",
      }),
      listAnnotations: vi.fn().mockResolvedValue([annotation]),
    });

    render(<FilePreview request={{ type: "file", path: "guide.md" }} sessionId="ses-1" runtime={runtime} />);

    await screen.findByRole("heading", { name: "Guide" });
    await waitFor(() => {
      expect(document.querySelectorAll('[data-preview-annotation-id="ann-source-markdown"]').length).toBe(2);
    });
    const markers = Array.from(document.querySelectorAll('[data-preview-annotation-id="ann-source-markdown"]'));
    expect(markers.map((marker) => marker.textContent)).toEqual(["Target", "text"]);
  });

  it("locates rendered-text selection annotations from the annotation panel", async () => {
    const scrollDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, "scrollIntoView");
    const scrollIntoView = vi.fn();
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });
    const annotation = fileAnnotation({
      id: "ann-selection",
      path: "guide.md",
      anchor_type: "selection",
      selected_text: "Target text",
      comment: "Explain this paragraph",
    });
    const runtime = fakeRuntime({
      readFile: vi.fn().mockResolvedValue({
        path: "guide.md",
        content: "# Guide\n\nTarget text",
        encoding: "utf-8",
      }),
      listAnnotations: vi.fn().mockResolvedValue([annotation]),
    });

    try {
      render(<FilePreview request={{ type: "file", path: "guide.md" }} sessionId="ses-1" runtime={runtime} />);

      await screen.findByRole("heading", { name: "Guide" });
      await waitFor(() => {
        expect(document.querySelector('[data-preview-annotation-id="ann-selection"]')).not.toBeNull();
      });

      fireEvent.click(screen.getByRole("button", { name: "文件批注 1" }));
      const panel = await screen.findByLabelText("文件批注");
      fireEvent.click(within(panel).getByRole("button", { name: "定位批注片段" }));

      expect(scrollIntoView).toHaveBeenCalledWith({
        block: "center",
        inline: "nearest",
        behavior: "smooth",
      });
      await waitFor(() => {
        expect(document.querySelector('[data-preview-annotation-id="ann-selection"]')?.getAttribute("data-flash")).toBe(
          "true",
        );
      });
      expect(screen.queryByLabelText("选区批注")).toBeNull();
    } finally {
      if (scrollDescriptor) {
        Object.defineProperty(Element.prototype, "scrollIntoView", scrollDescriptor);
      } else {
        delete (Element.prototype as { scrollIntoView?: Element["scrollIntoView"] }).scrollIntoView;
      }
    }
  });

  it("keeps source view when locating annotations from the annotation panel", async () => {
    const annotation = fileAnnotation({
      id: "ann-selection",
      path: "guide.md",
      anchor_type: "selection",
      selected_text: "Target text",
      comment: "Explain this paragraph",
    });
    const runtime = fakeRuntime({
      readFile: vi.fn().mockResolvedValue({
        path: "guide.md",
        content: "# Guide\n\nTarget text",
        encoding: "utf-8",
      }),
      listAnnotations: vi.fn().mockResolvedValue([annotation]),
    });

    render(<FilePreview request={{ type: "file", path: "guide.md" }} sessionId="ses-1" runtime={runtime} />);

    await screen.findByRole("heading", { name: "Guide" });
    fireEvent.click(screen.getByRole("button", { name: "源码" }));
    expect(await screen.findByTestId("file-source-viewer")).not.toBeNull();
    await waitFor(() => {
      expect(document.querySelector('[data-file-annotation-id="ann-selection"]')).not.toBeNull();
    });

    fireEvent.click(screen.getByRole("button", { name: "文件批注 1" }));
    const panel = await screen.findByLabelText("文件批注");
    fireEvent.click(within(panel).getByRole("button", { name: "定位批注片段" }));

    expect(screen.getByRole("button", { name: "源码" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("file-source-viewer")).not.toBeNull();
    expect(screen.queryByRole("heading", { name: "Guide" })).toBeNull();
  });

  it("marks normalized cross-line annotations in source view", async () => {
    const annotation = fileAnnotation({
      id: "ann-cross-source",
      path: "guide.md",
      anchor_type: "selection",
      selected_text: "Target text",
      comment: "Explain this range",
    });
    const runtime = fakeRuntime({
      readFile: vi.fn().mockResolvedValue({
        path: "guide.md",
        content: "# Guide\n\nTarget\ntext",
        encoding: "utf-8",
      }),
      listAnnotations: vi.fn().mockResolvedValue([annotation]),
    });

    render(<FilePreview request={{ type: "file", path: "guide.md" }} sessionId="ses-1" runtime={runtime} />);

    await screen.findByRole("heading", { name: "Guide" });
    fireEvent.click(screen.getByRole("button", { name: "源码" }));
    expect(await screen.findByTestId("file-source-viewer")).not.toBeNull();
    await waitFor(() => {
      expect(document.querySelector('[data-file-annotation-id="ann-cross-source"]')).not.toBeNull();
    });
  });

  it("edits selection annotations from the mark popover", async () => {
    const annotation = fileAnnotation({
      id: "ann-selection",
      path: "guide.md",
      anchor_type: "selection",
      selected_text: "Target text",
      comment: "Explain this paragraph",
    });
    const updated = { ...annotation, comment: "Updated from popover" };
    const runtime = fakeRuntime({
      readFile: vi.fn().mockResolvedValue({
        path: "guide.md",
        content: "# Guide\n\nTarget text",
        encoding: "utf-8",
      }),
      listAnnotations: vi.fn().mockResolvedValue([annotation]),
      updateAnnotation: vi.fn().mockResolvedValue(updated),
    });

    render(<FilePreview request={{ type: "file", path: "guide.md" }} sessionId="ses-1" runtime={runtime} />);

    await screen.findByRole("heading", { name: "Guide" });
    await waitFor(() => {
      expect(document.querySelector('[data-preview-annotation-id="ann-selection"]')).not.toBeNull();
    });

    fireEvent.click(document.querySelector('[data-preview-annotation-id="ann-selection"]') as Element);
    const popover = await screen.findByLabelText("选区批注");
    fireEvent.change(within(popover).getByRole("textbox", { name: "编辑批注" }), {
      target: { value: "Updated from popover" },
    });
    fireEvent.click(within(popover).getByRole("button", { name: "保存批注" }));

    await waitFor(() => {
      expect(runtime.workspace.updateAnnotation).toHaveBeenCalledWith(
        { sessionId: "ses-1" },
        "ann-selection",
        { comment: "Updated from popover" },
      );
    });
    await waitFor(() => {
      expect(screen.queryByLabelText("选区批注")).toBeNull();
    });

    fireEvent.click(document.querySelector('[data-preview-annotation-id="ann-selection"]') as Element);
    expect(await screen.findByDisplayValue("Updated from popover")).not.toBeNull();
  });

  it("does not offer selection actions inside annotation popovers or panels", async () => {
    const annotation = fileAnnotation({
      id: "ann-selection",
      path: "guide.md",
      anchor_type: "selection",
      selected_text: "Target text",
      comment: "Explain this paragraph",
    });
    const runtime = fakeRuntime({
      readFile: vi.fn().mockResolvedValue({
        path: "guide.md",
        content: "# Guide\n\nTarget text",
        encoding: "utf-8",
      }),
      listAnnotations: vi.fn().mockResolvedValue([annotation]),
    });

    render(<FilePreview request={{ type: "file", path: "guide.md" }} sessionId="ses-1" runtime={runtime} />);

    await screen.findByRole("heading", { name: "Guide" });
    await waitFor(() => {
      expect(document.querySelector('[data-preview-annotation-id="ann-selection"]')).not.toBeNull();
    });
    fireEvent.click(document.querySelector('[data-preview-annotation-id="ann-selection"]') as Element);

    const popover = await screen.findByLabelText("选区批注");
    const popoverSelection = mockSelection(popover, "Explain this paragraph");
    act(() => {
      document.dispatchEvent(new MouseEvent("mouseup"));
    });
    await waitFor(() => {
      expect(screen.queryByRole("toolbar")).toBeNull();
    });
    popoverSelection.restore();
    expect(within(popover).queryByRole("button", { name: "打开批注面板" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "文件批注 1" }));
    await waitFor(() => {
      expect(screen.queryByLabelText("选区批注")).toBeNull();
    });
    expect(await screen.findByLabelText("文件批注")).not.toBeNull();

    const excludedSurfaces = document.querySelectorAll("[data-file-preview-selection-excluded='true']");
    const panel = excludedSurfaces.item(excludedSurfaces.length - 1);
    const panelSelection = mockSelection(panel, "Explain this paragraph");
    act(() => {
      document.dispatchEvent(new MouseEvent("mouseup"));
    });
    await waitFor(() => {
      expect(screen.queryByRole("toolbar")).toBeNull();
    });
    panelSelection.restore();
  });

  it("closes annotation popovers after chat or delete actions", async () => {
    const onStartChatFromAnnotation = vi.fn();
    const annotation = fileAnnotation({
      id: "ann-selection",
      path: "guide.md",
      anchor_type: "selection",
      selected_text: "Target text",
      comment: "Explain this paragraph",
    });
    const runtime = fakeRuntime({
      readFile: vi.fn().mockResolvedValue({
        path: "guide.md",
        content: "# Guide\n\nTarget text",
        encoding: "utf-8",
      }),
      listAnnotations: vi.fn().mockResolvedValue([annotation]),
      deleteAnnotation: vi.fn().mockResolvedValue(undefined),
    });

    render(
      <FilePreview
        request={{ type: "file", path: "guide.md" }}
        sessionId="ses-1"
        runtime={runtime}
        onStartChatFromAnnotation={onStartChatFromAnnotation}
      />,
    );

    await screen.findByRole("heading", { name: "Guide" });
    await waitFor(() => {
      expect(document.querySelector('[data-preview-annotation-id="ann-selection"]')).not.toBeNull();
    });
    fireEvent.click(document.querySelector('[data-preview-annotation-id="ann-selection"]') as Element);
    fireEvent.click(within(await screen.findByLabelText("选区批注")).getByRole("button", {
      name: "基于此批注发起对话",
    }));

    expect(onStartChatFromAnnotation).toHaveBeenCalledWith({
      path: "guide.md",
      comment: "Explain this paragraph",
      selectedText: "Target text",
      lineStart: null,
      lineEnd: null,
    });
    await waitFor(() => {
      expect(screen.queryByLabelText("选区批注")).toBeNull();
    });

    fireEvent.click(document.querySelector('[data-preview-annotation-id="ann-selection"]') as Element);
    fireEvent.click(within(await screen.findByLabelText("选区批注")).getByRole("button", { name: "删除批注" }));

    await waitFor(() => {
      expect(runtime.workspace.deleteAnnotation).toHaveBeenCalledWith({ sessionId: "ses-1" }, "ann-selection");
    });
    await waitFor(() => {
      expect(screen.queryByLabelText("选区批注")).toBeNull();
    });
  });

  it("marks source selection annotations and opens a popover from the mark", async () => {
    const annotation = fileAnnotation({
      id: "ann-line",
      path: "src/main.ts",
      anchor_type: "selection",
      selected_text: "const value = 1",
      line_start: 2,
      line_end: 2,
      column_start: 1,
      column_end: 16,
      comment: "Check this value",
    });
    const runtime = fakeRuntime({
      readFile: vi.fn().mockResolvedValue({
        path: "src/main.ts",
        content: "export {}\nconst value = 1\n",
        encoding: "utf-8",
      }),
      listAnnotations: vi.fn().mockResolvedValue([annotation]),
    });

    render(<FilePreview request={{ type: "file", path: "src/main.ts" }} sessionId="ses-1" runtime={runtime} />);

    await screen.findByTestId("file-source-viewer");
    await waitFor(() => {
      expect(document.querySelector('[data-file-annotation-id="ann-line"]')).not.toBeNull();
    });

    fireEvent.click(document.querySelector('[data-file-annotation-id="ann-line"]') as Element);

    expect(await screen.findByLabelText("选区批注")).not.toBeNull();
    expect(screen.getByText("Check this value")).not.toBeNull();
  });

  it("keeps file preview usable when annotation loading fails", async () => {
    const runtime = fakeRuntime({
      readFile: vi.fn().mockResolvedValue({
        path: "README.md",
        content: "# Hello\n",
        encoding: "utf-8",
      }),
      listAnnotations: vi.fn().mockRejectedValue(new Error("annotation failed")),
    });

    render(<FilePreview request={{ type: "file", path: "README.md" }} sessionId="ses-1" runtime={runtime} />);

    expect(await screen.findByRole("heading", { name: "Hello" })).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /文件批注/ }));
    expect(await screen.findByText("annotation failed")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "重试" }));

    await waitFor(() => {
      expect(runtime.workspace.listAnnotations).toHaveBeenCalledTimes(2);
    });
  });

  it("starts chat from a line-backed annotation without sending automatically", async () => {
    const onStartChatFromAnnotation = vi.fn();
    const annotation = fileAnnotation({
      id: "ann-line",
      path: "src/main.ts",
      anchor_type: "selection",
      selected_text: "const value = 1",
      line_start: 2,
      line_end: 2,
      comment: "Check this value",
    });
    const runtime = fakeRuntime({
      readFile: vi.fn().mockResolvedValue({
        path: "src/main.ts",
        content: "export {}\nconst value = 1\n",
        encoding: "utf-8",
      }),
      listAnnotations: vi.fn().mockResolvedValue([annotation]),
    });

    render(
      <FilePreview
        request={{ type: "file", path: "src/main.ts" }}
        sessionId="ses-1"
        runtime={runtime}
        onStartChatFromAnnotation={onStartChatFromAnnotation}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: /文件批注/ }));
    expect(await screen.findByText("Check this value")).not.toBeNull();
    expect(screen.getByText("L2")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "基于此批注发起对话" }));

    expect(onStartChatFromAnnotation).toHaveBeenCalledWith({
      path: "src/main.ts",
      comment: "Check this value",
      selectedText: "const value = 1",
      lineStart: 2,
      lineEnd: 2,
    });
  });
});

function fakeRuntime(overrides: Partial<RuntimeBridge["workspace"]> = {}): RuntimeBridge {
  return {
    workspace: {
      readFile: vi.fn(),
      readMedia: vi.fn(),
      listAnnotations: vi.fn().mockResolvedValue([]),
      createAnnotation: vi.fn(),
      updateAnnotation: vi.fn(),
      deleteAnnotation: vi.fn(),
      ...overrides,
    },
  } as unknown as RuntimeBridge;
}

type TestAnnotation = {
  id: string;
  scope_type: "session" | "workspace";
  scope_id: string;
  workspace_id: string | null;
  path: string;
  anchor_type: "file" | "selection";
  comment: string;
  selected_text: string | null;
  line_start: number | null;
  line_end: number | null;
  column_start: number | null;
  column_end: number | null;
  content_hash: string | null;
  created_at: string;
  updated_at: string;
};

function fileAnnotation(overrides: Partial<TestAnnotation> = {}): TestAnnotation {
  return {
    id: "ann-1",
    scope_type: "session",
    scope_id: "ses-1",
    workspace_id: "ws-1",
    path: "README.md",
    anchor_type: "file",
    comment: "Annotation",
    selected_text: null,
    line_start: null,
    line_end: null,
    column_start: null,
    column_end: null,
    content_hash: null,
    created_at: "2026-06-24T00:00:00Z",
    updated_at: "2026-06-24T00:00:00Z",
    ...overrides,
  };
}

async function showSelectionToolbar(container: Element, text: string) {
  const selection = mockSelection(container, text);
  await act(async () => {
    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, 0);
    });
    document.dispatchEvent(new MouseEvent("mouseup"));
    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, 0);
    });
    document.dispatchEvent(new KeyboardEvent("keyup"));
  });
  return selection;
}

function PreviewTabsHarness() {
  const preview = usePreview();
  return (
    <>
      <button
        type="button"
        onClick={() =>
          preview.openPreview({
            type: "content",
            title: "HTML 片段",
            content: "<main><h1>HTML 片段</h1></main>",
            contentType: "html",
          })
        }
      >
        打开 HTML
      </button>
      <button
        type="button"
        onClick={() =>
          preview.openPreview({
            type: "content",
            title: "Markdown 片段",
            content: "# Markdown 片段",
            contentType: "markdown",
          })
        }
      >
        打开 Markdown
      </button>
      {preview.request ? <FilePreview request={preview.request} /> : null}
    </>
  );
}

function PreviewScopeHarness() {
  const [sessionId, setSessionId] = useState("ses-a");
  const preview = usePreview();

  useEffect(() => {
    preview.setPreviewHostContext({ sessionId });
    return () => preview.setPreviewHostContext(null);
  }, [preview.setPreviewHostContext, sessionId]);

  return (
    <>
      <button type="button" onClick={() => setSessionId((current) => (current === "ses-a" ? "ses-b" : "ses-a"))}>
        切到 {sessionId === "ses-a" ? "ses-b" : "ses-a"}
      </button>
      <button
        type="button"
        onClick={() =>
          preview.openPreview({
            type: "content",
            title: `${sessionId} 预览`,
            content: `# ${sessionId}`,
            contentType: "markdown",
          })
        }
      >
        打开当前会话预览
      </button>
      <div data-testid="preview-request">
        {preview.request?.type === "content" ? `${sessionId}:${preview.request.title}` : "empty"}
      </div>
      <div data-testid="preview-entry-count">{preview.entries.length}</div>
    </>
  );
}

function mockSelection(container: Element, text: string) {
  const removeAllRanges = vi.fn();
  const range = {
    commonAncestorContainer: container,
    getBoundingClientRect: () => ({
      left: 120,
      top: 140,
      right: 220,
      bottom: 160,
      width: 100,
      height: 20,
      x: 120,
      y: 140,
      toJSON: () => ({}),
    }),
  };
  const spy = vi.spyOn(window, "getSelection").mockReturnValue({
    toString: () => text,
    rangeCount: 1,
    getRangeAt: () => range,
    removeAllRanges,
  } as unknown as Selection);

  return {
    removeAllRanges,
    restore: () => spy.mockRestore(),
  };
}

function mockElementMetrics(metrics: { clientWidth: number; clientHeight: number }) {
  restoreElementMetrics?.();

  const clientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth");
  const clientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientHeight");

  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get: () => metrics.clientWidth,
  });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get: () => metrics.clientHeight,
  });

  restoreElementMetrics = () => {
    if (clientWidth) {
      Object.defineProperty(HTMLElement.prototype, "clientWidth", clientWidth);
    } else {
      delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
    }

    if (clientHeight) {
      Object.defineProperty(HTMLElement.prototype, "clientHeight", clientHeight);
    } else {
      delete (HTMLElement.prototype as { clientHeight?: number }).clientHeight;
    }
  };
}

function pointerEvent(
  type: string,
  properties: { button?: number; clientX?: number; clientY?: number; pointerId?: number },
) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    button: { value: properties.button ?? 0 },
    clientX: { value: properties.clientX ?? 0 },
    clientY: { value: properties.clientY ?? 0 },
    pointerId: { value: properties.pointerId ?? 1 },
  });
  return event;
}
