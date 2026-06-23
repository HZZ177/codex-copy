import { ArrowDown, Check, ChevronsUpDown } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";

import { useRuntimeTypingMetrics } from "@/renderer/hooks/useRuntimeTypingSpeed";
import type { ConversationMessage } from "@/renderer/stores/conversationStore";

import { type FileChangePreview } from "./messages";
import { LineChangeTicker } from "./messages/LineChangeTicker";
import styles from "./ComposerAccessory.module.css";
import {
  buildActiveTurnFileChangeSummary,
  type TurnFileChangeItem,
  type TurnFileChangeSummary,
} from "./turnFileChangeSummary";

interface ComposerAccessoryStatusItem {
  active: boolean;
  description: string;
  id: string;
  label: string;
  node: ReactNode;
  priority: number;
}

export function ConversationComposerAccessory({
  messages,
  showScrollToBottom,
  onFilePreview,
  onScrollToBottom,
}: {
  messages: ConversationMessage[];
  showScrollToBottom: boolean;
  onFilePreview: (file: FileChangePreview) => void;
  onScrollToBottom: () => void;
}) {
  const runtimeTypingMetrics = useRuntimeTypingMetrics();
  const fileChangeSummary = useMemo(() => buildActiveTurnFileChangeSummary(messages), [messages]);
  const accessoryItems = useMemo<ComposerAccessoryStatusItem[]>(
    () => [
      {
        id: "turn-file-change-summary",
        active: fileChangeSummary.files.length > 0,
        description: fileChangeSummary.files.length > 0 ? "本轮文件变更统计" : "暂无文件变更",
        label: "文件变更",
        priority: 100,
        node: <TurnFileChangePill summary={fileChangeSummary} onFilePreview={onFilePreview} />,
      },
      {
        id: "runtime-typing-speed",
        active: true,
        description: "打字速度和待输出字符",
        label: "打字机",
        priority: 0,
        node: <TypingSpeedPill speed={runtimeTypingMetrics.speed} backlog={runtimeTypingMetrics.backlog} />,
      },
    ],
    [fileChangeSummary, onFilePreview, runtimeTypingMetrics.backlog, runtimeTypingMetrics.speed],
  );
  const activeItems = useMemo(
    () => accessoryItems.filter((item) => item.active).sort((left, right) => right.priority - left.priority),
    [accessoryItems],
  );
  const autoSelectedId = activeItems[0]?.id ?? "runtime-typing-speed";
  const [manualSelectedId, setManualSelectedId] = useState<string | null>(null);
  const previousAutoSelectedId = useRef(autoSelectedId);

  useEffect(() => {
    if (previousAutoSelectedId.current === autoSelectedId) {
      return;
    }
    previousAutoSelectedId.current = autoSelectedId;
    setManualSelectedId(null);
  }, [autoSelectedId]);

  useEffect(() => {
    if (!manualSelectedId) {
      return;
    }
    if (!accessoryItems.some((item) => item.id === manualSelectedId && item.active)) {
      setManualSelectedId(null);
    }
  }, [accessoryItems, manualSelectedId]);

  const manualSelectedItem = manualSelectedId
    ? accessoryItems.find((item) => item.id === manualSelectedId && item.active)
    : null;
  const selectedItem = manualSelectedItem ?? activeItems[0] ?? accessoryItems[0];

  return (
    <div className={styles.composerAccessoryBar} aria-label="输入框状态">
      <span className={styles.composerAccessoryItem}>
        <span className={styles.accessoryShell} data-selected-item={selectedItem.id}>
          <ComposerAccessorySwitcher
            items={accessoryItems}
            selectedItemId={selectedItem.id}
            onSelect={setManualSelectedId}
          />
          <span className={styles.accessoryContent}>{selectedItem.node}</span>
        </span>
      </span>
      <button
        className={styles.scrollBottomButton}
        type="button"
        aria-label="滚动到底"
        title="滚动到底"
        disabled={!showScrollToBottom}
        onClick={onScrollToBottom}
      >
        <ArrowDown size={15} />
      </button>
    </div>
  );
}

function ComposerAccessorySwitcher({
  items,
  selectedItemId,
  onSelect,
}: {
  items: ComposerAccessoryStatusItem[];
  selectedItemId: string;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <span className={styles.accessorySwitch} ref={rootRef}>
      <button
        className={styles.accessorySwitchButton}
        type="button"
        aria-label="切换胶囊信息"
        aria-expanded={open}
        aria-haspopup="menu"
        data-open={open ? "true" : "false"}
        onClick={() => setOpen((value) => !value)}
      >
        <ChevronsUpDown size={13} />
      </button>
      <div
        className={styles.accessoryMenu}
        role="menu"
        aria-hidden={!open}
        data-open={open ? "true" : "false"}
        data-testid="composer-accessory-menu"
      >
        {items.map((item) => {
          const selected = item.id === selectedItemId;
          return (
            <button
              className={styles.accessoryMenuItem}
              type="button"
              role="menuitemradio"
              aria-checked={selected}
              disabled={!item.active}
              tabIndex={open ? 0 : -1}
              key={item.id}
              onClick={() => {
                if (!item.active) {
                  return;
                }
                onSelect(item.id);
                setOpen(false);
              }}
            >
              <span className={styles.accessoryMenuCheck} aria-hidden="true">
                {selected ? <Check size={13} /> : null}
              </span>
              <span className={styles.accessoryMenuText}>
                <span className={styles.accessoryMenuLabel}>{item.label}</span>
                <span className={styles.accessoryMenuDescription}>{item.description}</span>
              </span>
            </button>
          );
        })}
      </div>
    </span>
  );
}

function TypingSpeedPill({ speed, backlog }: { speed: number; backlog: number }) {
  return (
    <span className={styles.typingSpeedPill} data-testid="typing-speed-pill">
      打字机 {speed} 字符/s - 待输出 {backlog} 字
    </span>
  );
}

function TurnFileChangePill({
  summary,
  onFilePreview,
}: {
  summary: TurnFileChangeSummary;
  onFilePreview: (file: FileChangePreview) => void;
}) {
  return (
    <div className={styles.fileChangePillWrap}>
      <span className={`${styles.typingSpeedPill} ${styles.fileChangeSummaryPill}`} data-testid="file-change-summary-pill">
        <span className={styles.fileChangeSummaryText}>
          本轮共创建了 {summary.createdCount} 个文件，编辑了 {summary.editedCount} 个文件
        </span>
        <LineChangeTicker
          className={styles.composerLineTicker}
          label=""
          added={summary.additions}
          removed={summary.deletions}
          unit=""
        />
      </span>
      <div className={styles.fileChangeHoverCard} role="tooltip" data-testid="file-change-summary-card">
        <header className={styles.fileChangeCardHeader}>
          <span>本轮文件变更</span>
          <LineChangeTicker
            className={styles.cardLineTicker}
            label="共"
            added={summary.additions}
            removed={summary.deletions}
            unit=""
          />
        </header>
        <div className={styles.fileChangeCardStats}>
          <span>创建 {summary.createdCount}</span>
          <span>编辑 {summary.editedCount}</span>
        </div>
        <ul className={styles.fileChangeCardList}>
          {summary.files.map((file) => (
            <TurnFileChangeRow file={file} key={`${file.kind}:${file.path}`} onFilePreview={onFilePreview} />
          ))}
        </ul>
      </div>
    </div>
  );
}

function TurnFileChangeRow({
  file,
  onFilePreview,
}: {
  file: TurnFileChangeItem;
  onFilePreview: (file: FileChangePreview) => void;
}) {
  return (
    <li className={styles.fileChangeCardRow}>
      <span className={styles.fileChangeKind} data-kind={file.kind}>
        {file.kind === "created" ? "创建" : "编辑"}
      </span>
      <button
        className={styles.fileChangePathButton}
        type="button"
        onClick={() => onFilePreview({ path: file.path, diff: file.diff })}
      >
        {file.path}
      </button>
      <LineChangeTicker
        className={styles.cardFileLineTicker}
        label=""
        added={file.additions}
        removed={file.deletions}
        unit=""
      />
    </li>
  );
}
