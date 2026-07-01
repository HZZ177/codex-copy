import styles from "./ProjectModePage.module.css";

export function ProjectModePage() {
  return (
    <main className={styles.root} data-testid="project-mode-page" aria-label="项目模式">
      <div className={styles.message}>功能开发中，敬请期待</div>
    </main>
  );
}
