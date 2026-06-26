import { ChevronUp, PanelRightOpen, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  type RuntimeBridge,
  type WorkspaceEntry,
  type WorkspaceSearchResult,
  type WorkspaceSkillSummary,
} from "@/runtime";
import { SendBox, type SelectedFile, type SelectedQuote } from "@/renderer/components/chat/SendBox";
import { RuntimeModelSelector, useRuntimeModelSelection } from "@/renderer/components/model";
import { useWorkspaceSkills } from "@/renderer/hooks/useWorkspaceSkills";
import { useLayoutState } from "@/renderer/hooks/layout/LayoutStateProvider";
import type { AgentSessionController } from "@/renderer/hooks/useAgentSessionController";
import type { ConversationRuntimeState } from "@/renderer/stores/conversationStore";
import type {
  AgentChatMessage,
  CommandApprovalRequest,
  Workspace,
} from "@/types/protocol";

import styles from "./WorkbenchAssistantSurface.module.css";

type AssistantSurfaceMode = "capsule" | "expanded" | "drawer";

export interface WorkbenchAssistantSurfaceProps {
  runtime: RuntimeBridge;
  workspaceId: string;
  workspace?: Workspace | null;
  controller: AgentSessionController;
  creatingSession?: boolean;
}

export function WorkbenchAssistantSurface({
  runtime,
  workspaceId,
  workspace,
  controller,
  creatingSession = false,
}: WorkbenchAssistantSurfaceProps) {
  const layout = useLayoutState();
  const [surfaceMode, setSurfaceMode] = useState<AssistantSurfaceMode>("capsule");
  const modelSelection = useRuntimeModelSelection(runtime, "");
  const workspaceSkillScope = useMemo(() => ({ workspaceId }), [workspaceId]);
  const { state: workspaceSkillsState } = useWorkspaceSkills({
    runtime,
    scope: workspaceSkillScope,
    enabled: Boolean(workspaceId),
  });
  const workspaceSkills = workspaceSkillsState.skills;
  const pendingApproval = controller.pendingApproval;
  const projectedMessages = useMemo(() => controller.agentMessages.map(projectAgentMessage), [controller.agentMessages]);
  const runtimeState = controller.runtimeState;
  const connectionReady = controller.connectionReady;
  const canSend = controller.canSend && !creatingSession && Boolean(workspaceId);
  const canStop = controller.canStop;
  const selectedModel = modelSelection.selectedModel.trim();
  const workspaceLabel = workspace?.root_path ?? workspace?.name ?? workspaceId;
  const drawerWidth = layout.state.workbenchAssistantDrawerWidth;

  useEffect(() => {
    setSurfaceMode("capsule");
  }, [workspaceId]);

  useEffect(() => {
    if (pendingApproval) {
      setSurfaceMode("drawer");
    }
  }, [pendingApproval]);

  useEffect(() => {
    if (
      controller.selectedSkill &&
      !workspaceSkills.some(
        (skill) => skill.name === controller.selectedSkill?.name && skill.source === controller.selectedSkill?.source,
      )
    ) {
      controller.setSelectedSkill(null);
    }
  }, [controller, workspaceSkills]);

  const searchWorkspace = useCallback(
    (query: string, options?: { signal?: AbortSignal }) => runtime.workspace.search({ workspaceId }, query, options),
    [runtime, workspaceId],
  );

  const listWorkspaceDirectory = useCallback(
    (path: string) =>
      runtime.workspace
        .listDirectory({ workspaceId }, path)
        .then((response) => workspaceEntriesToSearchResults(response.entries)),
    [runtime, workspaceId],
  );

  const send = useCallback(
    (files: SelectedFile[] = [], quotes: SelectedQuote[] = []) => controller.send(files, quotes, selectedModel),
    [controller, selectedModel],
  );

  const submitApproval = useCallback(
    (approved: boolean) =>
      controller.submitApproval({
        decision: approved ? "approved" : "rejected",
        trust_scope: "once",
      }),
    [controller],
  );

  const composer = (
    <WorkbenchComposer
      value={controller.draft}
      runtimeState={creatingSession ? "starting" : runtimeState}
      canSend={canSend}
      canStop={canStop}
      connectionReady={connectionReady}
      modelSelection={modelSelection}
      workspaceSkills={workspaceSkills}
      selectedSkill={controller.selectedSkill}
      fileChipRequest={controller.fileChipRequest}
      quoteChipRequest={controller.quoteChipRequest}
      surfaceMode={surfaceMode}
      onChange={controller.setDraft}
      onSkillChange={controller.setSelectedSkill}
      onSend={send}
      onStop={controller.stop}
      onExpand={() => setSurfaceMode(surfaceMode === "expanded" ? "capsule" : "expanded")}
      onDock={() => setSurfaceMode("drawer")}
      onSearchWorkspace={searchWorkspace}
      onListWorkspaceDirectory={listWorkspaceDirectory}
    />
  );

  return (
    <div
      className={styles.surface}
      data-testid="workbench-assistant-surface"
      data-surface-mode={surfaceMode}
      data-running={runtimeState === "running" ? "true" : "false"}
      data-pending-approval={pendingApproval ? "true" : "false"}
    >
      {surfaceMode === "expanded" ? (
        <div className={styles.expandedLayer} data-testid="workbench-expanded-layer">
          <WorkbenchMessageProjection
            messages={projectedMessages}
            runtimeDetail={controller.runtimeDetail}
            workspaceLabel={workspaceLabel}
          />
          {pendingApproval ? (
            <WorkbenchApprovalPrompt
              approval={pendingApproval}
              error={controller.approvalError}
              submitting={controller.approvalSubmitting}
              onSubmit={submitApproval}
            />
          ) : null}
        </div>
      ) : null}
      {surfaceMode === "drawer" ? (
        <aside
          className={styles.drawer}
          data-testid="workbench-assistant-drawer"
          aria-label="工作台助手"
          style={{ width: drawerWidth }}
        >
          <header className={styles.drawerHeader}>
            <span>助手</span>
            <button type="button" aria-label="关闭工作台助手侧栏" onClick={() => setSurfaceMode("capsule")}>
              <X size={15} />
            </button>
          </header>
          <WorkbenchMessageProjection
            messages={projectedMessages}
            runtimeDetail={controller.runtimeDetail}
            workspaceLabel={workspaceLabel}
          />
          {pendingApproval ? (
            <WorkbenchApprovalPrompt
              approval={pendingApproval}
              error={controller.approvalError}
              submitting={controller.approvalSubmitting}
              onSubmit={submitApproval}
            />
          ) : null}
          <div className={styles.drawerComposer}>{composer}</div>
        </aside>
      ) : null}
      {surfaceMode !== "drawer" ? <div className={styles.capsule}>{composer}</div> : null}
    </div>
  );
}

function WorkbenchApprovalPrompt({
  approval,
  error,
  submitting,
  onSubmit,
}: {
  approval: CommandApprovalRequest;
  error: string | null;
  submitting: boolean;
  onSubmit: (approved: boolean) => void;
}) {
  return (
    <section className={styles.approvalPrompt} data-testid="workbench-approval-prompt" aria-label="工作台审批">
      <strong>{approval.title || "需要批准"}</strong>
      <p>{approval.description || approval.tool_name || "Agent 需要你确认后继续。"}</p>
      {error ? <p className={styles.approvalError} role="alert">{error}</p> : null}
      <div className={styles.approvalActions}>
        <button type="button" disabled={submitting} onClick={() => onSubmit(false)}>
          拒绝
        </button>
        <button type="button" disabled={submitting} data-primary="true" onClick={() => onSubmit(true)}>
          批准
        </button>
      </div>
    </section>
  );
}

function WorkbenchComposer({
  value,
  runtimeState,
  canSend,
  canStop,
  connectionReady,
  modelSelection,
  workspaceSkills,
  selectedSkill,
  fileChipRequest,
  quoteChipRequest,
  surfaceMode,
  onChange,
  onSkillChange,
  onSend,
  onStop,
  onExpand,
  onDock,
  onSearchWorkspace,
  onListWorkspaceDirectory,
}: {
  value: string;
  runtimeState: ConversationRuntimeState;
  canSend: boolean;
  canStop: boolean;
  connectionReady: boolean;
  modelSelection: ReturnType<typeof useRuntimeModelSelection>;
  workspaceSkills: WorkspaceSkillSummary[];
  selectedSkill: WorkspaceSkillSummary | null;
  fileChipRequest: AgentSessionController["fileChipRequest"];
  quoteChipRequest: AgentSessionController["quoteChipRequest"];
  surfaceMode: AssistantSurfaceMode;
  onChange: (value: string) => void;
  onSkillChange: (skill: WorkspaceSkillSummary | null) => void;
  onSend: (files?: SelectedFile[], quotes?: SelectedQuote[]) => boolean | void | Promise<boolean | void>;
  onStop: () => void;
  onExpand: () => void;
  onDock: () => void;
  onSearchWorkspace: (query: string, options?: { signal?: AbortSignal }) => Promise<WorkspaceSearchResult[]>;
  onListWorkspaceDirectory: (path: string) => Promise<WorkspaceSearchResult[]>;
}) {
  return (
    <SendBox
      value={value}
      runtimeState={runtimeState}
      canSend={canSend}
      canStop={canStop}
      ariaLabel="工作台助手表单"
      inputLabel="工作台助手输入"
      placeholder="要求后续变更"
      statusText={composerStatusText(runtimeState, connectionReady)}
      variant="keydex"
      className={styles.composer}
      controls={
        <>
          <button
            className={styles.iconButton}
            type="button"
            aria-label={surfaceMode === "expanded" ? "收起工作台消息层" : "展开工作台消息层"}
            title={surfaceMode === "expanded" ? "收起消息" : "展开消息"}
            onClick={onExpand}
          >
            <ChevronUp size={15} />
          </button>
          <button
            className={styles.iconButton}
            type="button"
            aria-label="停靠到工作台右侧助手栏"
            title="停靠到右侧"
            onClick={onDock}
          >
            <PanelRightOpen size={15} />
          </button>
        </>
      }
      rightControls={
        <RuntimeModelSelector
          model={modelSelection.selectedModel}
          modelOptions={modelSelection.modelOptions}
          modelLoadState={modelSelection.modelLoadState}
          modelError={modelSelection.modelError}
          disabled={isBusy(runtimeState)}
          placement="top"
          onModelChange={modelSelection.setSelectedModel}
        />
      }
      allowFileSelection
      externalFileRequest={fileChipRequest}
      externalQuoteRequest={quoteChipRequest}
      workspaceSkills={workspaceSkills}
      selectedSkill={selectedSkill}
      onChange={onChange}
      onSkillChange={onSkillChange}
      onSend={onSend}
      onStop={onStop}
      onSearchWorkspace={onSearchWorkspace}
      onListWorkspaceDirectory={onListWorkspaceDirectory}
    />
  );
}

function WorkbenchMessageProjection({
  messages,
  runtimeDetail,
  workspaceLabel,
}: {
  messages: ProjectedMessage[];
  runtimeDetail: string | null;
  workspaceLabel: string;
}) {
  const visibleMessages = messages.slice(-8);
  return (
    <div className={styles.messages} data-testid="workbench-message-projection" aria-label="工作台助手消息">
      {visibleMessages.length ? (
        visibleMessages.map((message) => (
          <article className={styles.messageBubble} data-role={message.role} key={message.id}>
            <span>{message.label}</span>
            <p>{message.content}</p>
          </article>
        ))
      ) : (
        <article className={styles.messageBubble} data-role="status">
          <span>{workspaceLabel}</span>
          <p>当前工作空间还没有助手消息。</p>
        </article>
      )}
      {runtimeDetail ? (
        <article className={styles.messageBubble} data-role="error" role="alert">
          <span>运行状态</span>
          <p>{runtimeDetail}</p>
        </article>
      ) : null}
    </div>
  );
}

interface ProjectedMessage {
  id: string;
  role: "user" | "assistant" | "tool" | "status" | "error";
  label: string;
  content: string;
}

function projectAgentMessage(message: AgentChatMessage): ProjectedMessage {
  if (message.role === "user") {
    return { id: message.id, role: "user", label: "你", content: message.content || "已发送上下文" };
  }
  if (message.role === "assistant") {
    return { id: message.id, role: "assistant", label: "Agent", content: message.content || "正在整理回复" };
  }
  if (message.role === "tool") {
    return {
      id: message.id,
      role: "tool",
      label: message.toolName || "工具调用",
      content: message.toolError || message.toolResult || message.content || "工具正在运行",
    };
  }
  if (message.role === "error") {
    return { id: message.id, role: "error", label: "错误", content: message.content || "执行失败" };
  }
  return { id: message.id, role: "status", label: message.role, content: message.content || "状态更新" };
}

function workspaceEntriesToSearchResults(entries: WorkspaceEntry[]): WorkspaceSearchResult[] {
  return entries.map((entry) => ({
    path: entry.path,
    name: entry.name,
    type: entry.type,
  }));
}

function isBusy(state: ConversationRuntimeState): boolean {
  return state === "starting" || state === "running" || state === "waiting_approval" || state === "cancelling";
}

function composerStatusText(state: ConversationRuntimeState, connectionReady: boolean): string {
  if (!connectionReady) {
    return "正在连接后端";
  }
  if (state === "idle" || state === "running") {
    return "";
  }
  if (state === "starting") {
    return "正在发起对话";
  }
  if (state === "waiting_approval") {
    return "等待审批确认";
  }
  if (state === "cancelling") {
    return "正在停止";
  }
  return "可以修改后重新发送";
}
