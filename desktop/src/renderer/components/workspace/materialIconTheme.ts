import { useEffect, useMemo, useState } from "react";
import materialIconThemeManifest from "material-icon-theme/dist/material-icons.json";
import fileIconUrl from "material-icon-theme/icons/file.svg?url";
import folderIconUrl from "material-icon-theme/icons/folder.svg?url";

interface MaterialIconThemeManifest {
  file: string;
  fileExtensions: Record<string, string>;
  fileNames: Record<string, string>;
  folder: string;
  folderExpanded: string;
  folderNames: Record<string, string>;
  folderNamesExpanded: Record<string, string>;
  iconDefinitions: Record<string, { iconPath: string }>;
}

const manifest = materialIconThemeManifest as MaterialIconThemeManifest;

const ICON_PATH_PREFIX = "../../../../node_modules/material-icon-theme/icons/";
const FALLBACK_FILE_ICON_KEY = `${ICON_PATH_PREFIX}file.svg`;
const FALLBACK_FOLDER_ICON_KEY = `${ICON_PATH_PREFIX}folder.svg`;
const iconLoaders = import.meta.glob<string>("../../../../node_modules/material-icon-theme/icons/*.svg", {
  import: "default",
  query: "?url",
});
const iconSrcCache = new Map<string, string>([
  [FALLBACK_FILE_ICON_KEY, fileIconUrl],
  [FALLBACK_FOLDER_ICON_KEY, folderIconUrl],
]);

export interface MaterialIconAsset {
  id: string;
  src: string;
}

type MaterialIconEntryType = "file" | "directory";

interface MaterialIconInfo {
  id: string;
  key: string;
  fallbackSrc: string;
}

export function resolveMaterialFileIcon(path: string): MaterialIconAsset {
  return cachedIconAsset(resolveMaterialFileIconInfo(path));
}

export function resolveMaterialFolderIcon(): MaterialIconAsset {
  return cachedIconAsset(resolveMaterialFolderIconInfo());
}

export function useMaterialEntryIcon(path: string, type: MaterialIconEntryType): MaterialIconAsset {
  const info = useMemo(
    () => (type === "directory" ? resolveMaterialFolderIconInfo() : resolveMaterialFileIconInfo(path)),
    [path, type],
  );
  const [asset, setAsset] = useState<MaterialIconAsset>(() => cachedIconAsset(info));

  useEffect(() => {
    let active = true;
    setAsset(cachedIconAsset(info));
    void loadIconSrc(info).then((src) => {
      if (active) {
        setAsset({ id: info.id, src });
      }
    });
    return () => {
      active = false;
    };
  }, [info]);

  return asset;
}

function resolveMaterialFileIconInfo(path: string): MaterialIconInfo {
  const normalizedPath = normalizePath(path);
  const name = basename(normalizedPath);
  const iconId =
    iconFromFileName(normalizedPath) ??
    iconFromFileName(name) ??
    iconFromFileExtension(name) ??
    manifest.file;
  return iconInfo(iconId, fileIconUrl);
}

function resolveMaterialFolderIconInfo(): MaterialIconInfo {
  return iconInfo(manifest.folder, folderIconUrl);
}

function iconFromFileName(path: string): string | undefined {
  return manifest.fileNames[path];
}

function iconFromFileExtension(name: string): string | undefined {
  const parts = name.split(".").filter(Boolean);
  for (let index = 0; index < parts.length; index += 1) {
    const extension = parts.slice(index).join(".");
    const iconId = manifest.fileExtensions[extension];
    if (iconId) {
      return iconId;
    }
  }
  return undefined;
}

function iconInfo(iconId: string, fallbackSrc: string): MaterialIconInfo {
  const resolvedIconId = manifest.iconDefinitions[iconId] ? iconId : manifest.file;
  const definition = manifest.iconDefinitions[resolvedIconId] ?? manifest.iconDefinitions[manifest.file];
  const iconFileName = definition?.iconPath.split(/[\\/]/).pop() ?? "file.svg";
  return {
    id: resolvedIconId,
    key: `${ICON_PATH_PREFIX}${iconFileName}`,
    fallbackSrc,
  };
}

function cachedIconAsset(info: MaterialIconInfo): MaterialIconAsset {
  return {
    id: info.id,
    src: iconSrcCache.get(info.key) ?? info.fallbackSrc,
  };
}

async function loadIconSrc(info: MaterialIconInfo): Promise<string> {
  const cached = iconSrcCache.get(info.key);
  if (cached) {
    return cached;
  }

  const loader = iconLoaders[info.key] ?? iconLoaders[FALLBACK_FILE_ICON_KEY];
  if (!loader) {
    return info.fallbackSrc;
  }

  try {
    const src = await loader();
    iconSrcCache.set(info.key, src);
    return src;
  } catch {
    return info.fallbackSrc;
  }
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").toLowerCase();
}

function basename(path: string): string {
  return path.split("/").filter(Boolean).pop() ?? path;
}
