import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import type { MouseEvent } from "react";
import { useMemo } from "react";

import styles from "./Titlebar.module.css";
import { createWindowControls } from "./windowControls";
import type { WindowControls } from "./windowControls";

export interface TitlebarProps {
  title: string;
  sidebarCollapsed: boolean;
  onToggleSidebar(): void;
  windowControls?: WindowControls;
}

export function Titlebar({
  title,
  sidebarCollapsed,
  onToggleSidebar,
  windowControls,
}: TitlebarProps) {
  const controls = useMemo(() => windowControls ?? createWindowControls(), [windowControls]);

  const handleDrag = (event: MouseEvent<HTMLElement>) => {
    if (event.button !== 0) {
      return;
    }
    void controls.startDragging();
  };

  const handleDoubleClick = () => {
    void controls.toggleMaximize();
  };

  return (
    <header className={styles.titlebar} data-testid="titlebar">
      <div className={styles.left}>
        <button
          className={`${styles.iconButton} ${styles.sidebarToggle}`}
          data-state={sidebarCollapsed ? "collapsed" : "expanded"}
          data-icon={sidebarCollapsed ? "panel-left-open" : "panel-left-close"}
          type="button"
          aria-label={sidebarCollapsed ? "展开侧边栏" : "折叠侧边栏"}
          onClick={onToggleSidebar}
        >
          {sidebarCollapsed ? (
            <PanelLeftOpen size={17} strokeWidth={2.1} />
          ) : (
            <PanelLeftClose size={17} strokeWidth={2.1} />
          )}
        </button>
        <div className={styles.navGhost} aria-hidden="true">
          <span />
          <span />
        </div>
      </div>

      <div
        className={styles.dragRegion}
        data-tauri-drag-region
        onMouseDown={handleDrag}
        onDoubleClick={handleDoubleClick}
      >
        <div className={styles.title}>{title}</div>
      </div>

      <div className={styles.right} />
    </header>
  );
}
