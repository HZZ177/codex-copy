import { describe, expect, it } from "vitest";

import { selectedQuoteFromText } from "@/renderer/components/chat/SendBox";
import { prepareComposerMessage } from "@/renderer/utils/messageInjection";

describe("message injection composer helpers", () => {
  it("moves selected quotes and selected files into follow injections", () => {
    const quote = selectedQuoteFromText("selected text");
    if (!quote) {
      throw new Error("quote not created");
    }
    const prepared = prepareComposerMessage("please review now", [
      { path: "src/main.ts", name: "main.ts", type: "file", source: "workspace" },
    ], { quotes: [quote] });

    expect(prepared.message).toBe("please review now");
    expect(prepared.contextItems.map((item) => item.type)).toEqual(["quote", "file"]);
    expect(prepared.contextItems[0]).toMatchObject({
      type: "quote",
      content: "selected text",
      role: "HumanMessage",
      source: "follow",
    });
    expect(prepared.contextItems[1]).toMatchObject({
      type: "file",
      label: "main.ts",
      path: "src/main.ts",
      fileType: "file",
      role: "HumanMessage",
      source: "follow",
    });

    expect(prepared.runtimeParams?.message_injection).toHaveLength(2);
    expect(prepared.runtimeParams?.message_injection[0]).toMatchObject({
      type: "follow",
      role: "HumanMessage",
      metadata: {
        kind: "quote",
      },
    });
    expect(prepared.runtimeParams?.message_injection[0]?.content).toContain("selected text");
    expect(prepared.runtimeParams?.message_injection[1]).toMatchObject({
      type: "follow",
      role: "HumanMessage",
      metadata: {
        kind: "file",
        path: "src/main.ts",
        fileType: "file",
      },
    });
    expect(prepared.runtimeParams?.message_injection[1]?.content).toContain("src/main.ts");
  });

  it("allows file-only sends without polluting the visible message", () => {
    const prepared = prepareComposerMessage("", [
      { path: "README.md", name: "README.md", type: "file", source: "workspace" },
    ]);

    expect(prepared.message).toBe("");
    expect(prepared.contextItems).toHaveLength(1);
    expect(prepared.runtimeParams?.message_injection).toHaveLength(1);
  });

  it("packs file-backed quote context into one self-contained injection", () => {
    const quote = selectedQuoteFromText("selected text", {
      source: "annotation",
      file: {
        path: "README.md",
        name: "README.md",
        lineStart: 3,
        lineEnd: 4,
        sourceStart: 18,
        sourceEnd: 31,
      },
    });
    if (!quote) {
      throw new Error("quote not created");
    }
    const prepared = prepareComposerMessage("comment stays visible", [], { quotes: [quote] });

    expect(prepared.message).toBe("comment stays visible");
    expect(prepared.contextItems).toHaveLength(1);
    expect(prepared.contextItems[0]).toMatchObject({
      type: "source_quote",
      label: "README.md · L3-L4",
      content: "selected text",
      path: "README.md",
      role: "HumanMessage",
      source: "follow",
      metadata: {
        kind: "source_quote",
        line_start: 3,
        line_end: 4,
        source_start: 18,
        source_end: 31,
      },
    });
    expect(prepared.runtimeParams?.message_injection).toHaveLength(1);
    expect(prepared.runtimeParams?.message_injection[0]).toMatchObject({
      type: "follow",
      role: "HumanMessage",
      metadata: {
        kind: "source_quote",
        path: "README.md",
        line_start: 3,
        line_end: 4,
        source_start: 18,
        source_end: 31,
      },
    });
    expect(prepared.runtimeParams?.message_injection[0]?.content).toContain("README.md");
    expect(prepared.runtimeParams?.message_injection[0]?.content).toContain("L3-L4");
    expect(prepared.runtimeParams?.message_injection[0]?.content).toContain("18-31");
    expect(prepared.runtimeParams?.message_injection[0]?.content).toContain("selected text");
    expect(prepared.runtimeParams?.message_injection[0]?.content).not.toContain("comment stays visible");
  });

  it("keeps bracket syntax as ordinary user text", () => {
    const prepared = prepareComposerMessage("please review [[selected text]] now");

    expect(prepared.message).toBe("please review [[selected text]] now");
    expect(prepared.contextItems).toEqual([]);
    expect(prepared.runtimeParams).toBeUndefined();
  });
});
