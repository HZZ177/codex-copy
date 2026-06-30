import type { Window as TauriWindow } from "@tauri-apps/api/window";

export type WindowAction = "minimize" | "toggleMaximize" | "close" | "startDragging";

export interface WindowActionResult {
  ok: boolean;
  reason?: "unavailable" | "error";
  error?: unknown;
}

export interface WindowStateResult<T> extends WindowActionResult {
  value?: T;
}

export interface WindowSubscriptionResult extends WindowActionResult {
  unlisten?: () => void;
}

type TauriWindowHandle = Pick<
  TauriWindow,
  "minimize" | "toggleMaximize" | "close" | "startDragging" | "isMaximized" | "onResized"
>;

const MAXIMIZED_RESIZE_SYNC_DELAY_MS = 120;

export type TauriWindowProvider = () => Promise<TauriWindowHandle | null>;

declare global {
  interface Window {
    __TAURI__?: unknown;
    __TAURI_INTERNALS__?: unknown;
  }
}

export function isTauriRuntime() {
  return typeof window !== "undefined" && Boolean(window.__TAURI__ || window.__TAURI_INTERNALS__);
}

let currentWindowPromise: Promise<TauriWindowHandle> | null = null;

export const getCurrentTauriWindow: TauriWindowProvider = async () => {
  if (!isTauriRuntime()) {
    return null;
  }

  currentWindowPromise ??= import("@tauri-apps/api/window")
    .then(({ getCurrentWindow }) => getCurrentWindow())
    .catch((error) => {
      currentWindowPromise = null;
      throw error;
    });

  return currentWindowPromise;
};

export function createWindowControls(provider: TauriWindowProvider = getCurrentTauriWindow) {
  async function resolveWindow(): Promise<TauriWindowHandle | WindowActionResult> {
    try {
      const appWindow = await provider();
      return appWindow ?? { ok: false, reason: "unavailable" };
    } catch (error) {
      return { ok: false, reason: "error", error };
    }
  }

  async function run(action: WindowAction): Promise<WindowActionResult> {
    const appWindow = await resolveWindow();
    if (isWindowActionResult(appWindow)) {
      return appWindow;
    }

    try {
      await appWindow[action]();
      return { ok: true };
    } catch (error) {
      return { ok: false, reason: "error", error };
    }
  }

  async function isMaximized(appWindow?: TauriWindowHandle): Promise<WindowStateResult<boolean>> {
    const resolvedWindow = appWindow ?? (await resolveWindow());
    if (isWindowActionResult(resolvedWindow)) {
      return resolvedWindow;
    }

    try {
      return { ok: true, value: await resolvedWindow.isMaximized() };
    } catch (error) {
      return { ok: false, reason: "error", error };
    }
  }

  async function onMaximizedChange(handler: (maximized: boolean) => void): Promise<WindowSubscriptionResult> {
    const appWindow = await resolveWindow();
    if (isWindowActionResult(appWindow)) {
      return appWindow;
    }

    let disposed = false;
    let lastMaximized: boolean | null = null;
    let syncTimer: number | null = null;
    const syncMaximized = async () => {
      syncTimer = null;
      const result = await isMaximized(appWindow);
      if (disposed || !result.ok || typeof result.value !== "boolean" || result.value === lastMaximized) {
        return;
      }
      lastMaximized = result.value;
      handler(result.value);
    };
    const scheduleMaximizedSync = () => {
      if (typeof window === "undefined") {
        void syncMaximized();
        return;
      }
      if (syncTimer !== null) {
        window.clearTimeout(syncTimer);
      }
      syncTimer = window.setTimeout(() => void syncMaximized(), MAXIMIZED_RESIZE_SYNC_DELAY_MS);
    };

    try {
      const unlisten = await appWindow.onResized(scheduleMaximizedSync);
      return {
        ok: true,
        unlisten: () => {
          disposed = true;
          if (syncTimer !== null && typeof window !== "undefined") {
            window.clearTimeout(syncTimer);
            syncTimer = null;
          }
          unlisten();
        },
      };
    } catch (error) {
      return { ok: false, reason: "error", error };
    }
  }

  return {
    minimize: () => run("minimize"),
    toggleMaximize: () => run("toggleMaximize"),
    close: () => run("close"),
    startDragging: () => run("startDragging"),
    isMaximized: () => isMaximized(),
    onMaximizedChange,
  };
}

function isWindowActionResult(value: TauriWindowHandle | WindowActionResult): value is WindowActionResult {
  return "ok" in value;
}

export type WindowControls = ReturnType<typeof createWindowControls>;
