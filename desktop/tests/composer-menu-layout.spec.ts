import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const srcDir = resolve(dirname(fileURLToPath(import.meta.url)), "../src");

describe("composer menu layout", () => {
  it("keeps slash and file mention menus within the composer width", () => {
    const atFileMenu = readSource("renderer/components/chat/AtFileMenu/AtFileMenu.module.css");
    const slashCommandMenu = readSource("renderer/components/chat/SlashCommandMenu/SlashCommandMenu.module.css");

    expect(atFileMenu).toMatch(/\.menu\s*{[^}]*box-sizing:\s*border-box/s);
    expect(atFileMenu).toMatch(/\.menu\s*{[^}]*width:\s*min\(520px,\s*100%,\s*calc\(100vw - 56px\)\)/s);
    expect(slashCommandMenu).toMatch(/\.menu\s*{[^}]*box-sizing:\s*border-box/s);
    expect(slashCommandMenu).toMatch(
      /\.menu\s*{[^}]*width:\s*min\(360px,\s*100%,\s*calc\(100vw - 52px\)\)/s,
    );
  });
});

function readSource(relativePath: string): string {
  return readFileSync(resolve(srcDir, relativePath), "utf8");
}
