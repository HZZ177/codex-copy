import { FolderOpen, MessageSquare } from "lucide-react";

import styles from "./RightSidebarInitialPage.module.css";

export interface RightSidebarInitialPageProps {
  canOpenFiles?: boolean;
  canOpenBtwConversation?: boolean;
  onOpenFiles?: () => void;
  onOpenBtwConversation?: () => void;
}

export function RightSidebarInitialPage({
  canOpenFiles = false,
  canOpenBtwConversation = false,
  onOpenFiles,
  onOpenBtwConversation,
}: RightSidebarInitialPageProps) {
  if (!canOpenFiles && !canOpenBtwConversation) {
    return (
      <div className={styles.root} data-testid="right-sidebar-initial-page">
        <span>暂无侧边内容</span>
      </div>
    );
  }

  return (
    <div className={styles.root} data-testid="right-sidebar-initial-page">
      {canOpenBtwConversation ? (
        <button className={styles.action} type="button" onClick={onOpenBtwConversation}>
          <MessageSquare size={14} strokeWidth={1.9} />
          <span>旁路对话</span>
        </button>
      ) : null}
      {canOpenFiles ? (
        <button className={styles.action} type="button" onClick={onOpenFiles}>
          <FolderOpen size={14} strokeWidth={1.9} />
          <span>文件</span>
        </button>
      ) : null}
    </div>
  );
}
