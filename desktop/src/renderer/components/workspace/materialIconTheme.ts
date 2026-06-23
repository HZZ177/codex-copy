import materialIconThemeManifest from "material-icon-theme/dist/material-icons.json";

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
const iconUrls = import.meta.glob("../../../../node_modules/material-icon-theme/icons/*.svg", {
  eager: true,
  import: "default",
  query: "?url",
}) as Record<string, string>;

export interface MaterialIconAsset {
  id: string;
  src: string;
}

export function resolveMaterialFileIcon(path: string): MaterialIconAsset {
  const normalizedPath = normalizePath(path);
  const name = basename(normalizedPath);
  const iconId =
    iconFromFileName(normalizedPath) ??
    iconFromFileName(name) ??
    iconFromFileExtension(name) ??
    manifest.file;
  return iconAsset(iconId);
}

export function resolveMaterialFolderIcon(): MaterialIconAsset {
  return iconAsset(manifest.folder);
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

function iconAsset(iconId: string): MaterialIconAsset {
  const definition = manifest.iconDefinitions[iconId] ?? manifest.iconDefinitions[manifest.file];
  const iconFileName = definition?.iconPath.split(/[\\/]/).pop() ?? "file.svg";
  const src = iconUrls[`../../../../node_modules/material-icon-theme/icons/${iconFileName}`];
  return {
    id: iconId,
    src: src ?? iconUrls["../../../../node_modules/material-icon-theme/icons/file.svg"] ?? "",
  };
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").toLowerCase();
}

function basename(path: string): string {
  return path.split("/").filter(Boolean).pop() ?? path;
}
