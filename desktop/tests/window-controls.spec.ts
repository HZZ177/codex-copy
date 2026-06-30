import { describe, expect, it, vi } from "vitest";

import { createWindowControls } from "@/renderer/components/layout/Titlebar/windowControls";

describe("window controls", () => {
  it("returns unavailable outside Tauri runtime", async () => {
    const controls = createWindowControls(async () => null);

    await expect(controls.minimize()).resolves.toEqual({ ok: false, reason: "unavailable" });
  });

  it("wraps Tauri window API errors", async () => {
    const error = new Error("native failure");
    const controls = createWindowControls(async () => makeAppWindow({
      minimize: vi.fn().mockRejectedValue(error),
    }));

    const result = await controls.minimize();

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("error");
    expect(result.error).toBe(error);
  });

  it("reads and subscribes to maximized state", async () => {
    let maximized = false;
    let emitResize: (() => void) | null = null;
    const onChange = vi.fn();
    const unlisten = vi.fn();
    const appWindow = makeAppWindow({
      isMaximized: vi.fn(async () => maximized),
      onResized: vi.fn((handler: (event: unknown) => void) => {
        emitResize = () => handler({ payload: { width: 1280, height: 820 } });
        return Promise.resolve(unlisten);
      }),
    });
    const triggerResize = () => {
      const currentEmitResize = emitResize as (() => void) | null;
      currentEmitResize?.();
    };
    const controls = createWindowControls(async () => appWindow);

    await expect(controls.isMaximized()).resolves.toEqual({ ok: true, value: false });

    const subscription = await controls.onMaximizedChange(onChange);
    expect(subscription.ok).toBe(true);

    maximized = true;
    triggerResize();

    await vi.waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(true);
    });

    subscription.unlisten?.();
    expect(unlisten).toHaveBeenCalledTimes(1);
  });
});

function makeAppWindow(overrides: Record<string, unknown> = {}) {
  return {
    minimize: vi.fn().mockResolvedValue(undefined),
    toggleMaximize: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    startDragging: vi.fn().mockResolvedValue(undefined),
    isMaximized: vi.fn().mockResolvedValue(false),
    onResized: vi.fn().mockResolvedValue(vi.fn()),
    ...overrides,
  };
}
