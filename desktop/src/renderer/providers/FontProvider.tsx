import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { PropsWithChildren } from "react";

import type { AppFontFamily } from "@/types/protocol";
import type { SettingsRuntime } from "@/runtime/settings";
import { useOptionalRuntimeConnection } from "./RuntimeConnectionProvider";

export type { AppFontFamily };
export type FontAssetStatus = "idle" | "downloading" | "ready" | "error";

export interface FontDownloadProgress {
  downloadedAssets: number;
  totalAssets: number;
  downloadedBytes: number;
  totalBytes: number;
  percent: number;
}

export interface FontContextValue {
  family: AppFontFamily;
  status: FontAssetStatus;
  hasMapleMonoCache: boolean;
  progress: FontDownloadProgress;
  error: string | null;
  setFamily(family: AppFontFamily): Promise<void>;
}

interface MapleFontFaceSource {
  id: string;
  directory: string;
  cssUrl: string;
}

interface FontFileDescriptor {
  id: string;
  fileName: string;
  url: string;
}

interface CachedFontFile extends FontFileDescriptor {
  data: ArrayBuffer;
  mimeType: string;
}

interface CachedFontFace extends MapleFontFaceSource {
  css: string;
  files: CachedFontFile[];
}

const FontContext = createContext<FontContextValue | null>(null);

const FONT_STORAGE_KEY = "keydex.font.family.v1";
const FONT_DB_NAME = "keydex-font-cache";
const FONT_STORE_NAME = "assets";
const MAPLE_MONO_CACHE_VERSION = "chinese-fonts-maple-mono-cn-2.0.0-regular-bold-italic";
const MAPLE_MONO_CDN_BASE = "https://cdn.jsdelivr.net/npm/@chinese-fonts/maple-mono-cn@2.0.0/dist";
const MAPLE_MONO_FAMILY = "Maple Mono CN";
const MAPLE_MONO_SANS_STACK = `"${MAPLE_MONO_FAMILY}", var(--font-sans-system)`;
const MAPLE_MONO_READING_STACK = `"${MAPLE_MONO_FAMILY}", var(--font-reading-system)`;
const MAPLE_MONO_MONO_STACK = `"${MAPLE_MONO_FAMILY}", var(--font-mono-system)`;
const FONT_STYLE_ID = "keydex-maple-mono-font-face";
const FONT_DOWNLOAD_CONCURRENCY = 8;

const MAPLE_MONO_FACES: MapleFontFaceSource[] = [
  fontFace("regular", "MapleMono-CN-Regular"),
  fontFace("bold", "MapleMono-CN-Bold"),
  fontFace("italic", "MapleMono-CN-Italic"),
  fontFace("bold-italic", "MapleMono-CN-BoldItalic"),
];
const MAPLE_MONO_TOTAL_ASSETS = 944;
const MAPLE_MONO_TOTAL_BYTES = 36_447_552;
const EMPTY_PROGRESS: FontDownloadProgress = {
  downloadedAssets: 0,
  totalAssets: MAPLE_MONO_TOTAL_ASSETS,
  downloadedBytes: 0,
  totalBytes: MAPLE_MONO_TOTAL_BYTES,
  percent: 0,
};
const COMPLETE_PROGRESS: FontDownloadProgress = {
  downloadedAssets: MAPLE_MONO_TOTAL_ASSETS,
  totalAssets: MAPLE_MONO_TOTAL_ASSETS,
  downloadedBytes: MAPLE_MONO_TOTAL_BYTES,
  totalBytes: MAPLE_MONO_TOTAL_BYTES,
  percent: 100,
};

let activeObjectUrls: string[] = [];

export interface FontProviderProps extends PropsWithChildren {
  settingsRuntime?: SettingsRuntime | null;
}

export function FontProvider({ children, settingsRuntime }: FontProviderProps) {
  const runtimeConnection = useOptionalRuntimeConnection();
  const resolvedSettingsRuntime =
    settingsRuntime === undefined ? (runtimeConnection?.ready ? runtimeConnection.runtime.settings : null) : settingsRuntime;
  const [family, setFamilyState] = useState<AppFontFamily>("system");
  const [status, setStatus] = useState<FontAssetStatus>("idle");
  const [hasMapleMonoCache, setHasMapleMonoCache] = useState(false);
  const [progress, setProgress] = useState<FontDownloadProgress>(EMPTY_PROGRESS);
  const [error, setError] = useState<string | null>(null);

  const applyConfiguredFamily = useCallback(
    async (
      nextFamily: AppFontFamily,
      {
        isActive,
        onDownloadStart,
        onProgress,
        onReady,
        onError,
      }: {
        isActive: () => boolean;
        onDownloadStart?: () => void;
        onProgress?: (progress: FontDownloadProgress) => void;
        onReady?: () => void;
        onError?: (reason: unknown) => void;
      },
    ) => {
      try {
        if (nextFamily === "system") {
          saveFamily("system");
          applySystemFont();
          if (isActive()) {
            setFamilyState("system");
            setStatus("idle");
            onReady?.();
          }
          return;
        }

        await activateMapleMono({
          onDownloadStart() {
            if (isActive()) {
              onDownloadStart?.();
            }
          },
          onProgress(nextProgress) {
            if (isActive()) {
              onProgress?.(nextProgress);
            }
          },
        });
        saveFamily("maple-mono");
        if (isActive()) {
          setFamilyState("maple-mono");
          setHasMapleMonoCache(true);
          setProgress(COMPLETE_PROGRESS);
          setStatus("ready");
          onReady?.();
        }
      } catch (reason) {
        if (isActive()) {
          onError?.(reason);
        }
        throw reason;
      }
    },
    [],
  );

  useEffect(() => {
    let active = true;
    const savedFamily = readSavedFamily();

    if (savedFamily !== "maple-mono") {
      applySystemFont();
      void readCachedMapleMonoFaces()
        .then((faces) => {
          if (active) {
            setHasMapleMonoCache(Boolean(faces));
          }
        })
        .catch(() => {
          if (active) {
            setHasMapleMonoCache(false);
          }
        });
      return () => {
        active = false;
      };
    }

    void activateMapleMono({
      onDownloadStart() {
        if (!active) {
          return;
        }
        setStatus("downloading");
        setProgress(EMPTY_PROGRESS);
      },
      onProgress(nextProgress) {
        if (active) {
          setProgress(nextProgress);
        }
      },
    })
      .then(() => {
        if (!active) {
          return;
        }
        setFamilyState("maple-mono");
        setHasMapleMonoCache(true);
        setProgress(COMPLETE_PROGRESS);
        setStatus("ready");
      })
      .catch((reason: unknown) => {
        if (!active) {
          return;
        }
        saveFamily("system");
        applySystemFont();
        setFamilyState("system");
        setHasMapleMonoCache(false);
        setStatus("error");
        setError(errorMessage(reason));
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!resolvedSettingsRuntime) {
      return;
    }

    let active = true;
    void resolvedSettingsRuntime
      .getSettings()
      .then((settings) => {
        if (!active) {
          return;
        }
        const configuredFamily = normalizeFamily(settings.appearance?.font_family);
        if (!configuredFamily) {
          return;
        }
        void applyConfiguredFamily(configuredFamily, {
          isActive: () => active,
          onDownloadStart() {
            setStatus("downloading");
            setProgress(EMPTY_PROGRESS);
          },
          onProgress: setProgress,
          onReady() {
            setError(null);
          },
          onError(reason) {
            setStatus("error");
            setError(errorMessage(reason));
          },
        });
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, [applyConfiguredFamily, resolvedSettingsRuntime]);

  const setFamily = useCallback(async (nextFamily: AppFontFamily) => {
    setError(null);

    try {
      await applyConfiguredFamily(nextFamily, {
        isActive: () => true,
        onDownloadStart() {
          setStatus("downloading");
          setProgress(EMPTY_PROGRESS);
        },
        onProgress: setProgress,
      });
      await resolvedSettingsRuntime?.saveAppearanceSettings({ font_family: nextFamily });
    } catch (reason) {
      setStatus("error");
      setError(errorMessage(reason));
      throw reason;
    }
  }, [applyConfiguredFamily, resolvedSettingsRuntime]);

  const value = useMemo<FontContextValue>(
    () => ({
      family,
      status,
      hasMapleMonoCache,
      progress,
      error,
      setFamily,
    }),
    [error, family, hasMapleMonoCache, progress, setFamily, status],
  );

  return <FontContext.Provider value={value}>{children}</FontContext.Provider>;
}

export function useFontPreference() {
  const value = useContext(FontContext);
  if (!value) {
    throw new Error("useFontPreference must be used within FontProvider");
  }
  return value;
}

function fontFace(id: string, directory: string): MapleFontFaceSource {
  return {
    id,
    directory,
    cssUrl: `${MAPLE_MONO_CDN_BASE}/${directory}/result.css`,
  };
}

function readSavedFamily(): AppFontFamily {
  try {
    const savedFamily = localStorage.getItem(FONT_STORAGE_KEY);
    const normalizedFamily = normalizeFamily(savedFamily);
    if (normalizedFamily) {
      return normalizedFamily;
    }
    if (savedFamily) {
      localStorage.setItem(FONT_STORAGE_KEY, "system");
    }
    return "system";
  } catch {
    return "system";
  }
}

function normalizeFamily(value: unknown): AppFontFamily | null {
  return value === "maple-mono" || value === "system" ? value : null;
}

function saveFamily(family: AppFontFamily) {
  try {
    localStorage.setItem(FONT_STORAGE_KEY, family);
  } catch {
    // Keep the runtime selection active even if storage is unavailable.
  }
}

function applySystemFont() {
  document.documentElement.style.removeProperty("--font-sans");
  document.documentElement.style.removeProperty("--font-reading");
  document.documentElement.style.removeProperty("--font-mono");
}

function applyMapleMonoFont() {
  document.documentElement.style.setProperty("--font-sans", MAPLE_MONO_SANS_STACK);
  document.documentElement.style.setProperty("--font-reading", MAPLE_MONO_READING_STACK);
  document.documentElement.style.setProperty("--font-mono", MAPLE_MONO_MONO_STACK);
}

async function activateMapleMono({
  onDownloadStart,
  onProgress,
}: {
  onDownloadStart?: () => void;
  onProgress?: (progress: FontDownloadProgress) => void;
} = {}): Promise<void> {
  let faces = await readCachedMapleMonoFaces();
  if (!faces) {
    onDownloadStart?.();
    faces = await downloadAndCacheMapleMonoFaces(onProgress);
  }
  registerMapleMonoFaces(faces);
  applyMapleMonoFont();
}

async function downloadAndCacheMapleMonoFaces(
  onProgress?: (progress: FontDownloadProgress) => void,
): Promise<CachedFontFace[]> {
  const completedAssetIds = new Set<string>();
  const downloadedBytesByAsset = new Map<string, number>();
  const reportProgress = () => {
    const downloadedBytes = Array.from(downloadedBytesByAsset.values()).reduce((sum, value) => sum + value, 0);
    onProgress?.(
      buildProgress({
        downloadedAssets: completedAssetIds.size,
        totalAssets: MAPLE_MONO_TOTAL_ASSETS,
        downloadedBytes,
        totalBytes: MAPLE_MONO_TOTAL_BYTES,
      }),
    );
  };
  const setAssetBytes = (assetId: string, bytes: number) => {
    downloadedBytesByAsset.set(assetId, bytes);
    reportProgress();
  };
  const completeAsset = (assetId: string, bytes: number) => {
    completedAssetIds.add(assetId);
    downloadedBytesByAsset.set(assetId, bytes);
    reportProgress();
  };

  reportProgress();

  const cachedFaces: CachedFontFace[] = [];
  for (const face of MAPLE_MONO_FACES) {
    const cssResponse = await fetchFontAsset(face.cssUrl);
    const css = await readResponseText(cssResponse);
    const cssAssetId = `${face.id}:result.css`;
    completeAsset(cssAssetId, byteLength(css));

    const descriptors = parseFontFileDescriptors(face, css);
    const files = await downloadFontFiles(descriptors, setAssetBytes, completeAsset);
    cachedFaces.push({ ...face, css, files });
  }

  await writeCachedMapleMonoFaces(cachedFaces);
  return cachedFaces;
}

async function downloadFontFiles(
  descriptors: FontFileDescriptor[],
  onAssetBytes: (assetId: string, bytes: number) => void,
  onAssetComplete: (assetId: string, bytes: number) => void,
): Promise<CachedFontFile[]> {
  const files = new Array<CachedFontFile>(descriptors.length);
  let nextIndex = 0;
  const workerCount = Math.min(FONT_DOWNLOAD_CONCURRENCY, descriptors.length);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (true) {
        const index = nextIndex;
        nextIndex += 1;
        if (index >= descriptors.length) {
          break;
        }

        const descriptor = descriptors[index];
        const response = await fetchFontAsset(descriptor.url);
        const data = await readResponseData(response, (bytes) => onAssetBytes(descriptor.id, bytes));
        onAssetComplete(descriptor.id, data.byteLength);
        files[index] = {
          ...descriptor,
          data,
          mimeType: response.headers.get("content-type") ?? "font/woff2",
        };
      }
    }),
  );

  return files;
}

function parseFontFileDescriptors(face: MapleFontFaceSource, css: string): FontFileDescriptor[] {
  const matches = Array.from(css.matchAll(/url\("\.\/([^"]+\.woff2)"\)/g));
  if (matches.length === 0) {
    throw new Error("Maple Mono CN 字体清单为空");
  }
  return matches.map((match) => {
    const fileName = match[1];
    return {
      id: `${face.id}:${fileName}`,
      fileName,
      url: `${MAPLE_MONO_CDN_BASE}/${face.directory}/${fileName}`,
    };
  });
}

async function fetchFontAsset(url: string): Promise<Response> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Maple Mono CN 下载失败：${response.status}`);
  }
  return response;
}

async function readCachedMapleMonoFaces(): Promise<CachedFontFace[] | null> {
  const db = await openFontDb();
  const cached = await Promise.all(MAPLE_MONO_FACES.map((face) => readCachedFace(db, cacheKey(face.id))));
  db.close();
  if (cached.some((face): face is null => face === null)) {
    return null;
  }
  return cached as CachedFontFace[];
}

async function writeCachedMapleMonoFaces(faces: CachedFontFace[]): Promise<void> {
  const db = await openFontDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(FONT_STORE_NAME, "readwrite");
    const store = transaction.objectStore(FONT_STORE_NAME);
    faces.forEach((face) => store.put(face, cacheKey(face.id)));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("字体缓存写入失败"));
  });
  db.close();
}

function readCachedFace(db: IDBDatabase, key: string): Promise<CachedFontFace | null> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(FONT_STORE_NAME, "readonly");
    const request = transaction.objectStore(FONT_STORE_NAME).get(key);
    request.onsuccess = () => resolve((request.result as CachedFontFace | undefined) ?? null);
    request.onerror = () => reject(request.error ?? new Error("字体缓存读取失败"));
  });
}

function openFontDb(): Promise<IDBDatabase> {
  if (!("indexedDB" in window)) {
    return Promise.reject(new Error("当前环境不支持本地字体缓存"));
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(FONT_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(FONT_STORE_NAME)) {
        db.createObjectStore(FONT_STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("字体缓存打开失败"));
  });
}

function registerMapleMonoFaces(faces: CachedFontFace[]) {
  activeObjectUrls.forEach((url) => URL.revokeObjectURL(url));
  activeObjectUrls = [];

  const styleElement = getFontStyleElement();
  styleElement.textContent = faces.map((face) => buildCachedFaceCss(face)).join("\n");
}

function buildCachedFaceCss(face: CachedFontFace): string {
  const objectUrlsByFileName = new Map<string, string>();
  face.files.forEach((file) => {
    const objectUrl = URL.createObjectURL(new Blob([file.data], { type: file.mimeType }));
    activeObjectUrls.push(objectUrl);
    objectUrlsByFileName.set(file.fileName, objectUrl);
  });

  return face.css
    .replaceAll(`src:local("${MAPLE_MONO_FAMILY}"),url`, "src:url")
    .replace(/url\("\.\/([^"]+\.woff2)"\)/g, (match, fileName: string) => {
      const objectUrl = objectUrlsByFileName.get(fileName);
      return objectUrl ? `url("${objectUrl}")` : match;
    });
}

function getFontStyleElement(): HTMLStyleElement {
  const existing = document.getElementById(FONT_STYLE_ID);
  if (existing instanceof HTMLStyleElement) {
    return existing;
  }
  const styleElement = document.createElement("style");
  styleElement.id = FONT_STYLE_ID;
  document.head.append(styleElement);
  return styleElement;
}

function cacheKey(id: string): string {
  return `${MAPLE_MONO_CACHE_VERSION}:${id}`;
}

async function readResponseText(response: Response): Promise<string> {
  return response.text();
}

async function readResponseData(response: Response, onBytes: (bytes: number) => void): Promise<ArrayBuffer> {
  const reader = response.body?.getReader();
  if (!reader) {
    const data = await response.arrayBuffer();
    onBytes(data.byteLength);
    return data;
  }

  const chunks: Uint8Array[] = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    if (!value) {
      continue;
    }
    chunks.push(value);
    received += value.byteLength;
    onBytes(received);
  }
  return concatChunks(chunks, received);
}

function concatChunks(chunks: Uint8Array[], byteLength: number): ArrayBuffer {
  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  chunks.forEach((chunk) => {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  });
  return bytes.buffer;
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function buildProgress({
  downloadedAssets,
  totalAssets,
  downloadedBytes,
  totalBytes,
}: Omit<FontDownloadProgress, "percent">): FontDownloadProgress {
  const safeDownloadedBytes = Math.min(downloadedBytes, totalBytes);
  return {
    downloadedAssets: Math.min(downloadedAssets, totalAssets),
    totalAssets,
    downloadedBytes: safeDownloadedBytes,
    totalBytes,
    percent: totalBytes > 0 ? Math.round((safeDownloadedBytes / totalBytes) * 100) : 0,
  };
}

function errorMessage(reason: unknown): string {
  if (reason instanceof Error && reason.message) {
    return reason.message;
  }
  return "字体下载失败";
}
