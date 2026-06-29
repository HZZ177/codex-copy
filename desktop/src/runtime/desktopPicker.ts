type OptionalDialogApi = {
  open?: (options: {
    directory?: boolean;
    filters?: Array<{ name: string; extensions: string[] }>;
    multiple?: boolean;
    title?: string;
  }) => Promise<string | string[] | null>;
};

export interface DesktopPickerRuntime {
  isDirectoryPickerAvailable(): boolean;
  isFilePickerAvailable(): boolean;
  pickDirectory(): Promise<string | null>;
  pickFiles(): Promise<string[]>;
  pickImageFiles(): Promise<string[]>;
}

export interface DesktopPickerRuntimeOptions {
  dialogApi?: OptionalDialogApi | null;
  importDialogApi?: () => Promise<OptionalDialogApi | null>;
  getTauriGlobal?: () => unknown;
  isTauriRuntime?: () => boolean;
}

export function createDesktopPickerRuntime(options: DesktopPickerRuntimeOptions = {}): DesktopPickerRuntime {
  return {
    isDirectoryPickerAvailable() {
      return isDialogOpenAvailable(options);
    },
    isFilePickerAvailable() {
      return isDialogOpenAvailable(options);
    },
    async pickDirectory() {
      const dialogApi =
        options.dialogApi ?? resolveGlobalDialogApi(options.getTauriGlobal) ?? (await loadDialogApi(options));
      if (!dialogApi?.open) {
        if (isLikelyTauriRuntime(options)) {
          throw new Error("文件夹选择器不可用：Tauri dialog API 未加载");
        }
        return null;
      }
      const result = await dialogApi.open({
        directory: true,
        multiple: false,
        title: "选择项目文件夹",
      });
      return typeof result === "string" ? result : null;
    },
    async pickFiles() {
      const dialogApi =
        options.dialogApi ?? resolveGlobalDialogApi(options.getTauriGlobal) ?? (await loadDialogApi(options));
      if (!dialogApi?.open) {
        if (isLikelyTauriRuntime(options)) {
          throw new Error("文件选择器不可用：Tauri dialog API 未加载");
        }
        return [];
      }
      const result = await dialogApi.open({
        directory: false,
        multiple: true,
        title: "选择文件",
      });
      return normalizeFilePickerResult(result);
    },
    async pickImageFiles() {
      const dialogApi =
        options.dialogApi ?? resolveGlobalDialogApi(options.getTauriGlobal) ?? (await loadDialogApi(options));
      if (!dialogApi?.open) {
        if (isLikelyTauriRuntime(options)) {
          throw new Error("文件选择器不可用：Tauri dialog API 未加载");
        }
        return [];
      }
      const result = await dialogApi.open({
        directory: false,
        multiple: true,
        title: "选择图片",
        filters: [
          {
            name: "Images",
            extensions: ["png", "jpg", "jpeg", "webp", "gif"],
          },
        ],
      });
      return normalizeFilePickerResult(result);
    },
  };
}

function normalizeFilePickerResult(result: string | string[] | null): string[] {
  if (Array.isArray(result)) {
    return result.filter((item): item is string => typeof item === "string" && Boolean(item.trim()));
  }
  return typeof result === "string" && result.trim() ? [result] : [];
}

function isDialogOpenAvailable(options: DesktopPickerRuntimeOptions): boolean {
  return Boolean(
    options.dialogApi?.open ||
      resolveGlobalDialogApi(options.getTauriGlobal)?.open ||
      isLikelyTauriRuntime(options),
  );
}

async function loadDialogApi(options: DesktopPickerRuntimeOptions): Promise<OptionalDialogApi | null> {
  if (options.importDialogApi) {
    return options.importDialogApi();
  }
  if (!isLikelyTauriRuntime(options)) {
    return null;
  }
  try {
    return await import("@tauri-apps/plugin-dialog");
  } catch {
    return null;
  }
}

function resolveGlobalDialogApi(getTauriGlobal?: () => unknown): OptionalDialogApi | null {
  const value = getTauriGlobal?.() ?? (typeof window !== "undefined" ? (window as unknown as TauriWindow).__TAURI__ : null);
  if (!value || typeof value !== "object") {
    return null;
  }
  const dialog = (value as { dialog?: unknown }).dialog;
  return dialog && typeof dialog === "object" ? (dialog as OptionalDialogApi) : null;
}

function isLikelyTauriRuntime(options: DesktopPickerRuntimeOptions = {}): boolean {
  if (options.isTauriRuntime) {
    return options.isTauriRuntime();
  }
  return typeof window !== "undefined" && ("__TAURI_INTERNALS__" in window || "__TAURI__" in window);
}

type TauriWindow = Window & {
  __TAURI__?: unknown;
};
