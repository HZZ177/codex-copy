import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { APP_FIND_SHORTCUT_EVENT, type AppFindShortcutDetail } from "@/renderer/events/findShortcut";
import { AppProviders } from "@/renderer/providers/AppProviders";

describe("app find shortcut", () => {
  it("prevents the browser find box and emits the app find shortcut event", () => {
    const starter = vi.fn(() => new Promise<never>(() => undefined));
    const findShortcut = vi.fn();
    document.addEventListener(APP_FIND_SHORTCUT_EVENT, findShortcut);

    try {
      render(
        <AppProviders runtimeConnection={{ starter }}>
          <input aria-label="快捷键目标" />
        </AppProviders>,
      );

      const target = screen.getByLabelText("快捷键目标");
      const event = new KeyboardEvent("keydown", {
        key: "f",
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });
      target.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(true);
      expect(findShortcut).toHaveBeenCalledTimes(1);
      expect((findShortcut.mock.calls[0][0] as CustomEvent<AppFindShortcutDetail>).detail.sourceTarget).toBe(target);
    } finally {
      document.removeEventListener(APP_FIND_SHORTCUT_EVENT, findShortcut);
    }
  });
});
