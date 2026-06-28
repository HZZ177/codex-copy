import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { runtimeBridge, type RuntimeBridge, type WsConnectionStatus } from "@/runtime";
import type { SelectedFile, SelectedQuote } from "@/renderer/components/chat/SendBox";
import { useRuntimeModelSelection, type RuntimeSelectedModel } from "@/renderer/components/model";
import { useAgentSessionController } from "@/renderer/hooks/useAgentSessionController";
import { useNotifications } from "@/renderer/providers/NotificationProvider";
import type { AgentActionEnvelope, AgentSession } from "@/types/protocol";

import { ChatLayout } from "./ChatLayout";
import { ConversationComposer } from "./ConversationComposer";
import { ConversationPanel, ConversationPanelComposerAccessory } from "./ConversationPanel";
import { useConversationPanelModel } from "./useConversationPanelModel";
import { ComposerApprovalCard } from "./ComposerApprovalCard";
import { consumeQuickChatSend } from "./quickSend";

export interface ConversationPageProps {
  threadId: string;
  runtime?: RuntimeBridge;
  initialModel?: RuntimeSelectedModel | null;
  quickSendId?: string;
  onOpenModelSettings?: () => void;
  onQuickSendConsumed?: () => void;
  onNavigateToConversation?: (threadId: string) => void;
}

export function ConversationPage({
  threadId,
  runtime = runtimeBridge,
  initialModel = null,
  quickSendId = "",
  onOpenModelSettings,
  onQuickSendConsumed,
  onNavigateToConversation,
}: ConversationPageProps) {
  const [allowPersistentTrust, setAllowPersistentTrust] = useState(true);
  const quickSendConsumedRef = useRef<string | null>(null);
  const scrollToBottomAfterSendRef = useRef<(() => void) | null>(null);
  const runtimeEventSideEffectsRef = useRef<(event: AgentActionEnvelope) => void>(() => undefined);
  const runtimeErrorRef = useRef<(reason: unknown) => boolean | void>(() => false);
  const notifications = useNotifications();
  const modelSelection = useRuntimeModelSelection(runtime, initialModel);
  const notifyRuntime = useCallback(
    (message: string, level: "error" | "warning") => {
      if (level === "warning") {
        notifications.warning(message);
      } else {
        notifications.error(message);
      }
    },
    [notifications],
  );
  const handleControllerRuntimeEvent = useCallback((event: AgentActionEnvelope) => {
    runtimeEventSideEffectsRef.current(event);
  }, []);
  const handleControllerRuntimeError = useCallback((reason: unknown) => runtimeErrorRef.current(reason), []);
  const controller = useAgentSessionController({
    runtime,
    sessionId: threadId,
    onRuntimeEvent: handleControllerRuntimeEvent,
    onRuntimeError: handleControllerRuntimeError,
    onNotice: notifyRuntime,
    onOpenModelSettings,
    onAfterSend: () => scrollToBottomAfterSendRef.current?.(),
  });
  const draft = controller.draft;
  const setDraft = controller.setDraft;
  const fileChipRequest = controller.fileChipRequest;
  const quoteChipRequest = controller.quoteChipRequest;
  const selectedSkill = controller.selectedSkill;
  const setSelectedSkill = controller.setSelectedSkill;
  const loading = controller.loading;
  const wsStatus = controller.wsStatus;

  const session = controller.session;
  const pendingApproval = controller.pendingApproval;
  const agentMessages = controller.agentMessages;
  const panelModel = useConversationPanelModel({
    runtime,
    sessionId: threadId,
    controller,
    registerPreviewHost: true,
    onBranchSessionCreated: onNavigateToConversation,
  });
  const runtimeState = panelModel.runtimeState;
  const title = session?.title || (threadId ? `对话 ${threadId}` : "对话");
  const connectionReady = controller.connectionReady;
  const canSend = controller.canSend;
  const canStop = controller.canStop;

  useEffect(() => {
    const providerId = session?.current_model_provider_id?.trim() ?? "";
    const model = session?.current_model?.trim() ?? "";
    if (providerId && model) {
      modelSelection.setSelectedModel({ providerId, model });
    }
  }, [session?.current_model_provider_id, session?.current_model]);

  const changeModel = useCallback(
    (selection: RuntimeSelectedModel | null) => {
      modelSelection.setSelectedModel(selection);
      if (!selection || !session?.id) {
        return;
      }
      void runtime.conversation
        .updateSession(session.id, {
          current_model_provider_id: selection.providerId,
          current_model: selection.model,
        })
        .then((updated) => {
          controller.dispatch({ type: "session/upsert", session: updated });
        })
        .catch((reason: unknown) => {
          notifications.error(errorMessage(reason));
        });
    },
    [controller, modelSelection, notifications, runtime, session?.id],
  );

  useEffect(() => {
    scrollToBottomAfterSendRef.current = panelModel.scrollToBottomAfterSend;
  }, [panelModel.scrollToBottomAfterSend]);

  useEffect(() => {
    runtimeEventSideEffectsRef.current = panelModel.handleRuntimeEventSideEffects;
    runtimeErrorRef.current = panelModel.handleRuntimeError;
  }, [panelModel.handleRuntimeError, panelModel.handleRuntimeEventSideEffects]);

  useEffect(() => {
    let active = true;
    void runtime.settings
      .getSettings()
      .then((settings) => {
        if (active) {
          setAllowPersistentTrust(settings.command.allow_persistent_trust);
        }
      })
      .catch(() => {
        if (active) {
          setAllowPersistentTrust(true);
        }
      });
    return () => {
      active = false;
    };
  }, [runtime]);

  const send = useCallback(
    (files: SelectedFile[] = [], quotes: SelectedQuote[] = []) =>
      controller.send(files, quotes, modelSelection.selectedModel),
    [controller, modelSelection.selectedModel],
  );

  useEffect(() => {
    if (!quickSendId || !threadId || loading || quickSendConsumedRef.current === quickSendId) {
      return;
    }
    if (agentMessages.length > 0) {
      quickSendConsumedRef.current = quickSendId;
      consumeQuickChatSend(quickSendId, threadId);
      onQuickSendConsumed?.();
      return;
    }
    if (!connectionReady) {
      return;
    }

    quickSendConsumedRef.current = quickSendId;
    const pending = consumeQuickChatSend(quickSendId, threadId);
    onQuickSendConsumed?.();
    if (!pending) {
      return;
    }
    void controller.sendText(pending.message, pending.model || modelSelection.selectedModel, {
      contextItems: pending.contextItems,
      runtimeParams: pending.runtimeParams,
    }).then((sent) => {
      if (!sent) {
        setDraft((current) => (current.trim() ? current : pending.message));
      }
    });
  }, [
    agentMessages.length,
    connectionReady,
    controller,
    loading,
    modelSelection.selectedModel,
    onQuickSendConsumed,
    quickSendId,
    setDraft,
    threadId,
  ]);

  return (
    <ChatLayout
      title={title}
      subtitle={conversationSubtitle(wsStatus, session)}
      composerAccessory={
        <ConversationPanelComposerAccessory model={panelModel} />
      }
      composer={
        pendingApproval ? (
          <ComposerApprovalCard
            allowPersistentTrust={allowPersistentTrust}
            approval={pendingApproval}
            error={controller.approvalError}
            submitting={controller.approvalSubmitting}
            onSubmit={controller.submitApproval}
          />
        ) : (
          <ConversationComposer
            value={draft}
            runtimeState={runtimeState}
            canSend={canSend}
            canStop={canStop}
            connectionReady={connectionReady}
            modelSelection={{ ...modelSelection, setSelectedModel: changeModel }}
            workspaceSkills={panelModel.workspaceSkills}
            selectedSkill={selectedSkill}
            onListWorkspaceDirectory={panelModel.listWorkspaceDirectory}
            onSearchWorkspace={panelModel.searchWorkspace}
            onOpenModelSettings={onOpenModelSettings}
            onChange={setDraft}
            onSkillChange={setSelectedSkill}
            onSend={send}
            onStop={controller.stop}
            onOpenFileReference={panelModel.openFileReference}
            externalFileRequest={fileChipRequest}
            externalQuoteRequest={quoteChipRequest}
          />
        )
      }
    >
      <ConversationPanel
        model={panelModel}
        workspaceRuntime={runtime}
        scrollButtonMode="external"
        emptyText="还没有消息，输入需求开始对话。"
        emptyTestId="conversation-empty"
      />
    </ChatLayout>
  );
}

function conversationSubtitle(status: WsConnectionStatus, session: AgentSession | null): string {
  const base = connectionSubtitle(status);
  if (session?.parent_session_id) {
    return `分支会话 · ${base}`;
  }
  if (session?.active_session_id && session.active_session_id !== session.id) {
    return `已切换到分支 · ${base}`;
  }
  return base;
}

function connectionSubtitle(status: WsConnectionStatus): string {
  switch (status) {
    case "open":
      return "本地 Python 智能体运行时";
    case "connecting":
    case "reconnecting":
      return "正在连接本地智能体运行时";
    case "error":
      return "智能体运行时连接异常";
    case "closed":
      return "智能体运行时已断开";
    case "idle":
      return "等待连接智能体运行时";
  }
}

function errorMessage(reason: unknown): string {
  if (reason instanceof Error && reason.message) {
    return reason.message;
  }
  if (reason && typeof reason === "object" && typeof (reason as { message?: unknown }).message === "string") {
    return (reason as { message: string }).message;
  }
  return "操作失败";
}

