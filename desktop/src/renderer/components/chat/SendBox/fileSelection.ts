import type { WorkspaceSearchResult } from "@/runtime";

export type SelectedFileSource = "workspace" | "dropped" | "pasted" | "picker";

export interface SelectedFile {
  path: string;
  name: string;
  type: "file" | "directory";
  source: SelectedFileSource;
  selectedText?: string | null;
  annotationComment?: string | null;
  lineStart?: number | null;
  lineEnd?: number | null;
  sourceStart?: number | null;
  sourceEnd?: number | null;
}

export interface FileSelectionState {
  files: SelectedFile[];
  dragging: boolean;
  error: string | null;
}

export type FileSelectionAction =
  | { type: "add"; file: SelectedFile }
  | { type: "remove"; path: string }
  | { type: "dragging"; dragging: boolean }
  | { type: "error"; error: string | null }
  | { type: "clear" };

export const initialFileSelectionState: FileSelectionState = {
  files: [],
  dragging: false,
  error: null,
};

export function fileSelectionReducer(
  state: FileSelectionState,
  action: FileSelectionAction,
): FileSelectionState {
  switch (action.type) {
    case "add":
      if (!action.file.path.trim()) {
        return { ...state, error: "无法添加没有路径的文件" };
      }
      if (state.files.some((file) => file.path === action.file.path)) {
        return { ...state, error: null };
      }
      return { ...state, files: [...state.files, action.file], error: null };
    case "remove":
      return { ...state, files: state.files.filter((file) => file.path !== action.path), error: null };
    case "dragging":
      return { ...state, dragging: action.dragging };
    case "error":
      return { ...state, error: action.error };
    case "clear":
      return initialFileSelectionState;
  }
}

export function selectedFileFromWorkspace(result: WorkspaceSearchResult): SelectedFile {
  return {
    path: result.path,
    name: result.name,
    type: result.type,
    source: "workspace",
  };
}

export function selectedFileFromPath(
  path: string,
  source: SelectedFileSource,
  name?: string | null,
  type: "file" | "directory" = "file",
): SelectedFile | null {
  const cleanedPath = path.trim();
  if (!cleanedPath) {
    return null;
  }
  return {
    path: cleanedPath,
    name: name?.trim() || fileName(cleanedPath),
    type,
    source,
  };
}

export function selectedFileFromFile(file: File, source: Exclude<SelectedFileSource, "workspace">): SelectedFile | null {
  const withPath = file as File & { path?: string };
  const path = withPath.path || "";
  if (!path) {
    return null;
  }
  return selectedFileFromPath(path, source, file.name, "file");
}

export function composeMessageWithSelectedFiles(message: string, files: SelectedFile[]): string {
  return message.trim();
}

function fileName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() || path;
}
