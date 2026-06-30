import type { SelectedFile } from "@/renderer/components/chat/SendBox";

export const APP_ADD_WORKSPACE_FILE_TO_CHAT_EVENT = "keydex:add-workspace-file-to-chat";

export interface AddWorkspaceFileToChatDetail {
  absolutePath?: string | null;
  file: SelectedFile;
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

export function subscribeAddWorkspaceFileToChat(
  listener: (detail: AddWorkspaceFileToChatDetail) => void,
): () => void {
  const handleEvent = (event: Event) => {
    listener((event as CustomEvent<AddWorkspaceFileToChatDetail>).detail);
  };
  document.addEventListener(APP_ADD_WORKSPACE_FILE_TO_CHAT_EVENT, handleEvent);
  return () => document.removeEventListener(APP_ADD_WORKSPACE_FILE_TO_CHAT_EVENT, handleEvent);
}
