import { Check, Copy, MoreHorizontal, SendHorizontal } from "lucide-react";
import { type PropsWithChildren, type ReactNode, useEffect, useRef, useState } from "react";

import styles from "./ChatLayout.module.css";

export interface ChatLayoutProps extends PropsWithChildren {
  title: string;
  subtitle?: string;
  composer?: ReactNode;
  composerAccessory?: ReactNode;
}

export function ChatLayout({
  title,
  subtitle,
  children,
  composer,
  composerAccessory,
}: ChatLayoutProps) {
  const layoutRef = useRef<HTMLElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [titleCopied, setTitleCopied] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    };

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [menuOpen]);

  const copyTitle = async () => {
    try {
      await navigator.clipboard?.writeText(title);
      setTitleCopied(true);
      window.setTimeout(() => setTitleCopied(false), 1200);
    } catch {
      setTitleCopied(false);
    }
  };

  return (
    <main ref={layoutRef} className={styles.chatLayout} data-testid="chat-layout">
      <div className={styles.topBar}>
        <div className={styles.topBarInner}>
          <div className={styles.titleMenuAnchor} ref={menuRef}>
            <h1 className={styles.title}>{title}</h1>
            <button
              className={styles.moreButton}
              type="button"
              aria-label="更多对话操作"
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              onClick={() => setMenuOpen((open) => !open)}
            >
              <MoreHorizontal size={16} />
            </button>

            {menuOpen ? (
              <div className={styles.menu} role="menu" aria-label="对话操作菜单">
                {subtitle ? <div className={styles.menuStatus}>{subtitle}</div> : null}
                {subtitle ? <div className={styles.menuDivider} /> : null}
                <button className={styles.menuItem} type="button" role="menuitem" onClick={() => void copyTitle()}>
                  {titleCopied ? <Check size={15} /> : <Copy size={15} />}
                  <span>{titleCopied ? "已复制标题" : "复制标题"}</span>
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <section className={styles.document} data-testid="chat-reading-column" aria-label="对话内容">
        <div className={styles.messageSurface} data-testid="message-surface">
          {children}
        </div>
      </section>

      <div className={styles.composerDock} data-testid="conversation-composer">
        {composerAccessory ? <div className={styles.composerAccessory}>{composerAccessory}</div> : null}
        {composer ?? <ReadOnlyComposer />}
      </div>
    </main>
  );
}

function ReadOnlyComposer() {
  return (
    <form className={styles.composer} aria-label="继续对话输入">
      <textarea
        className={styles.input}
        aria-label="继续输入"
        placeholder="要求后续变更"
        rows={1}
        disabled
      />
      <div className={styles.composerToolbar}>
        <span>发送能力将在后续 issue 接入</span>
        <button className={styles.sendButton} type="submit" aria-label="发送" disabled>
          <SendHorizontal size={17} />
        </button>
      </div>
    </form>
  );
}
