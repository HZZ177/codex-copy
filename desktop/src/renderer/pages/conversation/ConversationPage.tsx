import { runtimeBridge, type RuntimeBridge } from "@/runtime";
import type { RuntimeSelectedModel } from "@/renderer/components/model";

import { ConversationSessionSurface } from "./ConversationSessionSurface";

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
  return (
    <ConversationSessionSurface
      threadId={threadId}
      runtime={runtime}
      initialModel={initialModel}
      quickSendId={quickSendId}
      onOpenModelSettings={onOpenModelSettings}
      onQuickSendConsumed={onQuickSendConsumed}
      onNavigateToConversation={onNavigateToConversation}
    />
  );
}
