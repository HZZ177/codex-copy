import { describe, expect, it } from "vitest";

import {
  createSourceRangeAnchor,
  filePreviewContentHash,
  sourceLineColumnAtOffset,
  validateSourceRangeAnchor,
} from "@/renderer/components/workspace/filePreviewAnnotations";

describe("file preview annotation anchors", () => {
  it("creates source-range anchors with one-based line and column metadata", () => {
    const source = "first\nsecond line\nthird";
    const start = source.indexOf("second");
    const end = start + "second".length;

    const anchor = createSourceRangeAnchor(source, start, end, "source");

    expect(anchor).toMatchObject({
      version: 2,
      kind: "source-range",
      sourceStart: 6,
      sourceEnd: 12,
      selectedText: "second",
      sourceText: "second",
      contentHash: filePreviewContentHash(source),
      lineStart: 2,
      lineEnd: 2,
      columnStart: 1,
      columnEnd: 7,
      createdInView: "source",
    });
  });

  it("creates cross-line anchors without normalizing selected source text", () => {
    const source = "alpha\nbeta\ngamma";
    const start = source.indexOf("beta");
    const end = source.indexOf("gamma") + "gamma".length;

    const anchor = createSourceRangeAnchor(source, start, end, "preview", "beta gamma");

    expect(anchor.sourceText).toBe("beta\ngamma");
    expect(anchor.selectedText).toBe("beta gamma");
    expect(anchor.lineStart).toBe(2);
    expect(anchor.lineEnd).toBe(3);
    expect(anchor.columnStart).toBe(1);
    expect(anchor.columnEnd).toBe(6);
  });

  it("keeps CRLF offsets exact instead of rewriting file content", () => {
    const source = "one\r\ntwo\r\nthree";
    const offset = source.indexOf("three");

    expect(sourceLineColumnAtOffset(source, offset)).toEqual({ line: 3, column: 1 });
    expect(createSourceRangeAnchor(source, offset, offset + 5, "source").sourceText).toBe("three");
  });

  it("rejects empty, reversed, and out-of-bounds ranges", () => {
    const source = "abc";

    expect(() => createSourceRangeAnchor(source, 1, 1, "source")).toThrow(RangeError);
    expect(() => createSourceRangeAnchor(source, 2, 1, "source")).toThrow(RangeError);
    expect(() => createSourceRangeAnchor(source, 0, 4, "source")).toThrow(RangeError);
  });

  it("validates source text and content hash against the current source", () => {
    const source = "abc def";
    const anchor = createSourceRangeAnchor(source, 4, 7, "source");

    expect(validateSourceRangeAnchor(source, anchor)).toMatchObject({ valid: true });
    expect(validateSourceRangeAnchor("abc xyz", anchor)).toMatchObject({
      reason: "content-hash-mismatch",
      valid: false,
    });
    expect(validateSourceRangeAnchor(source, { ...anchor, sourceText: "xyz" })).toMatchObject({
      reason: "source-text-mismatch",
      valid: false,
    });
  });
});
