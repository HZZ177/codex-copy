import { describe, expect, it } from "vitest";

import { prepareComposerMessage } from "@/renderer/utils/messageInjection";
import { createQuoteMarker } from "@/renderer/utils/quoteMarkers";

describe("message injection composer helpers", () => {
  it("moves quote markers and selected files into follow injections", () => {
    const prepared = prepareComposerMessage(`please review ${createQuoteMarker("selected text")} now`, [
      { path: "src/main.ts", name: "main.ts", type: "file", source: "workspace" },
    ]);

    expect(prepared.message).toBe("please review  now");
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
});
