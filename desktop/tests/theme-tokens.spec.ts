import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const themeDir = resolve(dirname(fileURLToPath(import.meta.url)), "../src/renderer/styles/themes");

describe("theme tokens", () => {
  it("defines Keydex-like light and dark semantic tokens", () => {
    const css = readFileSync(resolve(themeDir, "default-color-scheme.css"), "utf8");

    [
      "--color-bg-1",
      "--color-bg-2",
      "--color-border-2",
      "--fill-0",
      "--color-fill-1",
      "--color-text-1",
      "--color-text-2",
      "--color-primary-6",
      "--color-skill",
      "--composer-bg",
      "--inline-block-bg",
    ].forEach((token) => expect(css).toContain(token));

    expect(css).toContain(':root[data-theme="dark"]');
    expect(css).toContain("--color-bg-1: #111111");
    expect(css).toContain("--color-text-1: #fcfcfc");
    expect(css).toContain("--color-primary-6: #0169cc");
    expect(css).toContain("--diff-added-text: #00a240");
    expect(css).toContain("--diff-removed-text: #e02e2a");
    expect(css).toContain("--color-skill: #b06dff");
    expect(css).toContain("#1677ff");
    expect(css).toContain("#d97706");
  });
});
