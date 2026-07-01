import { describe, expect, it } from "vitest";

import { parseUnifiedDiffDisplayLines } from "@/renderer/utils/unifiedDiff";

describe("parseUnifiedDiffDisplayLines", () => {
  it("inserts an unchanged-line separator between non-adjacent hunks", () => {
    const lines = parseUnifiedDiffDisplayLines(
      [
        "--- a/src/main.ts",
        "+++ b/src/main.ts",
        "@@ -1,2 +1,2 @@",
        " context",
        "-old",
        "+new",
        "@@ -20,2 +20,2 @@",
        " next context",
        "-old later",
        "+new later",
      ].join("\n"),
    );

    const separator = lines.find((line) => line.kind === "separator");
    expect(separator).toMatchObject({
      lineNumber: null,
      sign: "",
      content: "省略 17 行未修改内容",
    });
    expect(lines.find((line) => line.content === "next context")).toMatchObject({
      kind: "context",
      lineNumber: 20,
    });
    expect(lines.find((line) => line.content === "new later")).toMatchObject({
      kind: "add",
      lineNumber: 21,
    });
  });

  it("does not insert a separator before the first hunk or between adjacent hunks", () => {
    const lines = parseUnifiedDiffDisplayLines(
      [
        "--- a/src/main.ts",
        "+++ b/src/main.ts",
        "@@ -1,1 +1,1 @@",
        "-old",
        "+new",
        "@@ -2,1 +2,1 @@",
        "-old next",
        "+new next",
      ].join("\n"),
    );

    expect(lines.some((line) => line.kind === "separator")).toBe(false);
  });
});
