import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const stylesDir = resolve(dirname(fileURLToPath(import.meta.url)), "../src/renderer/styles");

describe("markdown styles", () => {
  it("keeps manual list markers selectable and aligned", () => {
    const markdown = readFileSync(resolve(stylesDir, "markdown.css"), "utf8");

    expect(markdown).toMatch(/\.keydex-markdown :where\(ul, ol\)\s*{[^}]*list-style:\s*none/s);
    expect(markdown).toMatch(
      /\.keydex-markdown :where\(li\)\s*{[^}]*grid-template-columns:\s*var\(--markdown-list-marker-width\) minmax\(0,\s*1fr\)/s,
    );
    expect(markdown).toMatch(
      /\.keydex-markdown :where\(li\) > :where\(\[data-markdown-list-marker="true"\]\)\s*{[^}]*user-select:\s*text/s,
    );
  });
});
