import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createRef } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildMarkdownAnnotationIndex,
  buildMarkdownDocumentModel,
  buildMarkdownFindIndex,
  VirtualMarkdownPreview,
  type VirtualMarkdownPreviewHandle,
} from "@/renderer/components/workspace/markdownPreviewEngine";
import { createSourceRangeAnchor } from "@/renderer/components/workspace/filePreviewAnnotations";
import { createLargeMarkdownPreviewFixture } from "./fixtures/markdownPreviewEngine";

const virtuosoMock = vi.hoisted(() => ({
  scrollToIndex: vi.fn(),
}));

vi.mock("react-virtuoso", async () => {
  const React = await vi.importActual<typeof import("react")>("react");
  return {
    Virtuoso: React.forwardRef(function VirtuosoMock(props: {
    data: unknown[];
    itemContent: (index: number, item: unknown) => unknown;
    rangeChanged?: (range: { startIndex: number; endIndex: number }) => void;
  }, ref) {
    const endIndex = Math.min(7, props.data.length - 1);
    const rangeChanged = props.rangeChanged;
    React.useImperativeHandle(ref, () => ({
      scrollToIndex: virtuosoMock.scrollToIndex,
    }));
    React.useEffect(() => {
      if (endIndex >= 0) {
        rangeChanged?.({ startIndex: 0, endIndex });
      }
    }, [endIndex, rangeChanged]);
    return React.createElement(
      "div",
      { "data-testid": "virtuoso-mock" },
      props.data.slice(0, endIndex + 1).map((item, index) =>
        React.createElement(
          "div",
          { "data-testid": "virtuoso-item", key: index },
          props.itemContent(index, item) as import("react").ReactNode,
        ),
      ),
    );
  }),
  };
});

describe("VirtualMarkdownPreview", () => {
  beforeEach(() => {
    virtuosoMock.scrollToIndex.mockClear();
  });

  it("renders only mounted markdown blocks and exposes mounted metrics", async () => {
    const model = buildMarkdownDocumentModel(createLargeMarkdownPreviewFixture(24));
    const mountedChanges: string[][] = [];

    render(<VirtualMarkdownPreview model={model} onMountedBlockIdsChange={(ids) => mountedChanges.push(ids)} />);

    expect(screen.getByTestId("virtuoso-mock")).not.toBeNull();
    expect(document.querySelectorAll("[data-markdown-block-id]").length).toBeLessThan(model.blocks.length);
    expect(document.querySelectorAll("[data-markdown-block-id]").length).toBe(8);
    const root = document.querySelector("[data-markdown-virtual-preview='true']") as HTMLElement;
    expect(root.dataset.markdownBlockCount).toBe(String(model.blocks.length));
    expect(root.dataset.markdownModelReady).toBe("true");
    expect(await screen.findByText("E2E Large Markdown Title")).not.toBeNull();
    expect(mountedChanges.at(-1)).toHaveLength(8);
    expect(Number(root.dataset.markdownMountedHeavyBlockCount)).toBeGreaterThan(0);
  });

  it("renders source line gutter only when enabled", () => {
    const model = buildMarkdownDocumentModel(["# Title", "", "Paragraph text", "", "- item"].join("\n"));

    const { rerender } = render(<VirtualMarkdownPreview model={model} />);

    expect(document.querySelector("[data-markdown-preview-line-number='true']")).toBeNull();

    rerender(<VirtualMarkdownPreview model={model} showSourceGutter />);

    expect(Array.from(document.querySelectorAll("[data-markdown-preview-line-number='true']")).map((node) => node.textContent)).toEqual([
      "1",
      "3",
      "5",
    ]);
    expect(screen.getByRole("button", { name: "折叠第 1 行章节" })).not.toBeNull();
  });

  it("folds heading sections and multiline preview blocks from the gutter", async () => {
    const source = [
      "# Title",
      "",
      "intro text",
      "",
      "## Child",
      "",
      "child text",
      "",
      "# Next",
      "",
      "next text",
      "",
      "line one",
      "line two",
    ].join("\n");
    const model = buildMarkdownDocumentModel(source);
    const ref = createRef<VirtualMarkdownPreviewHandle>();

    render(<VirtualMarkdownPreview model={model} ref={ref} showSourceGutter />);

    fireEvent.click(screen.getByRole("button", { name: "折叠第 1 行章节" }));

    expect(screen.getByRole("heading", { name: "Title" })).not.toBeNull();
    expect(screen.getByText("intro text").closest("[data-markdown-preview-block-frame='true']")?.getAttribute("data-fold-exiting")).toBe("true");
    expect(screen.getByText("已折叠 6 行")).not.toBeNull();
    await waitFor(() => expect(screen.queryByText("intro text")).toBeNull());
    expect(screen.queryByRole("heading", { name: "Child" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Next" })).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "展开第 1 行章节" }));
    expect(screen.getByText("intro text")).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Child" })).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "折叠第 13 行内容" }));
    expect(screen.queryByText("line one")).toBeNull();
    expect(screen.getByText("已折叠 2 行")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "展开第 13 行内容" }));
    expect(screen.getByText("line one")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "折叠第 1 行章节" }));
    act(() => {
      expect(ref.current?.scrollToBlock(model.blocks[2].id, "center")).toBe(true);
    });
    expect(virtuosoMock.scrollToIndex).toHaveBeenCalledWith({ align: "center", index: 2 });
  });

  it("provides scrollToBlock and marks the pending reveal target", () => {
    const model = buildMarkdownDocumentModel(createLargeMarkdownPreviewFixture(24));
    const ref = createRef<VirtualMarkdownPreviewHandle>();
    render(<VirtualMarkdownPreview model={model} ref={ref} />);
    const target = model.blocks[20];

    let scrolled = false;
    act(() => {
      scrolled = ref.current?.scrollToBlock(target.id, "center") ?? false;
    });
    expect(scrolled).toBe(true);
    expect(virtuosoMock.scrollToIndex).toHaveBeenCalledWith({ align: "center", index: 20 });
    expect(ref.current?.scrollToBlock("missing-block")).toBe(false);
    expect(ref.current?.scrollToIndex(-1)).toBe(false);
  });

  it("scrolls to valid annotations and refuses invalid anchors", () => {
    const source = createLargeMarkdownPreviewFixture(24);
    const model = buildMarkdownDocumentModel(source);
    const targetBlock = model.blocks[20];
    const targetStart = targetBlock.sourceStart;
    const annotationIndex = buildMarkdownAnnotationIndex(model, [
      {
        anchor_json: createSourceRangeAnchor(source, targetStart, targetStart + 8, "preview"),
        anchor_type: "selection",
        id: "ann-deep",
      },
      {
        anchor_json: { version: 2, kind: "source-range", sourceStart: -1, sourceEnd: -2 },
        anchor_type: "selection",
        id: "ann-invalid",
      },
    ]);
    const ref = createRef<VirtualMarkdownPreviewHandle>();
    render(<VirtualMarkdownPreview annotationIndex={annotationIndex} model={model} ref={ref} />);

    let scrolled = false;
    act(() => {
      scrolled = ref.current?.scrollToAnnotation("ann-deep", "center") ?? false;
    });
    expect(scrolled).toBe(true);
    expect(virtuosoMock.scrollToIndex).toHaveBeenCalledWith({ align: "center", index: 20 });
    expect(ref.current?.scrollToAnnotation("ann-invalid")).toBe(false);
    expect(ref.current?.scrollToAnnotation("missing")).toBe(false);
  });

  it("scrolls to find matches by match id", () => {
    const source = createLargeMarkdownPreviewFixture(24);
    const model = buildMarkdownDocumentModel(source);
    const findIndex = buildMarkdownFindIndex(model, "tail-search-target");
    const target = findIndex.matches.at(-1);
    expect(target).toBeTruthy();
    const ref = createRef<VirtualMarkdownPreviewHandle>();
    render(<VirtualMarkdownPreview findIndex={findIndex} model={model} ref={ref} />);

    let scrolled = false;
    act(() => {
      scrolled = ref.current?.scrollToFindMatch(target?.id ?? "", "center") ?? false;
    });
    expect(scrolled).toBe(true);
    expect(virtuosoMock.scrollToIndex).toHaveBeenCalledWith({ align: "center", index: target?.blockIndex });
    expect(ref.current?.scrollToFindMatch("missing")).toBe(false);
  });
});
