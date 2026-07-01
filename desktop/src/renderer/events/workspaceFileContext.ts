import type { SelectedFile } from "@/renderer/components/chat/SendBox";

export const APP_ADD_WORKSPACE_FILE_TO_CHAT_EVENT = "keydex:add-workspace-file-to-chat";
export const APP_EXPAND_WORKSPACE_DIRECTORY_EVENT = "keydex:expand-workspace-directory";

export interface AddWorkspaceFileToChatDetail {
  absolutePath?: string | null;
  file: SelectedFile;
  sessionId?: string | null;
  workspaceId?: string | null;
  workspaceRoot?: string | null;
}

export interface ExpandWorkspaceDirectoryDetail {
  path: string;
  sessionId?: string | null;
  workspaceId?: string | null;
  workspaceRoot?: string | null;
}

export function emitAddWorkspaceFileToChat(detail: AddWorkspaceFileToChatDetail): void {
  document.dispatchEvent(
    new CustomEvent<AddWorkspaceFileToChatDetail>(APP_ADD_WORKSPACE_FILE_TO_CHAT_EVENT, {
      detail,
    }),
  );
}

export function emitExpandWorkspaceDirectory(detail: ExpandWorkspaceDirectoryDetail): void {
  document.dispatchEvent(
    new CustomEvent<ExpandWorkspaceDirectoryDetail>(APP_EXPAND_WORKSPACE_DIRECTORY_EVENT, {
      detail,
    }),
  );
}

export function subscribeAddWorkspaceFileToChat(
  listener: (detail: AddWorkspaceFileToChatDetail) => void,
): () => void {
  const handleEvent = (event: Event) => {
    listener((event as CustomEvent<AddWorkspaceFileToChatDetail>).detail);
  };
  document.addEventListener(APP_ADD_WORKSPACE_FILE_TO_CHAT_EVENT, handleEvent);
  return () => document.removeEventListener(APP_ADD_WORKSPACE_FILE_TO_CHAT_EVENT, handleEvent);
}

export function subscribeExpandWorkspaceDirectory(
  listener: (detail: ExpandWorkspaceDirectoryDetail) => void,
): () => void {
  const handleEvent = (event: Event) => {
    listener((event as CustomEvent<ExpandWorkspaceDirectoryDetail>).detail);
  };
  document.addEventListener(APP_EXPAND_WORKSPACE_DIRECTORY_EVENT, handleEvent);
  return () => document.removeEventListener(APP_EXPAND_WORKSPACE_DIRECTORY_EVENT, handleEvent);
}
