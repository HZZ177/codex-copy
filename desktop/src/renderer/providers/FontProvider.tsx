import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { PropsWithChildren } from "react";

import type { AppFontFamily } from "@/types/protocol";
import type { SettingsRuntime } from "@/runtime/settings";
import { useOptionalRuntimeConnection } from "./RuntimeConnectionProvider";

export type { AppFontFamily };
export type FontAssetStatus = "idle" | "downloading" | "ready" | "error";
type FontAssetFamily = Exclude<AppFontFamily, "system">;

export interface FontDownloadProgress {
  downloadedAssets: number;
  totalAssets: number;
  downloadedBytes: number;
  totalBytes: number;
  percent: number;
}

export interface FontContextValue {
  family: AppFontFamily;
  downloadingFamily: FontAssetFamily | null;
  status: FontAssetStatus;
  cachedFamilies: Partial<Record<AppFontFamily, boolean>>;
  progress: FontDownloadProgress;
  error: string | null;
  setFamily(family: AppFontFamily): Promise<void>;
}

interface FontFaceSource {
  id: string;
  cssUrl: string;
  assetBaseUrl: string;
}

interface FontDefinition {
  id: FontAssetFamily;
  displayName: string;
  cacheVersion: string;
  faces: FontFaceSource[];
  totalAssets: number;
  totalBytes: number;
  sansStack: string;
  readingStack: string;
  monoStack: string;
  removeLocalSource?: string;
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

interface CachedFontFace extends FontFaceSource {
  css: string;
  files: CachedFontFile[];
}

type FontFamilyCacheState = Partial<Record<AppFontFamily, boolean>>;

const FontContext = createContext<FontContextValue | null>(null);

const FONT_STORAGE_KEY = "keydex.font.family.v1";
const FONT_DB_NAME = "keydex-font-cache";
const FONT_STORE_NAME = "assets";
const MAPLE_MONO_CDN_BASE = "https://cdn.jsdelivr.net/npm/@chinese-fonts/maple-mono-cn@2.0.0/dist";
const MAPLE_MONO_FAMILY = "Maple Mono CN";
const FONT_STYLE_ID = "keydex-custom-font-face";
const FONT_DOWNLOAD_CONCURRENCY = 8;

const FONT_DEFINITIONS: Record<FontAssetFamily, FontDefinition> = {
  "maple-mono": {
    id: "maple-mono",
    displayName: "Maple Mono CN",
    cacheVersion: "chinese-fonts-maple-mono-cn-2.0.0-regular-bold-italic",
    faces: [
      fontFace("regular", `${MAPLE_MONO_CDN_BASE}/MapleMono-CN-Regular`, "result.css"),
      fontFace("bold", `${MAPLE_MONO_CDN_BASE}/MapleMono-CN-Bold`, "result.css"),
      fontFace("italic", `${MAPLE_MONO_CDN_BASE}/MapleMono-CN-Italic`, "result.css"),
      fontFace("bold-italic", `${MAPLE_MONO_CDN_BASE}/MapleMono-CN-BoldItalic`, "result.css"),
    ],
    totalAssets: 944,
    totalBytes: 36_447_552,
    sansStack: `"${MAPLE_MONO_FAMILY}", var(--font-sans-system)`,
    readingStack: `"${MAPLE_MONO_FAMILY}", var(--font-reading-system)`,
    monoStack: `"${MAPLE_MONO_FAMILY}", var(--font-mono-system)`,
    removeLocalSource: `src:local("${MAPLE_MONO_FAMILY}"),url`,
  },
};
const FONT_ASSET_FAMILIES = Object.keys(FONT_DEFINITIONS) as FontAssetFamily[];
const DEFAULT_PROGRESS = emptyProgress(FONT_DEFINITIONS["maple-mono"]);

let activeObjectUrls: string[] = [];

export interface FontProviderProps extends PropsWithChildren {
  settingsRuntime?: SettingsRuntime | null;
}

export function FontProvider({ children, settingsRuntime }: FontProviderProps) {
  const runtimeConnection = useOptionalRuntimeConnection();
  const resolvedSettingsRuntime =
    settingsRuntime === undefined ? (runtimeConnection?.ready ? runtimeConnection.runtime.settings : null) : settingsRuntime;
  const [family, setFamilyState] = useState<AppFontFamily>("system");
  const [downloadingFamily, setDownloadingFamily] = useState<FontAssetFamily | null>(null);
  const [status, setStatus] = useState<FontAssetStatus>("idle");
  const [cachedFamilies, setCachedFamilies] = useState<FontFamilyCacheState>({});
  const [progress, setProgress] = useState<FontDownloadProgress>(DEFAULT_PROGRESS);
  const [error, setError] = useState<string | null>(null);

  const setCachedFamily = useCallback((fontFamily: FontAssetFamily, cached: boolean) => {
    setCachedFamilies((previous) => ({ ...previous, [fontFamily]: cached }));
  }, []);

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
        onDownloadStart?: (definition: FontDefinition) => void;
        onProgress?: (progress: FontDownloadProgress) => void;
        onReady?: () => void;
        onError?: (reason: unknown) => void;
      },
    ) => {
      try {
        const definition = getFontDefinition(nextFamily);
        if (!definition) {
          saveFamily("system");
          applySystemFont();
          if (isActive()) {
            setFamilyState("system");
            setDownloadingFamily(null);
            setStatus("idle");
            onReady?.();
          }
          return;
        }

        await activateFont(definition, {
          onDownloadStart() {
            if (isActive()) {
              onDownloadStart?.(definition);
            }
          },
          onProgress(nextProgress) {
            if (isActive()) {
              onProgress?.(nextProgress);
            }
          },
        });
        saveFamily(definition.id);
        if (isActive()) {
          setFamilyState(definition.id);
          setCachedFamily(definition.id, true);
          setProgress(completeProgress(definition));
          setDownloadingFamily(null);
          setStatus("ready");
          onReady?.();
        }
      } catch (reason) {
        if (isActive()) {
          setDownloadingFamily(null);
          onError?.(reason);
        }
        throw reason;
      }
    },
    [setCachedFamily],
  );

  useEffect(() => {
    let active = true;
    const savedFamily = readSavedFamily();
    const savedDefinition = getFontDefinition(savedFamily);

    void readCachedFontFamilies()
      .then((nextCachedFamilies) => {
        if (active) {
          setCachedFamilies(nextCachedFamilies);
        }
      })
      .catch(() => undefined);

    if (!savedDefinition) {
      applySystemFont();
      return () => {
        active = false;
      };
    }

    void activateFont(savedDefinition, {
      onDownloadStart() {
        if (!active) {
          return;
        }
        setStatus("downloading");
        setDownloadingFamily(savedDefinition.id);
        setProgress(emptyProgress(savedDefinition));
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
        setFamilyState(savedDefinition.id);
        setCachedFamily(savedDefinition.id, true);
        setProgress(completeProgress(savedDefinition));
        setDownloadingFamily(null);
        setStatus("ready");
      })
      .catch((reason: unknown) => {
        if (!active) {
          return;
        }
        saveFamily("system");
        applySystemFont();
        setFamilyState("system");
        setCachedFamily(savedDefinition.id, false);
        setDownloadingFamily(null);
        setStatus("error");
        setError(errorMessage(reason));
      });

    return () => {
      active = false;
    };
  }, [setCachedFamily]);

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
          onDownloadStart(definition) {
            setStatus("downloading");
            setDownloadingFamily(definition.id);
            setProgress(emptyProgress(definition));
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
        onDownloadStart(definition) {
          setStatus("downloading");
          setDownloadingFamily(definition.id);
          setProgress(emptyProgress(definition));
        },
        onProgress: setProgress,
      });
      await resolvedSettingsRuntime?.saveAppearanceSettings({ font_family: nextFamily });
    } catch (reason) {
      setDownloadingFamily(null);
      setStatus("error");
      setError(errorMessage(reason));
      throw reason;
    }
  }, [applyConfiguredFamily, resolvedSettingsRuntime]);

  const value = useMemo<FontContextValue>(
    () => ({
      family,
      downloadingFamily,
      status,
      cachedFamilies,
      progress,
      error,
      setFamily,
    }),
    [cachedFamilies, downloadingFamily, error, family, progress, setFamily, status],
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

function fontFace(id: string, assetBaseUrl: string, cssFile: string): FontFaceSource {
  return {
    id,
    assetBaseUrl,
    cssUrl: `${assetBaseUrl}/${cssFile}`,
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
  return value === "system" || getFontDefinition(value) ? value as AppFontFamily : null;
}

function getFontDefinition(value: unknown): FontDefinition | null {
  return typeof value === "string" && value in FONT_DEFINITIONS
    ? FONT_DEFINITIONS[value as FontAssetFamily]
    : null;
}

function saveFamily(fontFamily: AppFontFamily) {
  try {
    localStorage.setItem(FONT_STORAGE_KEY, fontFamily);
  } catch {
    // Keep the runtime selection active even if storage is unavailable.
  }
}

function applySystemFont() {
  document.documentElement.style.removeProperty("--font-sans");
  document.documentElement.style.removeProperty("--font-reading");
  document.documentElement.style.removeProperty("--font-mono");
}

function applyCustomFont(definition: FontDefinition) {
  document.documentElement.style.setProperty("--font-sans", definition.sansStack);
  document.documentElement.style.setProperty("--font-reading", definition.readingStack);
  document.documentElement.style.setProperty("--font-mono", definition.monoStack);
}

async function activateFont(
  definition: FontDefinition,
  {
    onDownloadStart,
    onProgress,
  }: {
    onDownloadStart?: () => void;
    onProgress?: (progress: FontDownloadProgress) => void;
  } = {},
): Promise<void> {
  let faces = await readCachedFontFaces(definition);
  if (!faces) {
    onDownloadStart?.();
    faces = await downloadAndCacheFontFaces(definition, onProgress);
  }
  registerFontFaces(definition, faces);
  applyCustomFont(definition);
}

async function downloadAndCacheFontFaces(
  definition: FontDefinition,
  onProgress?: (progress: FontDownloadProgress) => void,
): Promise<CachedFontFace[]> {
  const completedAssetIds = new Set<string>();
  const downloadedBytesByAsset = new Map<string, number>();
  const reportProgress = () => {
    const downloadedBytes = Array.from(downloadedBytesByAsset.values()).reduce((sum, value) => sum + value, 0);
    onProgress?.(
      buildProgress({
        downloadedAssets: completedAssetIds.size,
        totalAssets: definition.totalAssets,
        downloadedBytes,
        totalBytes: definition.totalBytes,
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
  for (const face of definition.faces) {
    const cssResponse = await fetchFontAsset(definition, face.cssUrl);
    const css = await readResponseText(cssResponse);
    const cssAssetId = `${face.id}:css`;
    completeAsset(cssAssetId, byteLength(css));

    const descriptors = parseFontFileDescriptors(definition, face, css);
    const files = await downloadFontFiles(definition, descriptors, setAssetBytes, completeAsset);
    cachedFaces.push({ ...face, css, files });
  }

  await writeCachedFontFaces(definition, cachedFaces);
  return cachedFaces;
}

async function downloadFontFiles(
  definition: FontDefinition,
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
        const response = await fetchFontAsset(definition, descriptor.url);
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

function parseFontFileDescriptors(
  definition: FontDefinition,
  face: FontFaceSource,
  css: string,
): FontFileDescriptor[] {
  const matches = Array.from(css.matchAll(/url\((["']?)(?:\.\/)?([^"')]+\.woff2)\1\)/g));
  if (matches.length === 0) {
    throw new Error(`${definition.displayName} 字体清单为空`);
  }
  return matches.map((match) => {
    const fileName = match[2];
    return {
      id: `${face.id}:${fileName}`,
      fileName,
      url: `${face.assetBaseUrl}/${fileName}`,
    };
  });
}

async function fetchFontAsset(definition: FontDefinition, url: string): Promise<Response> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${definition.displayName} 下载失败：${response.status}`);
  }
  return response;
}

async function readCachedFontFamilies(): Promise<FontFamilyCacheState> {
  const entries = await Promise.all(
    FONT_ASSET_FAMILIES.map(async (fontFamily) => {
      const faces = await readCachedFontFaces(FONT_DEFINITIONS[fontFamily]);
      return [fontFamily, Boolean(faces)] as const;
    }),
  );
  return Object.fromEntries(entries);
}

async function readCachedFontFaces(definition: FontDefinition): Promise<CachedFontFace[] | null> {
  const db = await openFontDb();
  try {
    const cached = await Promise.all(
      definition.faces.map((face) => readCachedFace(db, cacheKey(definition, face.id))),
    );
    if (cached.some((face): face is null => face === null)) {
      return null;
    }
    return cached as CachedFontFace[];
  } finally {
    db.close();
  }
}

async function writeCachedFontFaces(definition: FontDefinition, faces: CachedFontFace[]): Promise<void> {
  const db = await openFontDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(FONT_STORE_NAME, "readwrite");
    const store = transaction.objectStore(FONT_STORE_NAME);
    faces.forEach((face) => store.put(face, cacheKey(definition, face.id)));
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

function registerFontFaces(definition: FontDefinition, faces: CachedFontFace[]) {
  activeObjectUrls.forEach((url) => URL.revokeObjectURL(url));
  activeObjectUrls = [];

  const styleElement = getFontStyleElement();
  styleElement.textContent = faces.map((face) => buildCachedFaceCss(definition, face)).join("\n");
}

function buildCachedFaceCss(definition: FontDefinition, face: CachedFontFace): string {
  const objectUrlsByFileName = new Map<string, string>();
  face.files.forEach((file) => {
    const objectUrl = URL.createObjectURL(new Blob([file.data], { type: file.mimeType }));
    activeObjectUrls.push(objectUrl);
    objectUrlsByFileName.set(file.fileName, objectUrl);
  });

  const css = definition.removeLocalSource
    ? face.css.replaceAll(definition.removeLocalSource, "src:url")
    : face.css;
  return css.replace(/url\((["']?)(?:\.\/)?([^"')]+\.woff2)\1\)/g, (match, _quote: string, fileName: string) => {
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

function cacheKey(definition: FontDefinition, id: string): string {
  return `${definition.cacheVersion}:${id}`;
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

function emptyProgress(definition: FontDefinition): FontDownloadProgress {
  return buildProgress({
    downloadedAssets: 0,
    totalAssets: definition.totalAssets,
    downloadedBytes: 0,
    totalBytes: definition.totalBytes,
  });
}

function completeProgress(definition: FontDefinition): FontDownloadProgress {
  return buildProgress({
    downloadedAssets: definition.totalAssets,
    totalAssets: definition.totalAssets,
    downloadedBytes: definition.totalBytes,
    totalBytes: definition.totalBytes,
  });
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
