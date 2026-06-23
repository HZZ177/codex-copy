import { Folder } from "lucide-react";

import styles from "./RightSidebarInitialPage.module.css";

export interface RightSidebarInitialPageProps {
  canOpenFiles?: boolean;
  onOpenFiles?: () => void;
}

export function RightSidebarInitialPage({ canOpenFiles = false, onOpenFiles }: RightSidebarInitialPageProps) {
  if (!canOpenFiles) {
    return (
      <div className={styles.root} data-testid="right-sidebar-initial-page">
        <span>暂无侧边内容</span>
      </div>
    );
  }

  return (
    <div className={styles.root} data-testid="right-sidebar-initial-page">
      <button className={styles.action} type="button" onClick={onOpenFiles}>
        <Folder size={15} />
        <span>文件</span>
      </button>
    </div>
  );
}
