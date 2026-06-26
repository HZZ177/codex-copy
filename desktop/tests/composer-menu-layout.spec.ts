import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const srcDir = resolve(dirname(fileURLToPath(import.meta.url)), "../src");

describe("composer menu layout", () => {
  it("keeps composer popup menus on the shared picker surface", () => {
    const popupMenu = readSource("renderer/components/chat/ComposerPopupMenu/ComposerPopupMenu.module.css");
    const atFileMenu = readSource("renderer/components/chat/AtFileMenu/AtFileMenu.tsx");
    const slashCommandMenu = readSource("renderer/components/chat/SlashCommandMenu/SlashCommandMenu.tsx");

    expect(popupMenu).toMatch(/\.menu\s*{[^}]*box-sizing:\s*border-box/s);
    expect(popupMenu).toMatch(/\.menu\s*{[^}]*width:\s*min\(736px,\s*100%,\s*calc\(100vw - 56px\)\)/s);
    expect(popupMenu).toMatch(/\.item\[data-active="true"\]/);
    expect(atFileMenu).toContain("ComposerPopupMenu/ComposerPopupMenu.module.css");
    expect(slashCommandMenu).toContain("ComposerPopupMenu/ComposerPopupMenu.module.css");
  });
});

function readSource(relativePath: string): string {
  return readFileSync(resolve(srcDir, relativePath), "utf8");
}
