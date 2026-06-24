import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef } from "react";

import type { WorkspaceSearchResult } from "@/runtime";
import { useMaterialEntryIcon } from "@/renderer/components/workspace/materialIconTheme";

import styles from "./AtFileMenu.module.css";

export interface AtFileMenuProps {
  results: WorkspaceSearchResult[];
  activeIndex: number;
  loading?: boolean;
  error?: string | null;
  hint?: string | null;
  directoryPath?: string | null;
  query: string;
  onNavigateDirectory?: (path: string) => void;
  onSelect: (result: WorkspaceSearchResult) => void;
}

export function AtFileMenu({
  results,
  activeIndex,
  loading = false,
  error = null,
  hint = null,
  directoryPath = null,
  query,
  onNavigateDirectory,
  onSelect,
}: AtFileMenuProps) {
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const browsing = directoryPath !== null;
  const loadingText = browsing
    ? directoryPath
      ? "正在读取目录"
      : "正在读取工作区文件"
    : query
      ? "正在搜索工作区"
      : "正在读取工作区文件";
  const emptyText = browsing ? "目录为空" : query ? "没有匹配的文件" : "工作区没有可引用文件";
  const directoryLabel = directoryPath ? `工作区 / ${directoryPath}` : "工作区";
  const headerLabel = browsing ? directoryLabel : query ? `搜索 ${query}` : "工作区文件";

  useEffect(() => {
    const activeOption = bodyRef.current?.querySelector<HTMLElement>('[data-active="true"]');
    activeOption?.scrollIntoView?.({ block: "nearest" });
  }, [activeIndex, directoryPath, error, loading, results]);

  return (
    <div className={styles.menu} role="listbox" aria-label="文件引用菜单" data-testid="at-file-menu">
      <div className={styles.header} aria-label="当前引用目录">
        {browsing && directoryPath ? (
          <button
            className={styles.backButton}
            type="button"
            aria-label="返回上一级目录"
            onMouseDown={(event) => {
              event.preventDefault();
              onNavigateDirectory?.(parentPath(directoryPath));
            }}
          >
            <ChevronLeft size={14} />
          </button>
        ) : (
          <span className={styles.backSpacer} />
        )}
        <span>{headerLabel}</span>
      </div>

      <div ref={bodyRef} className={styles.body}>
        {loading ? <div className={styles.empty}>{loadingText}</div> : null}
        {!loading && error ? <div className={styles.error}>{error}</div> : null}
        {!loading && !error && hint ? <div className={styles.empty}>{hint}</div> : null}
        {!loading && !error && !hint && !results.length ? <div className={styles.empty}>{emptyText}</div> : null}
        {!loading && !error && !hint
          ? results.map((result, index) => (
              <button
                className={styles.item}
                type="button"
                role="option"
                aria-label={result.type === "directory" ? `打开目录 ${result.path}` : `选择文件 ${result.path}`}
                aria-selected={activeIndex === index}
                data-active={activeIndex === index ? "true" : "false"}
                data-kind={result.type}
                key={result.path}
                onMouseDown={(event) => {
                  event.preventDefault();
                  onSelect(result);
                }}
              >
                <span className={styles.icon} aria-hidden="true">
                  <MaterialEntryIcon path={result.path || result.name} type={result.type} />
                </span>
                <span className={styles.text}>
                  <strong>{result.name}</strong>
                  <span>{result.path}</span>
                </span>
                {result.type === "directory" ? <ChevronRight className={styles.enterIcon} size={13} /> : null}
              </button>
            ))
          : null}
      </div>
    </div>
  );
}

function parentPath(path: string): string {
  const parts = path.split("/").filter(Boolean);
  parts.pop();
  return parts.join("/");
}

function MaterialEntryIcon({
  path,
  type,
}: {
  path: string;
  type: WorkspaceSearchResult["type"];
}) {
  const icon = useMaterialEntryIcon(path, type === "directory" ? "directory" : "file");
  return (
    <img
      alt=""
      aria-hidden="true"
      className={styles.materialIcon}
      data-icon-id={icon.id}
      draggable={false}
      src={icon.src}
    />
  );
}
