import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const srcDir = resolve(dirname(fileURLToPath(import.meta.url)), "../src");

describe("NotificationProvider styles", () => {
  it("keeps top notifications visible over light surfaces", () => {
    const css = readFileSync(
      resolve(srcDir, "renderer/providers/NotificationProvider.module.css"),
      "utf8",
    );

    expect(css).toMatch(/\.toast\s*{[^}]*border:\s*1px solid var\(--notification-border\)/s);
    expect(css).toMatch(/\.toast\s*{[^}]*0 0 0 1px var\(--notification-outer-ring\)/s);
    expect(css).toMatch(/\.toast\[data-type="error"\]\s*{[^}]*--notification-border:[^;]*var\(--color-danger\)/s);
    expect(css).toMatch(
      /\.toast\[data-type="warning"\]\s*{[^}]*--notification-border:[^;]*var\(--color-warning-6\)/s,
    );
  });
});
