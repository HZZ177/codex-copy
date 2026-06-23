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
    render(
      <FilePreview
        request={{ type: "content", title: "消息片段", content: "# 片段标题\n\n正文内容", contentType: "markdown" }}
        onQuoteSelection={onQuoteSelection}
      />,
    );

    const body = await screen.findByLabelText("预览内容");
    const selection = mockSelection(body, "正文内容");
    act(() => {
      document.dispatchEvent(new MouseEvent("mouseup"));
    });
    fireEvent.click(await screen.findByRole("button", { name: "添加选中文本到对话" }));

    expect(onQuoteSelection).toHaveBeenCalledWith("正文内容");
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
});

function fakeRuntime(overrides: Partial<RuntimeBridge["workspace"]> = {}): RuntimeBridge {
  return {
    workspace: {
      readFile: vi.fn(),
      readMedia: vi.fn(),
      ...overrides,
    },
  } as unknown as RuntimeBridge;
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
